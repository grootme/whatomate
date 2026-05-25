"""RSS News Feed scraper.

Fetches world news from free RSS feeds (BBC, Reuters, Al Jazeera).
FREE, no API key required.
"""

import logging
from typing import Any

import feedparser
import httpx

from config import RSS_FEEDS, USER_AGENT, HTTP_TIMEOUT

logger = logging.getLogger(__name__)


async def fetch_news(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch news from RSS feeds.

    Returns:
        List of news dicts with keys: title, source, url, lat, lng
    """
    results = []

    for source_name, feed_url in RSS_FEEDS:
        try:
            # Fetch the RSS XML content via httpx
            resp = await client.get(
                feed_url,
                headers={"User-Agent": USER_AGENT},
                timeout=HTTP_TIMEOUT,
                follow_redirects=True,
            )

            if resp.status_code != 200:
                logger.warning(f"RSS feed {source_name} returned status {resp.status_code}")
                continue

            # Parse with feedparser
            feed = feedparser.parse(resp.text)

            for entry in feed.entries[:10]:  # Limit to 10 per source
                title = entry.get("title", "No title")
                url = entry.get("link", "")

                results.append({
                    "title": title,
                    "source": source_name,
                    "url": url,
                    "lat": 0,
                    "lng": 0,
                })

            logger.info(f"Fetched {min(len(feed.entries), 10)} articles from {source_name}")

        except Exception as e:
            logger.error(f"Error fetching RSS feed {source_name}: {e}")
            continue

    logger.info(f"Fetched {len(results)} total news articles")
    return results
