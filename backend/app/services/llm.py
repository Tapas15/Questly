from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import settings


class LLMError(RuntimeError):
    pass


async def generate_json(system: str, user: str) -> tuple[dict[str, Any], str, str]:
    provider = settings.llm_provider.lower().strip()
    if provider == "ollama":
        content, model = await _ollama(system, user)
        return _parse_json(content), "ollama", model
    if provider in {"openai_compatible", "openai"}:
        content, model = await _openai_compatible(system, user)
        return _parse_json(content), "openai_compatible", model
    raise LLMError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")


async def _ollama(system: str, user: str) -> tuple[str, str]:
    url = settings.ollama_base_url.rstrip("/") + "/api/chat"
    payload = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2},
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            r = await client.post(url, json=payload)
            if r.status_code == 404:
                detail = r.text
                try:
                    detail = r.json().get("error", detail)
                except Exception:
                    pass
                raise LLMError(f"Ollama model/API not found at {url}: {detail}. Check OLLAMA_BASE_URL and OLLAMA_MODEL (run `ollama list`).")
            r.raise_for_status()
        except LLMError:
            raise
        except Exception as e:
            raise LLMError(f"Ollama request failed: {e}") from e
    data = r.json()
    content = data.get("message", {}).get("content", "")
    if not content:
        raise LLMError("Ollama returned empty content")
    return content, settings.ollama_model


async def _openai_compatible(system: str, user: str) -> tuple[str, str]:
    if not settings.llm_base_url:
        raise LLMError("LLM_BASE_URL is required for openai_compatible provider")
    if not settings.llm_api_key:
        raise LLMError("LLM_API_KEY is required for openai_compatible provider")
    url = settings.llm_base_url.rstrip("/") + "/chat/completions"
    headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
        except Exception as e:
            raise LLMError(f"LLM request failed: {e}") from e
    data = r.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except Exception as e:
        raise LLMError(f"Unexpected LLM response: {data}") from e
    return content, settings.llm_model


def _parse_json(content: str) -> dict[str, Any]:
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:].strip()
    try:
        return json.loads(content)
    except Exception:
        # attempt to extract object
        start = content.find("{")
        end = content.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(content[start : end + 1])
        raise LLMError("LLM did not return valid JSON")
