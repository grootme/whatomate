"""UAV / Drone activity scraper.

Fetches UAV/drone position data from OpenSky Network API and
drone-related NOTAMs from the FAA.
APIs:
  - OpenSky Network: https://opensky-network.org/api/states/all (FREE, rate-limited)
  - FAA NOTAM Search: https://notams.aim.faa.gov/notamSearch/ (FREE, public)
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from config import (
    OPENSKY_URL,
    OPENSKY_USERNAME,
    OPENSKY_PASSWORD,
    FAA_NOTAM_URL,
    UAV_CALLSIGN_PREFIXES,
    USER_AGENT,
    HTTP_TIMEOUT,
)

logger = logging.getLogger(__name__)


def _is_uav_callsign(callsign: str) -> bool:
    """Check if a callsign matches known UAV/drone patterns.

    Args:
        callsign: Aircraft callsign string

    Returns:
        True if callsign matches a UAV/drone prefix
    """
    if not callsign:
        return False

    cs = callsign.strip().upper()

    for prefix in UAV_CALLSIGN_PREFIXES:
        if cs.startswith(prefix.upper()):
            return True

    return False


def _classify_uav_type(callsign: str) -> str:
    """Classify UAV type based on callsign prefix.

    Args:
        callsign: Aircraft callsign string

    Returns:
        UAV type classification string
    """
    cs = callsign.strip().upper()

    if cs.startswith("MQ"):
        return "UAV (MQ Predator/Reaper)"
    elif cs.startswith("RQ"):
        return "UAV (RQ Global Hawk/Sentinel)"
    elif cs.startswith("GAU"):
        return "UAV (GAU Guardian)"
    elif cs.startswith("TUAV"):
        return "UAV (Tactical)"
    elif cs.startswith("UAV"):
        return "UAV (General)"
    elif cs.startswith("RPA"):
        return "RPA (Remotely Piloted Aircraft)"
    elif cs.startswith("DRN"):
        return "Drone (General)"
    else:
        return "UAV (Unknown)"


async def fetch_uavs(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch UAV/drone activity from OpenSky Network and FAA NOTAMs.

    Uses OpenSky Network to find aircraft with UAV callsign prefixes,
    then supplements with drone-related NOTAMs from the FAA.

    Returns:
        List of UAV dicts with keys: callsign, type, altitude, lat, lon, heading, zone, time
    """
    results: list[dict[str, Any]] = []
    seen_callsigns: set[str] = set()
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    # ── Strategy 1: OpenSky Network — filter for UAV callsigns ──
    try:
        # Add Basic auth if credentials are available (increases rate limits)
        auth = None
        if OPENSKY_USERNAME and OPENSKY_PASSWORD:
            auth = (OPENSKY_USERNAME, OPENSKY_PASSWORD)

        resp = await client.get(
            OPENSKY_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
            auth=auth,
        )

        if resp.status_code == 429:
            logger.warning("OpenSky rate limit hit while fetching UAVs")
        elif resp.status_code == 200:
            data = resp.json()
            states = data.get("states", [])

            for state in states:
                if len(state) < 10:
                    continue

                callsign = (state[1] or "").strip()
                if not _is_uav_callsign(callsign):
                    continue

                # Deduplicate by callsign
                if callsign in seen_callsigns:
                    continue
                seen_callsigns.add(callsign)

                origin_country = state[2] or "Unknown"
                longitude = state[5]
                latitude = state[6]
                altitude = state[7] or 0
                heading = state[10]  # true_track (heading in degrees)

                # Skip if no position data
                if latitude is None or longitude is None:
                    continue

                uav_type = _classify_uav_type(callsign)

                results.append({
                    "callsign": callsign,
                    "type": uav_type,
                    "altitude": float(altitude) if altitude else 0,
                    "lat": float(latitude),
                    "lon": float(longitude),
                    "heading": float(heading) if heading else 0,
                    "zone": origin_country,
                    "time": now_iso,
                })

            logger.info(f"Fetched {len(results)} UAVs from OpenSky Network")
        else:
            logger.warning(f"OpenSky returned status {resp.status_code} for UAV query")

    except Exception as e:
        logger.error(f"Error fetching UAVs from OpenSky: {e}")

    # ── Strategy 2: FAA NOTAMs for drone-related notices ──
    try:
        notam_results = await _fetch_drone_notams(client, now_iso)
        # Add NOTAMs that don't duplicate existing callsign entries
        for notam in notam_results:
            cs = notam.get("callsign", "")
            if cs not in seen_callsigns:
                results.append(notam)
                seen_callsigns.add(cs)

        if notam_results:
            logger.info(f"Fetched {len(notam_results)} drone-related NOTAMs from FAA")

    except Exception as e:
        logger.error(f"Error fetching drone NOTAMs: {e}")

    # Limit results
    results = results[:100]

    logger.info(f"Total UAV/drone entries: {len(results)}")
    return results


