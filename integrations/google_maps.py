"""Google Maps + OSRM integration.

Four async functions:
    get_distance_matrix   — Google Distance Matrix, traffic-aware
                            (source of truth for agent scoring)
    get_directions        — Google Directions (formatted route summaries)
    geocode_address       — Google Geocoding (seed prep only)
    get_route_geometry    — OSRM public API, dashboard polyline only
                            (5s timeout, straight-line fallback on error)

GOOGLE_MAPS_API_KEY is read from env at module load. Calling a Google
function without a key set raises ConfigurationError with a legible
message — never KeyError or AttributeError.

OSRM public endpoint is rate-limited; for production switch to a
self-hosted OSRM instance and override OSRM_BASE.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# Read once at module load per architecture contract. Tests that need to
# manipulate the key should patch `google_maps._API_KEY` directly after import.
_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")

GOOGLE_BASE = "https://maps.googleapis.com/maps/api"
OSRM_BASE = "https://router.project-osrm.org/route/v1/driving"
OSRM_TIMEOUT_SECONDS = 5.0
GOOGLE_TIMEOUT_SECONDS = 10.0

Coord = tuple[float, float]   # (lat, lng) — project-wide convention


class ConfigurationError(RuntimeError):
    """Required configuration (e.g. an API key) is missing. Preferred over
    KeyError / AttributeError so operator-facing errors at startup are
    legible instead of cryptic."""


def _require_api_key() -> str:
    if not _API_KEY:
        raise ConfigurationError(
            "GOOGLE_MAPS_API_KEY is not set. Copy .env.example to .env and "
            "add your key, or export GOOGLE_MAPS_API_KEY before calling "
            "any Google Maps function."
        )
    return _API_KEY


def _coord_str(c: Coord) -> str:
    return f"{c[0]},{c[1]}"


def _coord_list_str(cs: list[Coord]) -> str:
    return "|".join(_coord_str(c) for c in cs)


async def get_distance_matrix(
    origins: list[Coord],
    destinations: list[Coord],
) -> list[list[tuple[float, int]]]:
    """Google Distance Matrix, traffic-aware.

    Returns matrix[i][j] = (distance_km, duration_mins) for
    origins[i] → destinations[j]. Uses departure_time=now and
    traffic_model=best_guess; prefers duration_in_traffic when Google
    returns it.
    """
    key = _require_api_key()
    params = {
        "origins": _coord_list_str(origins),
        "destinations": _coord_list_str(destinations),
        "departure_time": "now",
        "traffic_model": "best_guess",
        "key": key,
    }
    url = f"{GOOGLE_BASE}/distancematrix/json"
    async with httpx.AsyncClient(timeout=GOOGLE_TIMEOUT_SECONDS) as client:
        resp = await client.get(url, params=params)
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") != "OK":
        raise RuntimeError(
            f"Distance Matrix status={body.get('status')!r}: "
            f"{body.get('error_message', '')}"
        )
    matrix: list[list[tuple[float, int]]] = []
    for row in body["rows"]:
        row_out: list[tuple[float, int]] = []
        for elem in row["elements"]:
            if elem.get("status") != "OK":
                raise RuntimeError(
                    f"Distance Matrix element status={elem.get('status')!r}"
                )
            dist_m = elem["distance"]["value"]
            dur_s = (
                elem.get("duration_in_traffic", {}).get("value")
                or elem["duration"]["value"]
            )
            row_out.append((dist_m / 1000.0, int(round(dur_s / 60.0))))
        matrix.append(row_out)
    return matrix


async def get_directions(origin: Coord, destination: Coord) -> dict[str, Any]:
    """Google Directions. Returns distance_km, duration_mins, polyline,
    and step instructions. Intended for formatted summaries, not agent
    scoring — scoring goes through distance_cache.batch_get."""
    key = _require_api_key()
    params = {
        "origin": _coord_str(origin),
        "destination": _coord_str(destination),
        "departure_time": "now",
        "traffic_model": "best_guess",
        "key": key,
    }
    url = f"{GOOGLE_BASE}/directions/json"
    async with httpx.AsyncClient(timeout=GOOGLE_TIMEOUT_SECONDS) as client:
        resp = await client.get(url, params=params)
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") != "OK" or not body.get("routes"):
        raise RuntimeError(
            f"Directions status={body.get('status')!r}: "
            f"{body.get('error_message', '')}"
        )
    route = body["routes"][0]
    leg = route["legs"][0]
    dur_s = (
        leg.get("duration_in_traffic", {}).get("value")
        or leg["duration"]["value"]
    )
    return {
        "distance_km": leg["distance"]["value"] / 1000.0,
        "duration_mins": int(round(dur_s / 60.0)),
        "polyline": route["overview_polyline"]["points"],
        "steps": [s.get("html_instructions", "") for s in leg.get("steps", [])],
    }


async def geocode_address(address: str) -> Coord:
    """Google Geocoding. Returns (lat, lng). Per CLAUDE.md this runs
    during seed preparation only — never at runtime."""
    key = _require_api_key()
    params = {"address": address, "key": key}
    url = f"{GOOGLE_BASE}/geocode/json"
    async with httpx.AsyncClient(timeout=GOOGLE_TIMEOUT_SECONDS) as client:
        resp = await client.get(url, params=params)
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") != "OK" or not body.get("results"):
        raise RuntimeError(
            f"Geocode status={body.get('status')!r}: "
            f"{body.get('error_message', '')}"
        )
    loc = body["results"][0]["geometry"]["location"]
    return (float(loc["lat"]), float(loc["lng"]))


async def get_route_geometry(ordered_coords: list[Coord]) -> list[Coord]:
    """Road geometry for dashboard polylines. Visual only.

    Calls OSRM with a 5-second timeout. On any error/timeout, falls back
    to returning the input `ordered_coords` unchanged — the dashboard
    will then draw straight-line segments between stops. The fallback
    is logged with the reason. A fallback NEVER affects agent decisions.
    """
    if len(ordered_coords) < 2:
        return list(ordered_coords)
    try:
        coord_path = ";".join(f"{lng},{lat}" for (lat, lng) in ordered_coords)
        # OSRM takes lng,lat in the URL path (NOT lat,lng) and returns [lng,lat] in GeoJSON; flip both ways.
        url = f"{OSRM_BASE}/{coord_path}"
        params = {"overview": "full", "geometries": "geojson"}
        async with httpx.AsyncClient(timeout=OSRM_TIMEOUT_SECONDS) as client:
            resp = await client.get(url, params=params)
        resp.raise_for_status()
        body = resp.json()
        if body.get("code") != "Ok" or not body.get("routes"):
            raise RuntimeError(
                f"OSRM code={body.get('code')!r}: {body.get('message', '')}"
            )
        osrm_coords = body["routes"][0]["geometry"]["coordinates"]
        return [(float(lat), float(lng)) for (lng, lat) in osrm_coords]
    except Exception as exc:
        logger.warning(
            "OSRM route geometry fallback to straight-line segments — "
            "reason: %s: %s (stops=%d)",
            type(exc).__name__, exc, len(ordered_coords),
        )
        return list(ordered_coords)
