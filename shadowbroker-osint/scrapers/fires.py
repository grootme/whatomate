"""NASA FIRMS Fire Data scraper.

Fetches active fire data from VIIRS.
API: https://firms.modaps.eosdis.nasa.gov/api/area/csv/OPEN_KEY/VIIRS_SNPP_NRT/0,0,180,90/1
FREE for basic access, but may require MAP_KEY for extended use.
"""

import logging
from typing import Any

import httpx

from config import NASA_FIRMS_URL, USER_AGENT, HTTP_TIMEOUT

logger = logging.getLogger(__name__)

# Fallback sample data if API is unreachable or requires a key
FALLBACK_FIRES = [
    {"lat": 35.8, "lng": -119.5, "confidence": "nominal", "acq_date": "2025-01-01"},
    {"lat": -23.4, "lng": 46.2, "confidence": "high", "acq_date": "2025-01-01"},
    {"lat": -12.5, "lng": 38.1, "confidence": "nominal", "acq_date": "2025-01-01"},
    {"lat": 28.3, "lng": 84.7, "confidence": "high", "acq_date": "2025-01-01"},
    {"lat": 5.2, "lng": 102.4, "confidence": "nominal", "acq_date": "2025-01-01"},
    {"lat": -6.1, "lng": 106.8, "confidence": "high", "acq_date": "2025-01-01"},
    {"lat": -33.9, "lng": 18.4, "confidence": "low", "acq_date": "2025-01-01"},
    {"lat": 36.7, "lng": 3.0, "confidence": "nominal", "acq_date": "2025-01-01"},
]


async def fetch_fires(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch active fire data from NASA FIRMS.

    Returns:
        List of fire dicts with keys: lat, lng, confidence, acq_date
    """
    try:
        # Try with the OPEN_KEY placeholder first
        # NASA FIRMS allows basic access; the key "OPEN_KEY" works for limited queries
        resp = await client.get(
            NASA_FIRMS_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code != 200:
            logger.warning(f"FIRMS API returned status {resp.status_code}, using fallback data")
            return FALLBACK_FIRES

        # Parse CSV response
        lines = resp.text.strip().split("\n")
        if len(lines) < 2:
            logger.warning("FIRMS returned empty CSV, using fallback data")
            return FALLBACK_FIRES

        # Parse header
        header = lines[0].split(",")
        lat_idx = _find_index(header, "latitude")
        lng_idx = _find_index(header, "longitude")
        conf_idx = _find_index(header, "confidence")
        date_idx = _find_index(header, "acq_date")

        if lat_idx is None or lng_idx is None:
            logger.warning("FIRMS CSV missing required columns, using fallback data")
            return FALLBACK_FIRES

        results = []
        for line in lines[1:]:
            cols = line.split(",")
            try:
                lat = float(cols[lat_idx]) if lat_idx < len(cols) else 0.0
                lng = float(cols[lng_idx]) if lng_idx < len(cols) else 0.0
                confidence = cols[conf_idx] if conf_idx is not None and conf_idx < len(cols) else "unknown"
                acq_date = cols[date_idx] if date_idx is not None and date_idx < len(cols) else ""

                results.append({
                    "lat": lat,
                    "lng": lng,
                    "confidence": confidence.strip(),
                    "acq_date": acq_date.strip(),
                })
            except (ValueError, IndexError) as e:
                logger.debug(f"Skipping malformed FIRMS row: {e}")
                continue

        # Limit to reasonable number of results
        results = results[:500]

        logger.info(f"Fetched {len(results)} fire detections from FIRMS")
        return results if results else FALLBACK_FIRES

    except Exception as e:
        logger.error(f"Error fetching fires: {e}")
        return FALLBACK_FIRES


def _find_index(header: list[str], column_name: str) -> int | None:
    """Find column index by name (case-insensitive)."""
    for i, h in enumerate(header):
        if h.strip().lower() == column_name.lower():
            return i
    return None
