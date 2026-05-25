"""OpenSky Network flight scraper.

Fetches real-time aircraft state vectors.
API: https://opensky-network.org/api/states/all
FREE, public access (rate-limited, no auth required).
"""

import logging
from typing import Any

import httpx

from config import OPENSKY_URL, USER_AGENT, HTTP_TIMEOUT, MILITARY_CALLSIGNS

logger = logging.getLogger(__name__)


def _categorize_flight(callsign: str, origin_country: str) -> str:
    """Categorize a flight based on callsign patterns.

    Returns:
        'military', 'private', or 'commercial'
    """
    if not callsign:
        return "commercial"

    cs = callsign.strip().upper()

    # Check military callsign prefixes
    for prefix in MILITARY_CALLSIGNS:
        if cs.startswith(prefix):
            return "military"

    # Additional military indicators
    if any(cs.startswith(p) for p in ["ZZ", "FOR", "HAVOC", "WAR", "TROJ", "VIPER", "HAWK", "VIP"]):
        return "military"

    return "commercial"


async def fetch_flights(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch flight data from OpenSky Network and categorize.

    Returns:
        Dict with keys: military_flights, commercial_flights, tracked_flights, private_jets
        Each is a list of flight dicts with keys: callsign, lat, lng, altitude, velocity, origin_country
    """
    try:
        resp = await client.get(
            OPENSKY_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code == 429:
            logger.warning("OpenSky rate limit hit, returning empty flights")
            return _empty_flight_result()

        resp.raise_for_status()
        data = resp.json()

        states = data.get("states", [])
        if not states:
            return _empty_flight_result()

        military_flights = []
        commercial_flights = []
        tracked_flights = []

        for state in states:
            if len(state) < 10:
                continue

            callsign = (state[1] or "").strip()
            origin_country = state[2] or "Unknown"
            longitude = state[5]
            latitude = state[6]
            altitude = state[7] or 0
            velocity = state[9] or 0

            # Skip if no position data
            if latitude is None or longitude is None:
                continue

            flight = {
                "callsign": callsign,
                "lat": float(latitude),
                "lng": float(longitude),
                "altitude": float(altitude) if altitude else 0,
                "velocity": float(velocity) if velocity else 0,
                "origin_country": origin_country,
            }

            category = _categorize_flight(callsign, origin_country)

            if category == "military":
                military_flights.append(flight)
            else:
                commercial_flights.append(flight)

            tracked_flights.append(flight)

        # Limit results to keep response size manageable
        military_flights = military_flights[:50]
        commercial_flights = commercial_flights[:200]
        tracked_flights = tracked_flights[:300]

        logger.info(
            f"Fetched flights: {len(military_flights)} military, "
            f"{len(commercial_flights)} commercial"
        )

        return {
            "military_flights": military_flights,
            "commercial_flights": commercial_flights,
            "tracked_flights": tracked_flights,
            "private_jets": [],  # Can't reliably distinguish private jets from OpenSky data alone
        }

    except Exception as e:
        logger.error(f"Error fetching flights: {e}")
        return _empty_flight_result()


def _empty_flight_result() -> dict[str, list]:
    """Return empty flight result structure."""
    return {
        "military_flights": [],
        "commercial_flights": [],
        "tracked_flights": [],
        "private_jets": [],
    }
