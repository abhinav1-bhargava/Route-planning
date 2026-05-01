"""WebSocket endpoint — /ws/events streams every bus event to the dashboard.

A single broadcaster handler is subscribed to every value in EventType,
so new event types picked up by enumeration automatically stream out —
no manual wiring required. Events are serialised to JSON via Pydantic's
model_dump_json so datetimes become ISO-8601 strings.

Client protocol:
    - Client connects to /ws/events (no auth in demo).
    - Server accepts, adds the socket to the broadcast set.
    - Each bus event → one JSON text frame per connected client.
    - Send-failures drop the client silently from the set.
    - Client-initiated closes remove the client.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.event_bus import EventBus
from core.models import Event, EventType

logger = logging.getLogger(__name__)

router = APIRouter()

# Module-level client set. FastAPI uses one process per worker for ASGI dev;
# for the demo this is sufficient.
_clients: set[WebSocket] = set()


def _all_event_types() -> list[str]:
    """Enumerate every EventType constant so new ones are picked up for free."""
    return [
        getattr(EventType, name)
        for name in dir(EventType)
        if not name.startswith("_") and name.isupper()
    ]


async def _broadcast(event: Event) -> None:
    """Fan the event out to every connected WebSocket. Dead sockets are
    removed so a silent disconnect doesn't hold the set open."""
    payload = event.model_dump_json()
    dead: list[WebSocket] = []
    for ws in list(_clients):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _clients.discard(ws)
    if dead:
        logger.debug("dropped %d dead WebSocket clients", len(dead))


def register_broadcaster(bus: EventBus) -> None:
    """Subscribe the broadcaster to every event type. Called once at
    startup from api/main.py's lifespan."""
    bus.subscribe(_all_event_types(), _broadcast)


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket) -> None:
    await ws.accept()
    _clients.add(ws)
    logger.info("WebSocket connected; %d total client(s)", len(_clients))
    try:
        # We don't expect inbound messages from clients — just keep the
        # socket open until the browser disconnects.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("unexpected error on ws/events; closing socket")
    finally:
        _clients.discard(ws)
        logger.info("WebSocket disconnected; %d client(s) remain", len(_clients))
