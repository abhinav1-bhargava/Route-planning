"""Distance cache — Redis-backed, Google Distance Matrix as source of truth.

Flow on an agent scoring call (e.g. reallocation):

    1. `prefilter_by_haversine` — drop workers beyond FAR_KM (20 km default)
       straight-line from the target. Haversine is a CHEAP eliminator, never
       returned as a final ETA.
    2. `batch_get` — one call, N pairs. Hits Redis MGET first; misses go to
       one batched Google Distance Matrix call, then are written back with
       TTL_SECONDS.
    3. Callers consume `DistanceResult.duration_mins` / `.distance_km`, which
       are always Google's (or cached Google) values — never haversine.

Cache keys round lat/lng to 4 decimal places (~11 m precision) before writing,
so small GPS drift between otherwise-identical locations does not produce
cache misses.

This module also owns the reallocation Redis lock per CLAUDE.md — acquire
before committing an assignment, release after.
"""

from __future__ import annotations

import json
import logging
import math
import os
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Iterable

logger = logging.getLogger(__name__)


# ---- constants --------------------------------------------------------------

FAR_KM: float = 20.0
TTL_SECONDS: int = 300
COORD_PRECISION: int = 4
REALLOCATION_LOCK_TTL: int = 30

Coord = tuple[float, float]   # (lat, lng)

# Signature expected of integrations.google_maps.get_distance_matrix:
#   async def get_distance_matrix(
#       origins: list[Coord], destinations: list[Coord]
#   ) -> list[list[tuple[float, int]]]      # matrix[i][j] = (distance_km, duration_mins)
DistanceMatrixFn = Callable[
    [list[Coord], list[Coord]],
    Awaitable[list[list[tuple[float, int]]]],
]


# ---- result dataclass -------------------------------------------------------

@dataclass(frozen=True)
class DistanceResult:
    """One origin→destination result. Always from Google (live or cached),
    never haversine. `from_cache` is observability for logs/metrics."""
    origin: Coord
    destination: Coord
    distance_km: float
    duration_mins: int
    from_cache: bool


class DistanceCacheError(RuntimeError):
    """Raised when the underlying Google call fails and no cached value
    exists. Agents handle this by emitting ESCALATION_REQUIRED rather
    than scoring with a made-up ETA."""


# ---- haversine helpers — pre-filter ONLY, never an ETA --------------------

def haversine_km(a: Coord, b: Coord) -> float:
    """Great-circle distance in km. Pre-filter use ONLY — never as ETA."""
    lat1, lng1 = a
    lat2, lng2 = b
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def prefilter_by_haversine(
    target: Coord,
    candidates: Iterable[tuple[str, Coord]],
    *,
    max_km: float = FAR_KM,
) -> list[tuple[str, Coord]]:
    """Return `(id, coord)` pairs within `max_km` straight-line of `target`.
    Haversine is a filter, not an answer."""
    kept: list[tuple[str, Coord]] = []
    for cid, coord in candidates:
        if haversine_km(target, coord) <= max_km:
            kept.append((cid, coord))
    return kept


# ---- cache ------------------------------------------------------------------

def _round_coord(c: Coord) -> Coord:
    return (round(c[0], COORD_PRECISION), round(c[1], COORD_PRECISION))


def _cache_key(origin: Coord, dest: Coord) -> str:
    o = _round_coord(origin)
    d = _round_coord(dest)
    return f"dist:{o[0]:.4f},{o[1]:.4f}:{d[0]:.4f},{d[1]:.4f}"


