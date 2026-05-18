"""In-memory rate limiter for API endpoints"""
import time
from collections import defaultdict
from fastapi import HTTPException

# {key: [timestamps]}
_buckets: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_requests: int = 5, window_seconds: int = 60, key_prefix: str = ""):
    """
    Simple sliding-window rate limiter.
    5 requests per 60s window by default.
    """
    def limiter(material_id: int) -> None:
        key = f"{key_prefix}:{material_id}"
        now = time.time()
        cutoff = now - window_seconds
        _buckets[key] = [t for t in _buckets[key] if t > cutoff]
        if len(_buckets[key]) >= max_requests:
            raise HTTPException(status_code=429, detail="出题请求太频繁，请 1 分钟后再试")
        _buckets[key].append(now)

    return limiter
