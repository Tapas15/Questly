from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI Questionnaire"
    database_url: str = "sqlite:///./backend/data/app.db"
    admin_token: str = "changeme"
    frontend_origin: str = "http://localhost:5173"

    llm_provider: str = "ollama"  # ollama | openai_compatible
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = "gpt-4o-mini"

    public_base_url: str = "http://localhost:5173"


settings = Settings()
