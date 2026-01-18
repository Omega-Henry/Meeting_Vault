from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging_config import configure_logging, get_logger

import logging

# Configure Structured Logging
configure_logging(
    log_level=settings.LOG_LEVEL if hasattr(settings, "LOG_LEVEL") else "INFO",
    json_logs=settings.JSON_LOGS if hasattr(settings, "JSON_LOGS") else False
)
logger = get_logger(__name__)

logger.info("application_starting", app_name="MeetingVault API", environment="production")

app = FastAPI(title="MeetingVault API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import (
    upload, assistant, chats, directory, change_requests, 
    users, admin, feedback, claims, requests, services, profiles, health
)

# Health endpoints (no prefix for standard paths)
app.include_router(health.router, tags=["Health"])

# API endpoints
app.include_router(upload.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(chats.router, prefix="/api")
app.include_router(directory.router, prefix="/api/directory", tags=["Directory"])
app.include_router(change_requests.router, prefix="/api/change-requests", tags=["Change Requests"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(claims.router, prefix="/api/claims", tags=["Claims"])
app.include_router(requests.router, prefix="/api/requests", tags=["Requests"])
app.include_router(services.router, prefix="/api/services", tags=["Services"])
app.include_router(profiles.router, prefix="/api/profiles", tags=["Profiles"])
