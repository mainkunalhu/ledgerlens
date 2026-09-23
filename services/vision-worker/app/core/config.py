from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ledgerlens-worker"
    groq_api_key: str = ""
    groq_vision_model: str = "qwen/qwen3.8-27b"
    groq_vision_fallback: str = "meta-llama/llama-4-maverick-17b-128e-instruct"
    groq_structure_model: str = "openai/gpt-oss-120b"
    max_image_mb: int = 20

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
