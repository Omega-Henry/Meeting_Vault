from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    
    # LLM Configuration
    LLM_MODEL: str = "openai/gpt-4o-mini"  # Primary model (OpenRouter format)
    LLM_FALLBACK_MODEL: str = "openai/gpt-3.5-turbo"  # Fallback model if primary fails
    
    # Rate Limiting (requests per second)
    LLM_RATE_LIMIT_RPS: float = 0.5  # 1 request every 2 seconds
    LLM_RATE_LIMIT_BURST: int = 10  # Allow burst capacity
    
    # Retry Configuration
    LLM_MAX_RETRIES: int = 3
    LLM_RETRY_INITIAL_DELAY: float = 1.0  # seconds
    LLM_RETRY_BACKOFF_FACTOR: float = 2.0
    LLM_RETRY_MAX_DELAY: float = 60.0  # seconds
    
    # Timeouts
    LLM_REQUEST_TIMEOUT: int = 120  # seconds per request
    EXTRACTION_TIMEOUT: int = 300  # seconds for full extraction pipeline
    
    ADMIN_EMAIL: str = ""  # Single admin email
    ADMIN_EMAILS: str = ""  # Comma-separated list (legacy support)
    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
