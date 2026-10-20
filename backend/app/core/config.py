import os
from typing import List


class Settings:
    PROJECT_NAME: str = "MapToCode API"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = os.getenv("API_V1_PREFIX", "/api/v1")
    
    _raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    ALLOWED_ORIGINS: List[str] = [origin.strip() for origin in _raw_origins.split(",") if origin.strip()]


settings = Settings()
