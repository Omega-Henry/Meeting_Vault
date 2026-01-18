"""
Logging Configuration Module

Implements structured logging with JSON output for production-ready debugging.
Uses structlog for structured log entries with context injection.
"""
import logging
import sys
from typing import Any, Dict

import structlog
from structlog.types import EventDict, WrappedLogger

def add_app_context(logger: WrappedLogger, method_name: str, event_dict: EventDict) -> EventDict:
    """Add application context to all log entries."""
    event_dict["app"] = "zoom_digester"
    event_dict["environment"] = "production"  # Override via env var
    return event_dict


def configure_logging(log_level: str = "INFO", json_logs: bool = True) -> None:
    """
    Configure structured logging for the application.
    
    Args:
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        json_logs: If True, output JSON format. If False, use console-friendly format.
    """
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper()),
    )
    
    # Silence noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    
    # Build structlog processor chain
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        add_app_context,
    ]
    
    if json_logs:
        # Production: JSON output
        processors.append(structlog.processors.format_exc_info)
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Development: Console-friendly output
        processors.append(structlog.dev.ConsoleRenderer())
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.
    
    Usage:
        logger = get_logger(__name__)
        logger.info("user_created", user_id=user.id, email=user.email)
    """
    return structlog.get_logger(name)