async def _fetch_drone_notams(
    client: httpx.AsyncClient, now_iso: str
) -> list[dict[str, Any]]:
    """Fetch drone-related NOTAMs from the FAA.

    Searches for NOTAMs containing drone/UAV keywords.
    FAA NOTAM Search is a public web service.

    Args:
        client: httpx async client
        now_iso: Current ISO timestamp

    Returns:
        List of UAV dicts derived from NOTAMs
    """
    results = []

    try:
        # FAA NOTAM search API - POST with form data
        # Search for drone/UAV related NOTAMs
        search_payload = {
            "searchType": 0,  # 0 = search by location
            "designatorsForLocationIdentifier": "",
            "notamType": "N",  # N = NOTAM
            "formatType": "DOMESTIC",
            "q": "drone OR UAV OR UAS OR unmanned",
        }

        resp = await client.post(
            FAA_NOTAM_URL,
            data=search_payload,
            headers={
                "User-Agent": USER_AGENT,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code != 200:
            logger.debug(f"FAA NOTAM search returned status {resp.status_code}")
            return results

        text = resp.text

        # Parse NOTAM entries from the response
        # NOTAMs typically follow a format like:
        # !LAX 03/123 - AIRSPACE UNMANNED ACFT OPS ...
        notam_pattern = re.compile(
            r'!(\w{3,4})\s+(\d{2}/\d{3})\s*[-–]\s*(.*?)(?=!\w{3,4}\s+\d{2}/\d{3}|$)',
            re.DOTALL,
        )

        for match in notam_pattern.finditer(text):
            location = match.group(1)
            notam_id = match.group(2)
            description = match.group(3).strip()

            # Check if NOTAM is drone-related
            desc_lower = description.lower()
            if not any(kw in desc_lower for kw in ("drone", "uav", "uas", "unmanned", "rpas")):
                continue

            # Extract coordinates if available (DD format or DMS)
            lat, lon = _extract_coords_from_notam(description)

            results.append({
                "callsign": f"NOTAM-{location}-{notam_id}",
                "type": "Drone NOTAM",
                "altitude": 0,
                "lat": lat,
                "lon": lon,
                "heading": 0,
                "zone": location,
                "time": now_iso,
            })

    except Exception as e:
        logger.debug(f"FAA NOTAM fetch failed: {e}")

    return results


def _extract_coords_from_notam(text: str) -> tuple[float, float]:
    """Try to extract lat/lon coordinates from a NOTAM text.

    NOTAMs may contain coordinates in various formats:
    - DD: 340830N1181456W
    - DMS: 34-08-30N 118-14-56W

    Args:
        text: NOTAM description text

    Returns:
        (lat, lon) tuple, defaults to (0, 0)
    """
    # Try DD format: DDMMSSN/DDDMMSSW
    coord_pattern = re.compile(
        r'(\d{2})(\d{2})(\d{2})([NS])\s*(\d{3})(\d{2})(\d{2})([EW])',
    )
    match = coord_pattern.search(text)
    if match:
        try:
            lat = int(match.group(1)) + int(match.group(2)) / 60 + int(match.group(3)) / 3600
            if match.group(4) == "S":
                lat = -lat
            lon = int(match.group(5)) + int(match.group(6)) / 60 + int(match.group(7)) / 3600
            if match.group(8) == "W":
                lon = -lon
            return (lat, lon)
        except (ValueError, IndexError):
            pass

    # Try decimal degree format: 34.14N 118.25W
    dec_pattern = re.compile(
        r'(\d+\.\d+)\s*([NS])\s*(\d+\.\d+)\s*([EW])',
    )
    match = dec_pattern.search(text)
    if match:
        try:
            lat = float(match.group(1))
            if match.group(2) == "S":
                lat = -lat
            lon = float(match.group(3))
            if match.group(4) == "W":
                lon = -lon
            return (lat, lon)
        except (ValueError, IndexError):
            pass

    return (0.0, 0.0)
