"""AIS Ship data stub.

AIS (Automatic Identification System) data requires a commercial API key.
This module provides a stub that returns an empty array.
"""

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def fetch_ships(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch ship/AIS data.

    Currently returns an empty array as AIS data requires a paid API key.
    This can be implemented with services like MarineTraffic or Spire.

    Returns:
        Empty list (stub implementation)
    """
    # AIS data requires API key - return empty array per spec
    logger.debug("Ships scraper stub called - returning empty array (needs API key)")
    return []
