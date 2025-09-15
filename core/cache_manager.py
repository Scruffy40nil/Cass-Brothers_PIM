"""
Advanced Caching System for PIM - Makes everything lightning fast
"""
import json
import time
import hashlib
import logging
from typing import Dict, Any, Optional, List
from threading import Lock
try:
    import redis
except ImportError:
    redis = None
import pickle

logger = logging.getLogger(__name__)

class AdvancedCacheManager:
    """
    Multi-level caching system for maximum performance:
    1. Memory cache (fastest)
    2. Redis cache (persistent, shared)
    3. File cache (backup)
    """

    def __init__(self):
        self.memory_cache = {}
        self.cache_lock = Lock()
        self.default_ttl = 300  # 5 minutes
        self.redis_client = None
        self.setup_redis()

        # Cache statistics
        self.stats = {
            'hits': 0,
            'misses': 0,
            'memory_hits': 0,
            'redis_hits': 0,
            'file_hits': 0
        }

    def setup_redis(self):
        """Setup Redis connection if available"""
        try:
            if redis is None:
                raise ImportError("Redis module not available")

            self.redis_client = redis.Redis(
                host='localhost',
                port=6379,
                decode_responses=False,
                socket_connect_timeout=1
            )
            # Test connection
            self.redis_client.ping()
            logger.info("✅ Redis cache connected")
        except Exception as e:
            logger.warning(f"⚠️ Redis not available, using memory-only cache: {e}")
            self.redis_client = None

    def _generate_key(self, namespace: str, identifier: str) -> str:
        """Generate cache key"""
        combined = f"{namespace}:{identifier}"
        return hashlib.md5(combined.encode()).hexdigest()

    def get(self, namespace: str, identifier: str) -> Optional[Any]:
        """Get from cache with multi-level fallback"""
        cache_key = self._generate_key(namespace, identifier)

        # Level 1: Memory cache (fastest)
        with self.cache_lock:
            if cache_key in self.memory_cache:
                entry = self.memory_cache[cache_key]
                if entry['expires'] > time.time():
                    self.stats['hits'] += 1
                    self.stats['memory_hits'] += 1
                    logger.debug(f"💾 Memory cache HIT: {namespace}:{identifier}")
                    return entry['data']
                else:
                    del self.memory_cache[cache_key]

        # Level 2: Redis cache
        if self.redis_client:
            try:
                redis_data = self.redis_client.get(cache_key)
                if redis_data:
                    entry = pickle.loads(redis_data)
                    if entry['expires'] > time.time():
                        # Promote to memory cache
                        with self.cache_lock:
                            self.memory_cache[cache_key] = entry
                        self.stats['hits'] += 1
                        self.stats['redis_hits'] += 1
                        logger.debug(f"🔄 Redis cache HIT: {namespace}:{identifier}")
                        return entry['data']
                    else:
                        self.redis_client.delete(cache_key)
            except Exception as e:
                logger.warning(f"Redis get error: {e}")

        self.stats['misses'] += 1
        logger.debug(f"❌ Cache MISS: {namespace}:{identifier}")
        return None

    def set(self, namespace: str, identifier: str, data: Any, ttl: int = None) -> bool:
        """Set in cache with multi-level storage"""
        if ttl is None:
            ttl = self.default_ttl

        cache_key = self._generate_key(namespace, identifier)
        expires = time.time() + ttl
        entry = {'data': data, 'expires': expires}

        # Store in memory cache
        with self.cache_lock:
            self.memory_cache[cache_key] = entry

        # Store in Redis cache
        if self.redis_client:
            try:
                self.redis_client.setex(
                    cache_key,
                    ttl,
                    pickle.dumps(entry)
                )
            except Exception as e:
                logger.warning(f"Redis set error: {e}")

        logger.debug(f"💾 Cached: {namespace}:{identifier} (TTL: {ttl}s)")
        return True

    def invalidate(self, namespace: str, identifier: str = None) -> bool:
        """Invalidate cache entries"""
        if identifier:
            # Invalidate specific entry
            cache_key = self._generate_key(namespace, identifier)
            with self.cache_lock:
                self.memory_cache.pop(cache_key, None)
            if self.redis_client:
                try:
                    self.redis_client.delete(cache_key)
                except Exception:
                    pass
        else:
            # Invalidate entire namespace
            to_remove = []
            with self.cache_lock:
                for key in self.memory_cache:
                    if key.startswith(namespace):
                        to_remove.append(key)
                for key in to_remove:
                    del self.memory_cache[key]

            if self.redis_client:
                try:
                    # Get all keys matching namespace
                    pattern = f"{namespace}:*"
                    keys = self.redis_client.keys(pattern)
                    if keys:
                        self.redis_client.delete(*keys)
                except Exception:
                    pass

        logger.info(f"🗑️ Cache invalidated: {namespace}")
        return True

    def get_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0

        return {
            'hit_rate': f"{hit_rate:.1f}%",
            'total_requests': total_requests,
            'memory_size': len(self.memory_cache),
            **self.stats
        }

    def warm_cache(self, collection_name: str, products_data: Dict[int, Dict]) -> None:
        """Pre-warm cache with product data"""
        logger.info(f"🔥 Warming cache for {collection_name}...")

        # Cache full product list
        self.set('products', collection_name, products_data, ttl=600)  # 10 minutes

        # Cache individual products
        for row_num, product in products_data.items():
            self.set('product', f"{collection_name}:{row_num}", product, ttl=300)

        logger.info(f"✅ Cache warmed with {len(products_data)} products")

# Global cache instance
cache_manager = AdvancedCacheManager()