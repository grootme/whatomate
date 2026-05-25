"""USGS Earthquake Hazards Program scraper.

Fetches M4.5+ earthquakes from the past day.
API: https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson
FREE, no API key required.
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from config import USGS_EARTHQUAKE_URL, USER_AGENT, HTTP_TIMEOUT

logger = logging.getLogger(__name__)


async def fetch_earthquakes(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch M4.5+ earthquakes from USGS.

    Returns:
        List of earthquake dicts with keys: title, lat, lng, magnitude, time, url
    """
    try:
        resp = await client.get(
            USGS_EARTHQUAKE_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        features = data.get("features", [])

        for feature in features:
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})

            coords = geom.get("coordinates", [0, 0, 0])
            if len(coords) < 2:
                continue

            magnitude = props.get("mag", 0)
            if magnitude is None:
                magnitude = 0

            # Convert milliseconds timestamp to ISO format
            time_ms = props.get("time", 0)
            try:
                time_iso = datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc).isoformat()
            except (ValueError, OSError):
                time_iso = datetime.now(tz=timezone.utc).isoformat()

            results.append({
                "title": f"M{magnitude:.1f} - {props.get('place', 'Unknown')}",
                "lat": coords[1],
                "lng": coords[0],
                "magnitude": magnitude,
                "time": time_iso,
                "url": props.get("url", ""),
            })

        logger.info(f"Fetched {len(results)} earthquakes from USGS")
        return results

    except Exception as e:
        logger.error(f"Error fetching earthquakes: {e}")
        return []