class DistanceCache:
    """Redis-backed cache in front of the Google Distance Matrix API.
    All Google calls go through `batch_get` — no one-at-a-time loops."""

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._redis: Any = None
        self._distance_matrix_fn: DistanceMatrixFn | None = None

    async def start(self) -> None:
        if self._redis is not None:
            return
        try:
            from redis import asyncio as redis_asyncio
        except ImportError:
            logger.warning(
                "redis package not installed; distance cache disabled "
                "(calls will go straight to Google every time)"
            )
            self._redis = None
            return
        try:
            self._redis = redis_asyncio.from_url(self._redis_url)
            await self._redis.ping()
            logger.debug("DistanceCache connected to Redis at %s", self._redis_url)
        except Exception:
            logger.exception(
                "Redis connection failed; distance cache disabled "
                "(calls will go straight to Google every time)"
            )
            self._redis = None

    async def stop(self) -> None:
        if self._redis is None:
            return
        try:
            await self._redis.close()
        except Exception:
            logger.exception("error closing Redis")
        self._redis = None

    # --- batched distance fetch -------------------------------------------

    async def batch_get(
        self,
        pairs: list[tuple[Coord, Coord]],
    ) -> list[DistanceResult]:
        """Fetch ETA + road distance for a batch of (origin, destination) pairs.

        One MGET on the cache, then at most one Google Distance Matrix call
        for the misses, then writes back. Returns a list in the same order
        as `pairs`."""
        if not pairs:
            return []

        keys = [_cache_key(o, d) for (o, d) in pairs]
        cached_raw = await self._mget(keys)

        results: list[DistanceResult | None] = [None] * len(pairs)
        miss_idx: list[int] = []

        for i, raw in enumerate(cached_raw):
            if raw is None:
                miss_idx.append(i)
                continue
            if isinstance(raw, bytes):
                raw = raw.decode()
            try:
                data = json.loads(raw)
                results[i] = DistanceResult(
                    origin=pairs[i][0], destination=pairs[i][1],
                    distance_km=float(data["distance_km"]),
                    duration_mins=int(data["duration_mins"]),
                    from_cache=True,
                )
            except Exception:
                logger.exception(
                    "malformed cache entry at %s; treating as miss", keys[i]
                )
                miss_idx.append(i)

        if miss_idx:
            rounded_missing: list[tuple[Coord, Coord]] = [
                (_round_coord(pairs[i][0]), _round_coord(pairs[i][1]))
                for i in miss_idx
            ]
            try:
                fetched = await self._fetch_from_google_batch(rounded_missing)
            except Exception as exc:
                raise DistanceCacheError(
                    f"Google Distance Matrix failed and {len(miss_idx)} pairs "
                    f"had no cached fallback"
                ) from exc

            writes: dict[str, str] = {}
            for local_i, i in enumerate(miss_idx):
                km, mins = fetched[local_i]
                results[i] = DistanceResult(
                    origin=pairs[i][0], destination=pairs[i][1],
                    distance_km=float(km),
                    duration_mins=int(mins),
                    from_cache=False,
                )
                writes[keys[i]] = json.dumps(
                    {"distance_km": float(km), "duration_mins": int(mins)}
                )
            await self._write_back(writes)

        # mypy-assist: all slots filled by now.
        return [r for r in results if r is not None]

    async def _mget(self, keys: list[str]) -> list[Any]:
        if self._redis is None or not keys:
            return [None] * len(keys)
        try:
            return await self._redis.mget(keys)
        except Exception:
            logger.exception("Redis MGET failed; treating all as misses")
            return [None] * len(keys)

    async def _write_back(self, writes: dict[str, str]) -> None:
        if self._redis is None or not writes:
            return
        try:
            async with self._redis.pipeline() as pipe:
                for k, v in writes.items():
                    pipe.set(k, v, ex=TTL_SECONDS)
                await pipe.execute()
        except Exception:
            logger.exception("Redis cache write failed (non-fatal)")

    async def _fetch_from_google_batch(
        self, missing_pairs: list[tuple[Coord, Coord]]
    ) -> list[tuple[float, int]]:
        origins_unique: list[Coord] = list(
            dict.fromkeys(p[0] for p in missing_pairs)
        )
        dests_unique: list[Coord] = list(
            dict.fromkeys(p[1] for p in missing_pairs)
        )
        matrix = await self._call_distance_matrix(origins_unique, dests_unique)
        origin_idx = {c: i for i, c in enumerate(origins_unique)}
        dest_idx = {c: j for j, c in enumerate(dests_unique)}
        out: list[tuple[float, int]] = []
        for (o, d) in missing_pairs:
            cell = matrix[origin_idx[o]][dest_idx[d]]
            out.append((float(cell[0]), int(cell[1])))
        return out

    async def _call_distance_matrix(
        self, origins: list[Coord], destinations: list[Coord]
    ) -> list[list[tuple[float, int]]]:
        if self._distance_matrix_fn is None:
            from integrations.google_maps import get_distance_matrix
            self._distance_matrix_fn = get_distance_matrix
        return await self._distance_matrix_fn(origins, destinations)

    # --- reallocation lock -------------------------------------------------

    async def acquire_reallocation_lock(
        self, worker_id: str, ttl: int = REALLOCATION_LOCK_TTL,
    ) -> bool:
        """Best-effort SET NX EX lock on `lock:reallocation:{worker_id}`."""
        if self._redis is None:
            # No Redis → no real locking. Degraded mode; safe for the demo's
            # single-process flow. Loud log so the operator knows.
            logger.warning(
                "distance cache Redis unavailable; lock for %s granted without "
                "mutual exclusion",
                worker_id,
            )
            return True
        key = f"lock:reallocation:{worker_id}"
        try:
            result = await self._redis.set(key, "1", nx=True, ex=ttl)
            return bool(result)
        except Exception:
            logger.exception(
                "Redis lock acquire failed for %s; assuming acquired", worker_id
            )
            return True

    async def release_reallocation_lock(self, worker_id: str) -> None:
        """Delete the lock key. No-op if already expired — TTL is the real
        safety net against a holder that crashed before release."""
        if self._redis is None:
            return
        key = f"lock:reallocation:{worker_id}"
        try:
            await self._redis.delete(key)
        except Exception:
            logger.exception("Redis lock release failed for %s (non-fatal)", worker_id)


# ---- module-level singleton -----------------------------------------------

_cache: DistanceCache | None = None


def get_distance_cache() -> DistanceCache:
    """Module-level singleton. Lazy-built from REDIS_URL on first call."""
    global _cache
    if _cache is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        _cache = DistanceCache(redis_url)
    return _cache
