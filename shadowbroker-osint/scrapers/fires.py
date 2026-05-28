"""NASA FIRMS Fire Data scraper.

Fetches active fire/thermal anomaly data from NASA FIRMS.
Tries VIIRS_SNPP_NRT first, then MODIS_NRT as fallback.
API: https://firms.modaps.eosdis.nasa.gov/api/area/csv/MAP_KEY/PRODUCT/BBOX/1
Requires MAP_KEY for extended access.
"""

import logging
from typing import Any

import httpx

from config import NASA_FIRMS_MAP_KEY, USER_AGENT, HTTP_TIMEOUT

# FIRMS API base URL template
_FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
# Products to try in order (VIIRS is higher resolution, MODIS is more reliable)
_FIRMS_PRODUCTS = ["VIIRS_SNPP_NRT", "MODIS_NRT"]
# Bounding box: world
_FIRMS_BBOX = "-180,-90,180,90"

logger = logging.getLogger(__name__)

# No fallback data — we use the real NASA FIRMS API with a valid MAP_KEY


async def fetch_fires(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch active fire data from NASA FIRMS.

    Tries VIIRS_SNPP_NRT first, then MODIS_NRT as fallback.
    Uses the MAP_KEY from config for authenticated access.

    Returns:
        List of fire dicts with keys: lat, lng, confidence, acq_date, satellite, frp
    """
    map_key = NASA_FIRMS_MAP_KEY or "OPEN_KEY"

    for product in _FIRMS_PRODUCTS:
        try:
            url = f"{_FIRMS_BASE}/{map_key}/{product}/{_FIRMS_BBOX}/1"
            logger.info(f"Fetching FIRMS {product} with key={map_key[:8]}...")

            resp = await client.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=20.0,  # FIRMS can be slow
            )

            if resp.status_code != 200:
                logger.warning(f"FIRMS {product} API returned status {resp.status_code}")
                continue

            # Parse CSV response
            lines = resp.text.strip().split("\n")
            if len(lines) < 2:
                logger.warning(f"FIRMS {product} returned empty CSV (header only)")
                continue

            # Parse header
            header = lines[0].split(",")
            lat_idx = _find_index(header, "latitude")
            lng_idx = _find_index(header, "longitude")
            conf_idx = _find_index(header, "confidence")
            date_idx = _find_index(header, "acq_date")
            sat_idx = _find_index(header, "satellite")
            frp_idx = _find_index(header, "frp")

            if lat_idx is None or lng_idx is None:
                logger.warning(f"FIRMS {product} CSV missing required columns")
                continue

            results = []
            for line in lines[1:]:
                cols = line.split(",")
                try:
                    lat = float(cols[lat_idx]) if lat_idx < len(cols) else 0.0
                    lng = float(cols[lng_idx]) if lng_idx < len(cols) else 0.0
                    confidence = (
                        cols[conf_idx].strip()
                        if conf_idx is not None and conf_idx < len(cols)
                        else "unknown"
                    )
                    acq_date = (
                        cols[date_idx].strip()
                        if date_idx is not None and date_idx < len(cols)
                        else ""
                    )
                    satellite = (
                        cols[sat_idx].strip()
                        if sat_idx is not None and sat_idx < len(cols)
                        else product
                    )
                    frp = 0.0
                    if frp_idx is not None and frp_idx < len(cols):
                        try:
                            frp = float(cols[frp_idx])
                        except ValueError:
                            frp = 0.0

                    results.append({
                        "lat": lat,
                        "lng": lng,
                        "confidence": confidence,
                        "acq_date": acq_date,
                        "satellite": satellite,
                        "frp": frp,
                    })
                except (ValueError, IndexError) as e:
                    logger.debug(f"Skipping malformed FIRMS row: {e}")
                    continue

            # Limit to reasonable number of results
            results = results[:500]

            if results:
                logger.info(
                    f"Fetched {len(results)} fire detections from FIRMS {product}"
                )
                return results
            else:
                logger.warning(f"FIRMS {product} returned 0 data rows, trying next product")
                continue

        except Exception as e:
            logger.error(f"Error fetching fires from {product}: {e}")
            continue

    logger.warning("All FIRMS products returned empty data")
    return []


def _find_index(header: list[str], column_name: str) -> int | None:
    """Find column index by name (case-insensitive)."""
    for i, h in enumerate(header):
        if h.strip().lower() == column_name.lower():
            return i
    return None
