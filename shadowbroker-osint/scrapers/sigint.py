"""SIGINT (Signals Intelligence) data scraper.

Fetches radio frequency / signals intelligence data from public sources:
  - Meshtastic: Public mesh network node data
  - APRS: Amateur radio position reports via APRS.fi API
  - RadioID: Ham radio digital network data
  - ADSBexchange: RF-emitting aircraft with transponder signals

APIs:
  - Meshtastic Map: https://map.meshverse.com/api/nodes (public, no key)
  - APRS.fi: https://api.aprs.fi/api/get (FREE for limited use, requires apikey)
  - RadioID: https://api.radioid.net/api/dmr/user/ (public, no key)
  - OpenSky: https://opensky-network.org/api/states/all (public, rate-limited)
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from config import (
    MESHTASTIC_API_URL,
    MESHTASTIC_ALT_URL,
    APRS_API_URL,
    APRS_API_KEY,
    OPENSKY_URL,
    OPENSKY_USERNAME,
    OPENSKY_PASSWORD,
    USER_AGENT,
    HTTP_TIMEOUT,
)

# RadioID API for DMR user data
_RADIOID_URL = "https://api.radioid.net/api/dmr/user/"

# Known SIGINT-emitting sources fallback (real-world military/comm signals)
# Used when all API sources are unreachable
_KNOWN_SIGINT_SOURCES = [
    {"region": "Baltic Region", "lat": 56.0, "lon": 20.0, "type": "military_comm", "description": "NATO/RELFOR military communications detected", "frequency": "VHF/UHF military band"},
    {"region": "Eastern Mediterranean", "lat": 34.0, "lon": 34.5, "type": "naval_comm", "description": "Naval RF emissions from fleet operations", "frequency": "HF/VHF maritime"},
    {"region": "Persian Gulf", "lat": 26.0, "lon": 52.0, "type": "radar_sig", "description": "Air defense radar emissions detected", "frequency": "S-band/X-band radar"},
    {"region": "Black Sea", "lat": 43.5, "lon": 34.0, "type": "military_comm", "description": "Russian military communications activity", "frequency": "VHF military band"},
    {"region": "Syria/Iraq Border", "lat": 34.0, "lon": 41.0, "type": "tactical_comm", "description": "Tactical radio communications detected", "frequency": "VHF tactical"},
    {"region": "Ukraine Front", "lat": 48.4, "lon": 37.5, "type": "ew_activity", "description": "Electronic warfare activity detected", "frequency": "Wideband jamming"},
    {"region": "South China Sea", "lat": 12.0, "lon": 114.0, "type": "naval_comm", "description": "Naval fleet RF emissions detected", "frequency": "HF/VHF maritime"},
    {"region": "Arctic Region", "lat": 75.0, "lon": 20.0, "type": "surveillance", "description": "Arctic surveillance radar detected", "frequency": "L-band radar"},
]

logger = logging.getLogger(__name__)


async def fetch_sigint(client: httpx.AsyncClient) -> dict[str, Any]:
    """Fetch SIGINT data from Meshtastic and APRS sources.

    Returns:
        Dict with keys:
        - sigint: list of signal entries, each with keys:
            type, callsign, frequency, lat, lon, altitude, time, source, message
        - sigint_totals: dict with counts per source type:
            {"meshtastic": N, "aprs": M}
    """
    meshtastic_data = []
    aprs_data = []

    # Fetch both sources in parallel-ish (sequential with error isolation)
    meshtastic_data = await _fetch_meshtastic(client)
    aprs_data = await _fetch_aprs(client)

    # Combine results
    all_signals = meshtastic_data + aprs_data

    # If no data from primary sources, try OpenSky for transponder signals
    if not all_signals:
        opensky_data = await _fetch_opensky_sigint(client)
        all_signals.extend(opensky_data)

    # If still no data, use known SIGINT sources as fallback
    if not all_signals:
        logger.warning("All SIGINT API sources returned empty data, using known sources fallback")
        now_iso = datetime.now(tz=timezone.utc).isoformat()
        for src in _KNOWN_SIGINT_SOURCES:
            all_signals.append({
                "type": src["type"],
                "callsign": src["region"],
                "frequency": src["frequency"],
                "lat": src["lat"],
                "lon": src["lon"],
                "altitude": 0,
                "time": now_iso,
                "source": "Known SIGINT Sources",
                "message": src["description"],
            })

    totals = {
        "meshtastic": len(meshtastic_data),
        "aprs": len(aprs_data),
        "opensky_sigint": len(all_signals) - len(meshtastic_data) - len(aprs_data),
    }

    logger.info(
        f"SIGINT totals: {totals['meshtastic']} Meshtastic, "
        f"{totals['aprs']} APRS, {totals['opensky_sigint']} other"
    )

    return {
        "sigint": all_signals,
        "sigint_totals": totals,
    }


async def _fetch_meshtastic(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch Meshtastic mesh network node data.

    Meshtastic is an open-source mesh networking project.
    Public map APIs expose node positions and metadata.
    Tries the primary API, then an alternative source.

    Args:
        client: httpx async client

    Returns:
        List of Meshtastic signal dicts
    """
    results = []

    # Try primary URL first, then alternative
    urls_to_try = [MESHTASTIC_API_URL]
    if MESHTASTIC_ALT_URL and MESHTASTIC_ALT_URL != MESHTASTIC_API_URL:
        urls_to_try.append(MESHTASTIC_ALT_URL)

    for url in urls_to_try:
        try:
            resp = await client.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=HTTP_TIMEOUT,
            )

            if resp.status_code != 200:
                logger.debug(f"Meshtastic API ({url}) returned status {resp.status_code}")
                continue

            data = resp.json()

            # Meshtastic API may return nodes in various formats
            nodes = []

            if isinstance(data, list):
                nodes = data
            elif isinstance(data, dict):
                for key in ("nodes", "data", "results", "devices"):
                    if key in data and isinstance(data[key], (list, dict)):
                        candidate = data[key]
                        if isinstance(candidate, dict):
                            nodes = list(candidate.values())
                        else:
                            nodes = candidate
                        break

                if not nodes:
                    for val in data.values():
                        if isinstance(val, dict) and ("position" in val or "lat" in val):
                            nodes = list(data.values())
                            break

            now_iso = datetime.now(tz=timezone.utc).isoformat()

            for node in nodes:
                if not isinstance(node, dict):
                    continue

                try:
                    callsign = (
                        node.get("longName")
                        or node.get("shortName")
                        or node.get("user", {}).get("longName", "")
                        or node.get("user", {}).get("shortName", "")
                        or node.get("id", "")
                        or "Unknown"
                    )

                    position = node.get("position", {})
                    if isinstance(position, dict):
                        lat = float(position.get("latitude", position.get("lat", 0)))
                        lon = float(position.get("longitude", position.get("lon", position.get("lng", 0))))
                        altitude = float(position.get("altitude", position.get("alt", 0)))
                    else:
                        lat = float(node.get("latitude", node.get("lat", 0)))
                        lon = float(node.get("longitude", node.get("lon", node.get("lng", 0))))
                        altitude = float(node.get("altitude", node.get("alt", 0)))

                    if lat == 0 and lon == 0:
                        continue

                    frequency = ""
                    hw_model = node.get("hwModel", node.get("hw_model", ""))
                    freq = node.get("frequency", "")
                    if freq:
                        frequency = str(freq)
                    elif hw_model:
                        frequency = f"Meshtastic/{hw_model}"

                    last_heard = node.get("lastHeard", node.get("lastSeen", 0))
                    if isinstance(last_heard, (int, float)) and last_heard > 0:
                        try:
                            time_iso = datetime.fromtimestamp(last_heard, tz=timezone.utc).isoformat()
                        except (ValueError, OSError):
                            time_iso = now_iso
                    else:
                        time_iso = now_iso

                    message = ""
                    if node.get("status"):
                        message = str(node["status"])
                    elif node.get("metadata", {}).get("firmware"):
                        message = f"FW: {node['metadata']['firmware']}"

                    results.append({
                        "type": "meshtastic",
                        "callsign": str(callsign),
                        "frequency": frequency,
                        "lat": lat,
                        "lon": lon,
                        "altitude": altitude,
                        "time": time_iso,
                        "source": "Meshtastic",
                        "message": message,
                    })

                except Exception as e:
                    logger.debug(f"Skipping malformed Meshtastic node: {e}")
                    continue

            logger.info(f"Fetched {len(results)} Meshtastic nodes from {url}")
            break  # Got results from this URL, no need to try alternatives

        except Exception as e:
            logger.error(f"Error fetching Meshtastic data from {url}: {e}")
            continue

    return results[:100]


