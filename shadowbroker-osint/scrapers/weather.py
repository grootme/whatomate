"""National Weather Service (NWS) Alerts scraper.

Fetches severe/extreme weather alerts for the US.
API: https://api.weather.gov/alerts?severity=Extreme,Severe
FREE, no API key required.
"""

import logging
from typing import Any

import httpx

from config import NWS_ALERTS_URL, USER_AGENT, HTTP_TIMEOUT

logger = logging.getLogger(__name__)


async def fetch_weather_alerts(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch severe weather alerts from NWS.

    Returns:
        List of alert dicts with keys: event, severity, area, lat, lng
    """
    try:
        resp = await client.get(
            NWS_ALERTS_URL,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/ld+json",
            },
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        features = data.get("features", [])

        # If data is in graph format (JSON-LD), handle that too
        if not features and "@graph" in data:
            features = data["@graph"]

        for feature in features:
            props = feature.get("properties", feature)

            event = props.get("event", "Unknown Weather Event")
            severity = props.get("severity", "Unknown")
            area = props.get("areaDesc", "Unknown Area")

            # NWS doesn't provide lat/lng directly in alerts
            # Use 0,0 as fallback per spec
            results.append({
                "event": event,
                "severity": severity,
                "area": area,
                "lat": 0,
                "lng": 0,
            })

        logger.info(f"Fetched {len(results)} weather alerts from NWS")
        return results

    except Exception as e:
        logger.error(f"Error fetching weather alerts: {e}")
        return []
