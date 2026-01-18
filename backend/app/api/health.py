"""
Health Check Endpoints

Provides health and readiness endpoints for load balancers and monitoring.
"""
from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging

from app.dependencies import get_service_role_client

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check() -> Dict[str, str]:
    """
    Basic health check endpoint.
    Returns 200 if the service is running.
    """
    return {"status": "ok", "service": "zoom_digester"}


@router.get("/readiness")
async def readiness_check() -> Dict[str, Any]:
    """
    Readiness check for Kubernetes/load balancers.
    Verifies critical dependencies (database connection).
    """
    checks = {
        "status": "ready",
        "checks": {}
    }
    
    # Test database connection
    try:
        client = get_service_role_client()
        # Simple query to verify connection
        result = client.table("contacts").select("id").limit(1).execute()
        checks["checks"]["database"] = "ok"
    except Exception as e:
        logger.error(f"Database readiness check failed: {e}")
        checks["checks"]["database"] = f"error: {str(e)}"
        checks["status"] = "not_ready"
        raise HTTPException(status_code=503, detail=checks)
    
    return checks