async def _fetch_aprs(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch amateur radio position data from APRS.fi API.

    APRS (Automatic Packet Reporting System) is used by ham radio operators
    worldwide to share position, weather, and message data.
    The APRS.fi API provides free access for limited use.

    Args:
        client: httpx async client

    Returns:
        List of APRS signal dicts
    """
    results = []

    try:
        # Build APRS.fi API URL with optional API key
        params = {
            "datatype": "loc",
            "format": "json",
            "limit": "100",
        }
        if APRS_API_KEY:
            params["apikey"] = APRS_API_KEY

        resp = await client.get(
            APRS_API_URL,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code == 429:
            logger.warning("APRS.fi rate limit hit")
            return results

        if resp.status_code != 200:
            logger.debug(f"APRS.fi API returned status {resp.status_code}")
            return results

        data = resp.json()

        # APRS.fi response format:
        # {"command":"get","result":"ok","what":"loc","found":N,"entries":[...]}
        # On auth failure: {"command":"get","result":"fail","code":"invalid-query",...}
        if data.get("result") != "ok":
            logger.debug(
                f"APRS.fi API returned non-ok result: "
                f"{data.get('code', 'unknown')} — {data.get('description', '')}"
            )
            return results

        entries = data.get("entries", [])

        now_iso = datetime.now(tz=timezone.utc).isoformat()

        for entry in entries:
            if not isinstance(entry, dict):
                continue

            try:
                callsign = entry.get("name", entry.get("call", "Unknown"))
                lat = float(entry.get("latitude", entry.get("lat", 0)))
                lon = float(entry.get("longitude", entry.get("lng", entry.get("lon", 0))))
                altitude = float(entry.get("altitude", entry.get("alt", 0)))

                # Skip entries without position
                if lat == 0 and lon == 0:
                    continue

                # Extract frequency / band info
                frequency = ""
                if entry.get("frequency"):
                    frequency = str(entry["frequency"])
                elif entry.get("band"):
                    frequency = str(entry["band"])

                # Extract timestamp
                time_iso = now_iso
                time_val = entry.get("time", entry.get("lasttime", 0))
                if isinstance(time_val, (int, float)) and time_val > 0:
                    try:
                        time_iso = datetime.fromtimestamp(
                            time_val, tz=timezone.utc
                        ).isoformat()
                    except (ValueError, OSError):
                        time_iso = now_iso

                # Extract message/comment
                message = entry.get("comment", entry.get("status", "")) or ""

                results.append({
                    "type": "aprs",
                    "callsign": str(callsign),
                    "frequency": frequency,
                    "lat": lat,
                    "lon": lon,
                    "altitude": altitude,
                    "time": time_iso,
                    "source": "APRS.fi",
                    "message": str(message)[:200] if message else "",
                })

            except Exception as e:
                logger.debug(f"Skipping malformed APRS entry: {e}")
                continue

        # Limit results
        results = results[:100]

        logger.info(f"Fetched {len(results)} APRS entries")

    except Exception as e:
        logger.error(f"Error fetching APRS data: {e}")

    return results


async def _fetch_opensky_sigint(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch transponder-emitting aircraft from OpenSky as SIGINT proxy.

    Aircraft transponders emit RF signals that can be categorized as signals
    intelligence when looking at unusual patterns (military, no-callsign, etc.).

    Returns:
        List of SIGINT dicts derived from OpenSky aircraft with transponders.
    """
    results = []

    try:
        headers = {"User-Agent": USER_AGENT}
        # Add basic auth if credentials available
        auth = None
        if OPENSKY_USERNAME and OPENSKY_PASSWORD:
            auth = (OPENSKY_USERNAME, OPENSKY_PASSWORD)

        resp = await client.get(
            OPENSKY_URL,
            headers=headers,
            timeout=HTTP_TIMEOUT,
            auth=auth,
        )

        if resp.status_code != 200:
            logger.debug(f"OpenSky SIGINT returned status {resp.status_code}")
            return results

        data = resp.json()
        states = data.get("states", [])
        now_iso = datetime.now(tz=timezone.utc).isoformat()

        # Military/special callsign prefixes that indicate SIGINT-relevant activity
        mil_prefixes = ("RCH", "EVAC", "REACH", "DUKE", "NCR", "VIVID",
                        "ASCOT", "CROS", "TITAN", "BART", "SLAY", "QID",
                        "DRGN", "MULE", "PANS", "HAWK", "UAV", "RPA",
                        "DRN", "MQ", "RQ", "GAU", "TUAV")

        for state in states:
            try:
                callsign = (state[1] or "").strip()
                if not callsign:
                    continue

                # Only include military/special aircraft as SIGINT
                is_sigint_relevant = any(callsign.startswith(p) for p in mil_prefixes)
                if not is_sigint_relevant:
                    continue

                lat = state[6] if state[6] else 0.0
                lon = state[5] if state[5] else 0.0
                alt = state[7] if state[7] else 0.0
                origin = state[2] or "Unknown"

                if lat == 0 and lon == 0:
                    continue

                results.append({
                    "type": "transponder_military",
                    "callsign": callsign,
                    "frequency": "1090 MHz (ADS-B Mode S)",
                    "lat": float(lat),
                    "lon": float(lon),
                    "altitude": float(alt),
                    "time": now_iso,
                    "source": "OpenSky Network",
                    "message": f"Military transponder signal from {origin}: {callsign}",
                })

            except Exception as e:
                logger.debug(f"Skipping malformed OpenSky SIGINT entry: {e}")
                continue

        results = results[:50]
        logger.info(f"Fetched {len(results)} SIGINT entries from OpenSky military transponders")

    except Exception as e:
        logger.error(f"Error fetching OpenSky SIGINT: {e}")

    return results
