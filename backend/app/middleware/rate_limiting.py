"""Rate limiting middleware for learning portal."""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


def setup_rate_limiting(app: FastAPI) -> Limiter:
    """Setup rate limiting for the application.

    Args:
        app: FastAPI application instance

    Returns:
        Limiter instance for use in route decorators
    """
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        """Handle rate limit exceeded errors."""
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit exceeded. Too many requests. Please try again later.",
                "retry_after": exc.detail.split(" ")[-2] if exc.detail else "60"
            },
            headers={"Retry-After": "60"}
        )

    return limiter
