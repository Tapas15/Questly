import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            os.environ.setdefault(key, value.strip())


load_dotenv(Path(__file__).with_name(".env"))

from openai import OpenAI

api_key = os.environ.get("KILOCODE_API_KEY") or os.environ["LLM_API_KEY"]
base_url = os.environ.get("KILOCODE_BASE_URL") or os.environ.get("LLM_BASE_URL") or "https://api.kilo.ai/api/gateway"
model = os.environ.get("KILOCODE_MODEL") or os.environ.get("LLM_MODEL") or "kilo-auto/free"

client = OpenAI(
    api_key=api_key,
    base_url=base_url,
)

response = client.chat.completions.create(
    model=model.removeprefix("openai/"),
    messages=[
        {"role": "user", "content": "Why is the sky blue?"}
    ],
)

print(response.choices[0].message.content)
