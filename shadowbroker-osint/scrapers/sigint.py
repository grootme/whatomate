"""SIGINT (Signals Intelligence) data scraper.

Fetches radio frequency / signals intelligence data from public sources:
  - Meshtastic: Public mesh network node data
  - APRS: Amateur radio position reports via APRS.fi API

APIs:
  - Meshtastic Map: https://map.meshverse.com/api/nodes (public, no key)
  - APRS.fi: https://api.aprs.fi/api/get (FREE for limited use, no key required)
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from config import (
    MESHTASTIC_API_URL,
    APRS_API_URL,
    APRS_API_KEY,
    USER_AGENT,
    HTTP_TIMEOUT,
)

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

    totals = {
        "meshtastic": len(meshtastic_data),
        "aprs": len(aprs_data),
    }

    logger.info(
        f"SIGINT totals: {totals['meshtastic']} Meshtastic, "
        f"{totals['aprs']} APRS"
    )

    return {
        "sigint": all_signals,
        "sigint_totals": totals,
    }


async def _fetch_meshtastic(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch Meshtastic mesh network node data.

    Meshtastic is an open-source mesh networking project.
    Public map APIs expose node positions and metadata.

    Args:
        client: httpx async client

    Returns:
        List of Meshtastic signal dicts
    """
    results = []

    try:
        resp = await client.get(
            MESHTASTIC_API_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code != 200:
            logger.debug(f"Meshtastic API returned status {resp.status_code}")
            return results

        data = resp.json()

        # Meshtastic API may return nodes in various formats
        nodes = []

        if isinstance(data, list):
            nodes = data
        elif isinstance(data, dict):
            # Could be under "nodes", "data", "results", or keyed by node ID
            for key in ("nodes", "data", "results", "devices"):
                if key in data and isinstance(data[key], (list, dict)):
                    candidate = data[key]
                    if isinstance(candidate, dict):
                        # Dict keyed by node ID — flatten to list
                        nodes = list(candidate.values())
                    else:
                        nodes = candidate
                    break

            # If still no nodes found, try treating the top-level dict
            # as keyed by node IDs
            if not nodes:
                # Check if values look like node objects (have position data)
                for val in data.values():
                    if isinstance(val, dict) and ("position" in val or "lat" in val):
                        nodes = list(data.values())
                        break

        now_iso = datetime.now(tz=timezone.utc).isoformat()

        for node in nodes:
            if not isinstance(node, dict):
                continue

            try:
                # Extract node identity
                callsign = (
                    node.get("longName")
                    or node.get("shortName")
                    or node.get("user", {}).get("longName", "")
                    or node.get("user", {}).get("shortName", "")
                    or node.get("id", "")
                    or "Unknown"
                )

                # Extract position data
                position = node.get("position", {})
                if isinstance(position, dict):
                    lat = float(position.get("latitude", position.get("lat", 0)))
                    lon = float(position.get("longitude", position.get("lon", position.get("lng", 0))))
                    altitude = float(position.get("altitude", position.get("alt", 0)))
                else:
                    lat = float(node.get("latitude", node.get("lat", 0)))
                    lon = float(node.get("longitude", node.get("lon", node.get("lng", 0))))
                    altitude = float(node.get("altitude", node.get("alt", 0)))

                # Skip nodes without position
                if lat == 0 and lon == 0:
                    continue

                # Extract frequency
                frequency = ""
                hw_model = node.get("hwModel", node.get("hw_model", ""))
                freq = node.get("frequency", "")
                if freq:
                    frequency = str(freq)
                elif hw_model:
                    frequency = f"Meshtastic/{hw_model}"

                # Extract last heard time
                last_heard = node.get("lastHeard", node.get("lastSeen", 0))
                if isinstance(last_heard, (int, float)) and last_heard > 0:
                    try:
                        time_iso = datetime.fromtimestamp(
                            last_heard, tz=timezone.utc
                        ).isoformat()
                    except (ValueError, OSError):
                        time_iso = now_iso
                else:
                    time_iso = now_iso

                # Extract message/snippet
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

        # Limit results
        results = results[:100]

        logger.info(f"Fetched {len(results)} Meshtastic nodes")

    except Exception as e:
        logger.error(f"Error fetching Meshtastic data: {e}")

    return results


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
