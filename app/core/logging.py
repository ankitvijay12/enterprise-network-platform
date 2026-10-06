"""Structured request logging and performance instrumentation."""
import logging
import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)

logger = logging.getLogger("enterprise_network")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware logging HTTP method, path, status code, and latency ms."""
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        client_ip = request.client.host if request.client else "unknown"
        
        response = await call_next(request)
        
        duration = (time.time() - start_time) * 1000
        logger.info(
            f"{request.method} {request.url.path} -> {response.status_code} "
            f"({duration:.2f}ms) | Client: {client_ip}"
        )
        response.headers["X-Process-Time"] = f"{duration:.2f}ms"
        return response
