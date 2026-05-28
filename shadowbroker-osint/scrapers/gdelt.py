"""GDELT Project API scraper.

Fetches recent conflict-related events from the GDELT database.
API: https://api.gdeltproject.org/api/v2/doc/doc?query=war%20conflict&mode=artlist&maxrecords=20&format=json
FREE, no API key required.

Note: GDELT may be unreachable from some environments due to firewall restrictions.
This scraper includes robust timeout and fallback handling.
"""

import asyncio
import logging
import socket
from typing import Any

import httpx

from config import GDELT_URL, USER_AGENT

logger = logging.getLogger(__name__)

# Fallback sample data when GDELT is unavailable
FALLBACK_GDELT = [
    {"name": "Conflict escalation in Middle East region", "lat": 33.0, "lng": 44.0, "url": ""},
    {"name": "Border tensions reported in South Asia", "lat": 34.0, "lng": 74.0, "url": ""},
    {"name": "Maritime disputes in South China Sea", "lat": 12.0, "lng": 114.0, "url": ""},
    {"name": "Ceasefire negotiations in Eastern Europe", "lat": 48.0, "lng": 37.0, "url": ""},
    {"name": "Humanitarian crisis in Sub-Saharan Africa", "lat": 4.0, "lng": 30.0, "url": ""},
]


async def _check_connectivity() -> bool:
    """Quick check if GDELT API is reachable via TCP."""
    try:
        # Try to establish a TCP connection with a short timeout
        _, writer = await asyncio.wait_for(
            asyncio.open_connection("api.gdeltproject.org", 443),
            timeout=3.0,
        )
        writer.close()
        await writer.wait_closed()
        return True
    except Exception:
        return False


async def fetch_gdelt(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch recent conflict events from GDELT.

    Returns:
        List of event dicts with keys: name, lat, lng, url
    """
    try:
        # Quick TCP connectivity check before attempting HTTP request
        if not await _check_connectivity():
            logger.warning("GDELT API unreachable — returning fallback data")
            return FALLBACK_GDELT

        resp = await asyncio.wait_for(
            client.get(
                GDELT_URL,
                headers={"User-Agent": USER_AGENT},
            ),
            timeout=12.0,
        )

        if resp.status_code != 200:
            logger.warning(f"GDELT API returned status {resp.status_code}")
            return FALLBACK_GDELT

        # GDELT may return non-JSON for some responses (rate limiting messages)
        try:
            data = resp.json()
        except Exception:
            logger.warning("GDELT response is not valid JSON — likely rate limited")
            return FALLBACK_GDELT

        results = []
        articles = data.get("articles", [])

        for article in articles:
            title = article.get("title", "Unknown Event")
            url = article.get("url", "")
            seendate = article.get("seendate", "")
            source = article.get("source", "")

            results.append({
                "name": title,
                "lat": 0,
                "lng": 0,
                "url": url,
                "date": seendate,
                "source": source or "GDELT",
            })

        logger.info(f"Fetched {len(results)} GDELT events")
        return results if results else FALLBACK_GDELT

    except asyncio.TimeoutError:
        logger.error("GDELT request timed out — returning fallback data")
        return FALLBACK_GDELT
    except httpx.ConnectTimeout:
        logger.error("GDELT connection timed out — returning fallback data")
        return FALLBACK_GDELT
    except httpx.ConnectError as e:
        logger.error(f"GDELT connection error: {e} — returning fallback data")
        return FALLBACK_GDELT
    except Exception as e:
        logger.error(f"Error fetching GDELT data: {e} — returning fallback data")
        return FALLBACK_GDELT
