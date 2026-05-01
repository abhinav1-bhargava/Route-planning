"""Event bus — publish/subscribe over asyncio.Queue (dev) or Redis Pub/Sub (prod).

Backend is selected by the EVENT_BUS env var:
    EVENT_BUS=asyncio    in-process asyncio.Queue   (default)
    EVENT_BUS=redis      Redis Pub/Sub at REDIS_URL

Typical wiring:
    bus = get_bus()
    await bus.start()
    bus.subscribe(["TASK_CREATED", "CONSENT_RESOLVED"], supervisor.handle)
    ...
    await bus.publish(event)
    ...
    await bus.stop()

The bus only transports events. Durable persistence of events (to the
`events` table) is a separate concern — agents call state_store.save_event
explicitly after publishing.
"""

from __future__ import annotations

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from typing import Any, Awaitable, Callable
from uuid import uuid4

from core.models import Event

logger = logging.getLogger(__name__)

EventHandler = Callable[[Event], Awaitable[None]]


def new_correlation_id() -> str:
    """Return a fresh UUID4 string for a new event chain.

    Use when *beginning* a chain — e.g. the supervisor receives a
    TASK_CREATED from the API and starts a reallocation flow. Every
    downstream event in the same chain must copy this value verbatim;
    the bus does not propagate correlation_id for you.
    """
    return str(uuid4())


class EventBus(ABC):
    """Abstract publish/subscribe bus. Concrete backends below."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[EventHandler]] = {}
        self._started: bool = False

    def subscribe(
        self,
        event_types: str | list[str],
        handler: EventHandler,
    ) -> None:
        """Register a coroutine handler for one or more event types.

        Handler signature: ``async def h(event: Event) -> None``.
        Exceptions raised inside a handler are logged and swallowed;
        one bad handler cannot break dispatch for its peers.
        Subscriptions must be made before start() to guarantee delivery
        of early events.
        """
        if isinstance(event_types, str):
            event_types = [event_types]
        for et in event_types:
            self._subscribers.setdefault(et, []).append(handler)

    async def _safe_dispatch(
        self, handler: EventHandler, event: Event
    ) -> None:
        try:
            await handler(event)
        except Exception:
            logger.exception(
                "event handler %r failed on %s (correlation_id=%s)",
                getattr(handler, "__qualname__", handler),
                event.event_type,
                event.correlation_id,
            )

    def _dispatch_to_handlers(self, event: Event) -> None:
        for handler in self._subscribers.get(event.event_type, []):
            asyncio.create_task(self._safe_dispatch(handler, event))

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    @abstractmethod
    async def publish(self, event: Event) -> None: ...


class AsyncioEventBus(EventBus):
    """In-process bus backed by asyncio.Queue. No external deps.
    The default backend for local dev and tests."""

    def __init__(self) -> None:
        super().__init__()
        self._queue: asyncio.Queue[Event] | None = None
        self._dispatch_task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._started:
            return
        self._queue = asyncio.Queue()
        self._dispatch_task = asyncio.create_task(self._run_dispatch_loop())
        self._started = True
        logger.debug("AsyncioEventBus started")

    async def stop(self) -> None:
        if not self._started:
            return
        self._started = False
        if self._dispatch_task is not None:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
            self._dispatch_task = None
        self._queue = None
        logger.debug("AsyncioEventBus stopped")

    async def publish(self, event: Event) -> None:
        if not self._started or self._queue is None:
            raise RuntimeError("EventBus not started — call start() first")
        await self._queue.put(event)

    async def _run_dispatch_loop(self) -> None:
        assert self._queue is not None
        while True:
            event = await self._queue.get()
            self._dispatch_to_handlers(event)


class RedisEventBus(EventBus):
    """Redis Pub/Sub bus. If the broker is unreachable, publish() logs
    and returns cleanly so a transient outage cannot stall agent flows.
    Subscribers auto-reconnect on broker reconnect."""

    def __init__(self, redis_url: str) -> None:
        super().__init__()
        self._redis_url = redis_url
        self._redis: Any = None
        self._pubsub: Any = None
        self._listener_task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._started:
            return
        try:
            from redis import asyncio as redis_asyncio
        except ImportError as exc:
            raise RuntimeError(
                "redis package not installed — `pip install redis` "
                "or switch to EVENT_BUS=asyncio"
            ) from exc
        self._redis = redis_asyncio.from_url(self._redis_url)
        self._listener_task = asyncio.create_task(self._run_listener_loop())
        self._started = True
        logger.debug("RedisEventBus started at %s", self._redis_url)

    async def stop(self) -> None:
        if not self._started:
            return
        self._started = False
        if self._listener_task is not None:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None
        if self._pubsub is not None:
            try:
                await self._pubsub.close()
            except Exception:
                logger.exception("error closing Redis pubsub")
            self._pubsub = None
        if self._redis is not None:
            try:
                await self._redis.close()
            except Exception:
                logger.exception("error closing Redis client")
            self._redis = None
        logger.debug("RedisEventBus stopped")

    async def publish(self, event: Event) -> None:
        if not self._started or self._redis is None:
            raise RuntimeError("EventBus not started — call start() first")
        try:
            await self._redis.publish(
                event.event_type, event.model_dump_json()
            )
        except Exception:
            logger.exception(
                "Redis publish failed for %s (correlation_id=%s); event dropped",
                event.event_type,
                event.correlation_id,
            )

    async def _run_listener_loop(self) -> None:
        while self._started:
            try:
                assert self._redis is not None
                self._pubsub = self._redis.pubsub()
                channels = list(self._subscribers.keys())
                if channels:
                    await self._pubsub.subscribe(*channels)
                async for message in self._pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    channel = message.get("channel")
                    if isinstance(channel, bytes):
                        channel = channel.decode()
                    data = message.get("data")
                    if isinstance(data, bytes):
                        data = data.decode()
                    try:
                        event = Event.model_validate_json(data)
                    except Exception:
                        logger.exception(
                            "dropping malformed event on channel %s", channel
                        )
                        continue
                    self._dispatch_to_handlers(event)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Redis listener error; reconnecting in 1s")
                await asyncio.sleep(1)


def create_event_bus(
    backend: str | None = None,
    redis_url: str | None = None,
) -> EventBus:
    """Build a fresh bus.

    If `backend` is None, reads EVENT_BUS from env (default 'asyncio').
    If `redis_url` is None, reads REDIS_URL from env.
    Unknown backend name → ValueError.
    """
    backend = (backend or os.getenv("EVENT_BUS", "asyncio")).lower()
    if backend == "asyncio":
        return AsyncioEventBus()
    if backend == "redis":
        redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        return RedisEventBus(redis_url)
    raise ValueError(
        f"Unknown EVENT_BUS backend: {backend!r}. Use 'asyncio' or 'redis'."
    )


_bus: EventBus | None = None


def get_bus() -> EventBus:
    """Return the module-level bus singleton, created lazily from env on
    first call. All subsequent calls return the same instance."""
    global _bus
    if _bus is None:
        _bus = create_event_bus()
    return _bus
