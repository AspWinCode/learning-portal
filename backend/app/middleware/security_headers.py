"""Security headers middleware."""

from fastapi import Request
from fastapi.responses import Response


async def security_headers_middleware(request: Request, call_next) -> Response:
    """Add security headers to all responses.

    Headers:
    - X-Content-Type-Options: nosniff - Prevent MIME-type sniffing
    - X-Frame-Options: DENY - Prevent clickjacking
    - X-XSS-Protection: 1; mode=block - Enable XSS protection
    - Strict-Transport-Security: max-age=31536000 - Force HTTPS
    """
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
