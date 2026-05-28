"""GPS Jamming / Spoofing data scraper.

Fetches GPS interference data from GPSJam (https://gpsjam.org).
Uses the GPSJam API endpoint for current interference data, with HTML
scraping fallback if the API is unavailable.
FREE, no API key required.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from config import GPSJAM_API_URL, GPSJAM_HTML_URL, USER_AGENT, HTTP_TIMEOUT

logger = logging.getLogger(__name__)

# Region-to-coordinate mapping for known GPS interference hotspots
# Used when API returns region names without coordinates
_REGION_COORDS: dict[str, tuple[float, float]] = {
    "baltic": (56.0, 20.0),
    "black sea": (43.5, 34.0),
    "eastern mediterranean": (34.0, 34.5),
    "middle east": (33.0, 44.0),
    "ukraine": (48.4, 31.2),
    "russia": (55.7, 37.6),
    "arctic": (75.0, 20.0),
    "norway": (62.0, 10.0),
    "finland": (64.0, 26.0),
    "poland": (52.0, 19.0),
    "turkey": (39.0, 35.0),
    "iraq": (33.2, 43.7),
    "syria": (35.0, 38.0),
    "israel": (31.5, 35.0),
    "lebanon": (33.9, 35.5),
    "georgia": (42.0, 43.5),
    "romania": (46.0, 25.0),
    "latvia": (57.0, 25.0),
    "lithuania": (56.0, 24.0),
    "estonia": (59.0, 26.0),
    "kaliningrad": (54.7, 20.5),
}


def _classify_severity(affected_percent: float) -> str:
    """Classify GPS interference severity based on percentage of affected aircraft.

    Args:
        affected_percent: Percentage of aircraft affected (0-100)

    Returns:
        Severity string: "low", "moderate", or "severe"
    """
    if affected_percent >= 20.0:
        return "severe"
    elif affected_percent >= 5.0:
        return "moderate"
    else:
        return "low"


def _lookup_region_coords(region_name: str) -> tuple[float, float]:
    """Look up approximate coordinates for a region name.

    Args:
        region_name: Lowercase region name

    Returns:
        (lat, lon) tuple, defaults to (0, 0) if unknown
    """
    key = region_name.lower().strip()
    for known_region, coords in _REGION_COORDS.items():
        if known_region in key or key in known_region:
            return coords
    return (0.0, 0.0)


async def fetch_gps_jamming(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch GPS jamming/spoofing data from GPSJam.

    Tries the JSON API first, then falls back to HTML scraping.

    Returns:
        List of GPS jamming dicts with keys:
        region, lat, lon, severity, description, time, source
    """
    results = []

    # ── Strategy 1: Try the JSON API ──
    try:
        resp = await client.get(
            GPSJAM_API_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code == 200:
            data = resp.json()

            # GPSJam API may return a dict of regions or a list
            if isinstance(data, dict):
                # Could be keyed by region or have a "features" list
                features = data.get("features", [])
                if features:
                    results = _parse_geojson_features(features)
                else:
                    # Treat top-level keys as region entries
                    results = _parse_region_dict(data)
            elif isinstance(data, list):
                results = _parse_api_list(data)

            if results:
                logger.info(f"Fetched {len(results)} GPS jamming regions from API")
                return results

    except Exception as e:
        logger.debug(f"GPSJam API request failed: {e}, trying HTML fallback")

    # ── Strategy 2: Scrape the HTML page ──
    try:
        resp = await client.get(
            GPSJAM_HTML_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code == 200:
            results = _parse_gpsjam_html(resp.text)
            if results:
                logger.info(f"Fetched {len(results)} GPS jamming regions from HTML")
                return results

    except Exception as e:
        logger.error(f"GPSJam HTML scraping failed: {e}")

    logger.warning("GPSJam data unavailable from all sources")
    return []


def _parse_geojson_features(features: list) -> list[dict[str, Any]]:
    """Parse GeoJSON features from GPSJam API."""
    results = []
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    for feature in features:
        try:
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [0, 0])

            region = props.get("region", props.get("name", "Unknown"))
            affected = float(props.get("affected", props.get("percent", 0)))
            lat = coords[1] if len(coords) >= 2 else 0
            lon = coords[0] if len(coords) >= 2 else 0

            if lat == 0 and lon == 0:
                lat, lon = _lookup_region_coords(region)

            severity = _classify_severity(affected)
            description = props.get("description", f"GPS interference: {affected:.1f}% of aircraft affected")

            results.append({
                "region": region,
                "lat": lat,
                "lon": lon,
                "severity": severity,
                "description": description,
                "time": now_iso,
                "source": "GPSJam",
            })
        except Exception as e:
            logger.debug(f"Skipping malformed GPSJam feature: {e}")
            continue

    return results


def _parse_region_dict(data: dict) -> list[dict[str, Any]]:
    """Parse region-keyed dict from GPSJam API."""
    results = []
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    for region_name, info in data.items():
        # Skip metadata keys
        if region_name.startswith("_") or region_name in ("time", "updated", "generated"):
            continue

        try:
            if isinstance(info, dict):
                affected = float(info.get("affected", info.get("percent", 0)))
                lat = float(info.get("lat", 0))
                lon = float(info.get("lon", 0))
            elif isinstance(info, (int, float)):
                affected = float(info)
                lat, lon = 0.0, 0.0
            else:
                continue

            if lat == 0 and lon == 0:
                lat, lon = _lookup_region_coords(region_name)

            severity = _classify_severity(affected)
            description = f"GPS interference: {affected:.1f}% of aircraft affected"

            results.append({
                "region": region_name,
                "lat": lat,
                "lon": lon,
                "severity": severity,
                "description": description,
                "time": now_iso,
                "source": "GPSJam",
            })
        except Exception as e:
            logger.debug(f"Skipping GPSJam region entry '{region_name}': {e}")
            continue

    return results


def _parse_api_list(data: list) -> list[dict[str, Any]]:
    """Parse list-format response from GPSJam API."""
    results = []
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    for entry in data:
        if not isinstance(entry, dict):
            continue

        try:
            region = entry.get("region", entry.get("name", "Unknown"))
            affected = float(entry.get("affected", entry.get("percent", 0)))
            lat = float(entry.get("lat", 0))
            lon = float(entry.get("lon", 0))

            if lat == 0 and lon == 0:
                lat, lon = _lookup_region_coords(region)

            severity = _classify_severity(affected)
            description = entry.get("description", f"GPS interference: {affected:.1f}% of aircraft affected")

            results.append({
                "region": region,
                "lat": lat,
                "lon": lon,
                "severity": severity,
                "description": description,
                "time": now_iso,
                "source": "GPSJam",
            })
        except Exception as e:
            logger.debug(f"Skipping malformed GPSJam entry: {e}")
            continue

    return results


def _parse_gpsjam_html(html: str) -> list[dict[str, Any]]:
    """Parse GPSJam HTML page to extract interference data.

    GPSJam embeds data as JSON in script tags or renders it in the page.
    This scraper looks for embedded JSON data and also parses visible
    region/severity information.
    """
    results = []
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    # ── Try to find embedded JSON data in script tags ──
    json_pattern = re.compile(
        r'(?:window\.__DATA__|window\.data|var\s+data)\s*=\s*(\{.*?\});',
        re.DOTALL,
    )
    match = json_pattern.search(html)
    if match:
        try:
            data = json.loads(match.group(1))
            parsed = _parse_region_dict(data)
            if parsed:
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass

    # ── Try to find a JSON array in script tags ──
    array_pattern = re.compile(
        r'(?:window\.__DATA__|window\.data|var\s+data)\s*=\s*(\[.*?\]);',
        re.DOTALL,
    )
    match = array_pattern.search(html)
    if match:
        try:
            data = json.loads(match.group(1))
            parsed = _parse_api_list(data)
            if parsed:
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass

    # ── Parse HTML for region elements with severity classes ──
    # GPSJam uses CSS classes like "severity-1", "severity-2", "severity-3"
    # on map regions
    severity_map = {
        "1": "low",
        "2": "moderate",
        "3": "severe",
    }

    # Look for data attributes in SVG/HTML elements
    region_pattern = re.compile(
        r'data-region=["\']([^"\']+)["\'].*?data-severity=["\'](\d)["\']',
        re.DOTALL,
    )
    for match in region_pattern.finditer(html):
        region_name = match.group(1)
        severity_num = match.group(2)
        severity = severity_map.get(severity_num, "low")
        lat, lon = _lookup_region_coords(region_name)

        results.append({
            "region": region_name,
            "lat": lat,
            "lon": lon,
            "severity": severity,
            "description": f"GPS interference detected in {region_name}",
            "time": now_iso,
            "source": "GPSJam",
        })

    # ── Fallback: look for table rows with region data ──
    if not results:
        row_pattern = re.compile(
            r'<tr[^>]*>.*?<td[^>]*>([^<]+)</td>.*?<td[^>]*>(\d+(?:\.\d+)?)%</td>',
            re.DOTALL,
        )
        for match in row_pattern.finditer(html):
            region_name = match.group(1).strip()
            affected = float(match.group(2))
            if affected < 0.5:
                continue  # Skip negligible interference

            lat, lon = _lookup_region_coords(region_name)
            severity = _classify_severity(affected)

            results.append({
                "region": region_name,
                "lat": lat,
                "lon": lon,
                "severity": severity,
                "description": f"GPS interference: {affected:.1f}% of aircraft affected",
                "time": now_iso,
                "source": "GPSJam",
            })

    return results
