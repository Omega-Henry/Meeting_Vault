"""
LLM Factory - Centralized LLM instantiation with retry, rate limiting, and fallback.

This module provides a single source of truth for LLM configuration across the application.
All LLM calls should use get_llm() or get_structured_llm() from this module.
"""
import asyncio
import logging
from typing import TypeVar, Type, Optional, Any
from functools import wraps

from langchain_openai import ChatOpenAI
from langchain_core.rate_limiters import InMemoryRateLimiter
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)

# Singleton rate limiter instance (shared across all LLM calls)
_rate_limiter: Optional[InMemoryRateLimiter] = None


def get_rate_limiter() -> InMemoryRateLimiter:
    """Get or create the singleton rate limiter."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = InMemoryRateLimiter(
            requests_per_second=settings.LLM_RATE_LIMIT_RPS,
            check_every_n_seconds=0.1,
            max_bucket_size=settings.LLM_RATE_LIMIT_BURST,
        )
        logger.info(
            f"Rate limiter initialized: {settings.LLM_RATE_LIMIT_RPS} RPS, "
            f"burst={settings.LLM_RATE_LIMIT_BURST}"
        )
    return _rate_limiter


def get_llm(
    model: Optional[str] = None,
    temperature: float = 0,
    timeout: Optional[int] = None,
    with_rate_limit: bool = True,
) -> ChatOpenAI:
    """
    Get a configured ChatOpenAI instance.
    
    Args:
        model: Model name (defaults to settings.LLM_MODEL)
        temperature: Sampling temperature (0 = deterministic)
        timeout: Request timeout in seconds
        with_rate_limit: Whether to apply rate limiting
    
    Returns:
        Configured ChatOpenAI instance
    """
    if not settings.OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY not configured")
    
    kwargs = {
        "model": model or settings.LLM_MODEL,
        "api_key": settings.OPENROUTER_API_KEY,
        "base_url": settings.OPENROUTER_BASE_URL,
        "temperature": temperature,
        "request_timeout": timeout or settings.LLM_REQUEST_TIMEOUT,
    }
    
    if with_rate_limit:
        kwargs["rate_limiter"] = get_rate_limiter()
    
    return ChatOpenAI(**kwargs)


def get_structured_llm(
    schema: Type[T],
    model: Optional[str] = None,
    temperature: float = 0,
    timeout: Optional[int] = None,
    with_rate_limit: bool = True,
) -> Any:
    """
    Get a ChatOpenAI instance configured for structured output.
    
    Args:
        schema: Pydantic model for structured output
        model: Model name (defaults to settings.LLM_MODEL)
        temperature: Sampling temperature
        timeout: Request timeout in seconds
        with_rate_limit: Whether to apply rate limiting
    
    Returns:
        ChatOpenAI instance with .with_structured_output() applied
    """
    llm = get_llm(
        model=model,
        temperature=temperature,
        timeout=timeout,
        with_rate_limit=with_rate_limit,
    )
    return llm.with_structured_output(schema)


async def invoke_with_retry(
    llm_or_chain: Any,
    input_data: Any,
    max_retries: Optional[int] = None,
    initial_delay: Optional[float] = None,
    backoff_factor: Optional[float] = None,
    max_delay: Optional[float] = None,
) -> Any:
    """
    Invoke an LLM or chain with exponential backoff retry.
    
    Args:
        llm_or_chain: LLM instance or chain to invoke
        input_data: Input to pass to the LLM/chain
        max_retries: Maximum retry attempts (defaults to settings)
        initial_delay: Initial delay between retries
        backoff_factor: Multiplier for each retry delay
        max_delay: Maximum delay cap
    
    Returns:
        LLM response
    
    Raises:
        Last exception if all retries fail
    """
    _max_retries = max_retries or settings.LLM_MAX_RETRIES
    _initial_delay = initial_delay or settings.LLM_RETRY_INITIAL_DELAY
    _backoff_factor = backoff_factor or settings.LLM_RETRY_BACKOFF_FACTOR
    _max_delay = max_delay or settings.LLM_RETRY_MAX_DELAY
    
    last_exception = None
    
    for attempt in range(_max_retries + 1):
        try:
            # Use async invoke if available
            if hasattr(llm_or_chain, 'ainvoke'):
                return await llm_or_chain.ainvoke(input_data)
            else:
                # Fallback to sync invoke in thread
                return await asyncio.to_thread(llm_or_chain.invoke, input_data)
                
        except Exception as e:
            last_exception = e
            
            if attempt == _max_retries:
                logger.error(
                    f"LLM call failed after {_max_retries + 1} attempts: {e}"
                )
                raise
            
            # Calculate delay with exponential backoff
            delay = min(
                _initial_delay * (_backoff_factor ** attempt),
                _max_delay
            )
            
            # Add jitter (±25%)
            import random
            jitter = delay * 0.25 * (2 * random.random() - 1)
            delay = max(0.1, delay + jitter)
            
            logger.warning(
                f"LLM call attempt {attempt + 1} failed: {e}. "
                f"Retrying in {delay:.2f}s..."
            )
            await asyncio.sleep(delay)
    
    # Should never reach here, but just in case
    if last_exception:
        raise last_exception


async def invoke_with_fallback(
    input_data: Any,
    schema: Optional[Type[T]] = None,
    temperature: float = 0,
    timeout: Optional[int] = None,
) -> Any:
    """
    Invoke LLM with automatic fallback to secondary model if primary fails.
    
    Args:
        input_data: Input to pass to the LLM
        schema: Optional Pydantic schema for structured output
        temperature: Sampling temperature
        timeout: Request timeout in seconds
    
    Returns:
        LLM response
    """
    models = [settings.LLM_MODEL, settings.LLM_FALLBACK_MODEL]
    
    for i, model in enumerate(models):
        try:
            if schema:
                llm = get_structured_llm(
                    schema=schema,
                    model=model,
                    temperature=temperature,
                    timeout=timeout,
                )
            else:
                llm = get_llm(
                    model=model,
                    temperature=temperature,
                    timeout=timeout,
                )
            
            return await invoke_with_retry(llm, input_data)
            
        except Exception as e:
            if i == len(models) - 1:
                # Last model, re-raise
                raise
            
            logger.warning(
                f"Model {model} failed: {e}. Trying fallback model..."
            )
    
    raise RuntimeError("All models failed")  # Should not reach here
