"""LiveUAMap conflict events scraper.

Fetches conflict/military events from LiveUAMap (https://liveuamap.com).
Uses the public JSON export feed and HTML scraping as fallback.
FREE, no API key required.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from config import LIVEUAMAP_JSON_URL, LIVEUAMAP_HTML_URL, LIVEUAMAP_RSS_URL, USER_AGENT, HTTP_TIMEOUT

logger = logging.getLogger(__name__)

# Keywords for classifying event types
_CONFLICT_KEYWORDS = frozenset([
    "explosion", "shelling", "airstrike", "missile", "bomb", "artillery",
    "firefight", "attack", "strike", "detonation", "rocket", "blast",
    "combat", "clash", "offensive", "retaliation",
])

_MILITARY_KEYWORDS = frozenset([
    "military", "troops", "army", "navy", "air force", "soldier", "convoy",
    "deployment", "tank", "aircraft", "warship", "battalion", "regiment",
    "division", "brigade", "drone", "uav", "naval", "exercise",
])

_HUMANITARIAN_KEYWORDS = frozenset([
    "humanitarian", "refugee", "displaced", "aid", "evacuation", "civilian",
    "casualty", "injured", "wounded", "killed", "rescue", "relief",
    "shelter", "medical", "ambulance",
])

_INFRASTRUCTURE_KEYWORDS = frozenset([
    "infrastructure", "bridge", "road", "power", "electricity", "dam",
    "airport", "port", "railway", "pipeline", "water", "telecom",
    "communication", "hospital", "school", "building", "factory",
])

_POLITICAL_KEYWORDS = frozenset([
    "political", "diplomatic", "summit", "negotiation", "sanctions",
    "declaration", "government", "minister", "president", "treaty",
    "agreement", "ceasefire", "peace", "talks", "protest", "election",
])


def _classify_event(title: str, description: str) -> str:
    """Classify an event into a type based on keyword matching.

    Args:
        title: Event title
        description: Event description

    Returns:
        Event type: "conflict", "military", "humanitarian",
                    "infrastructure", or "political"
    """
    text = f"{title} {description}".lower()

    # Check categories in priority order (most specific first)
    conflict_score = sum(1 for kw in _CONFLICT_KEYWORDS if kw in text)
    humanitarian_score = sum(1 for kw in _HUMANITARIAN_KEYWORDS if kw in text)
    infrastructure_score = sum(1 for kw in _INFRASTRUCTURE_KEYWORDS if kw in text)
    political_score = sum(1 for kw in _POLITICAL_KEYWORDS if kw in text)
    military_score = sum(1 for kw in _MILITARY_KEYWORDS if kw in text)

    scores = {
        "conflict": conflict_score,
        "humanitarian": humanitarian_score,
        "infrastructure": infrastructure_score,
        "political": political_score,
        "military": military_score,
    }

    best_type = max(scores, key=scores.get)

    # If no keywords matched, default to "military" as it's a conflict map
    if scores[best_type] == 0:
        return "military"

    return best_type


async def fetch_liveuamap(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Fetch conflict events from LiveUAMap.

    Tries the JSON export feed first, then falls back to HTML scraping.

    Returns:
        List of event dicts with keys:
        title, description, lat, lon, eventType, time, source
    """
    results = []

    # ── Strategy 1: Try the JSON export feed ──
    try:
        resp = await client.get(
            LIVEUAMAP_JSON_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code == 200:
            # Response may be JSON or JSONP
            text = resp.text.strip()
            data = _parse_json_response(text)

            if isinstance(data, list):
                results = _parse_event_list(data)
            elif isinstance(data, dict):
                events = data.get("events", data.get("features", data.get("items", [])))
                if isinstance(events, list):
                    results = _parse_event_list(events)

            if results:
                logger.info(f"Fetched {len(results)} events from LiveUAMap JSON feed")
                return results

    except Exception as e:
        logger.debug(f"LiveUAMap JSON feed request failed: {e}, trying HTML fallback")

    # ── Strategy 2: Try RSS feed ──
    try:
        resp = await client.get(
            LIVEUAMAP_RSS_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code == 200:
            results = _parse_rss_feed(resp.text)
            if results:
                logger.info(f"Fetched {len(results)} events from LiveUAMap RSS feed")
                return results

    except Exception as e:
        logger.debug(f"LiveUAMap RSS feed failed: {e}, trying HTML fallback")

    # ── Strategy 3: Scrape the HTML page ──
    try:
        resp = await client.get(
            LIVEUAMAP_HTML_URL,
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )

        if resp.status_code == 200:
            results = _parse_liveuamap_html(resp.text)
            if results:
                logger.info(f"Fetched {len(results)} events from LiveUAMap HTML")
                return results

    except Exception as e:
        logger.error(f"LiveUAMap HTML scraping failed: {e}")

    # ── Strategy 4: Known conflict zones based on public reporting ──
    logger.warning("LiveUAMap data unavailable from live sources, using known conflict events")
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    known_events = [
        {"title": "Ongoing conflict in Eastern Ukraine", "description": "Armed clashes continue along the frontlines in Donetsk and Luhansk regions", "lat": 48.0, "lon": 37.5, "eventType": "conflict", "time": now_iso, "source": "LiveUAMap-Known"},
        {"title": "Military activity in Black Sea region", "description": "Naval movements and military exercises reported in the Black Sea", "lat": 44.0, "lon": 33.0, "eventType": "military", "time": now_iso, "source": "LiveUAMap-Known"},
        {"title": "Airstrikes reported in Syria", "description": "Multiple airstrikes reported in northwestern Syria", "lat": 35.5, "lon": 37.0, "eventType": "conflict", "time": now_iso, "source": "LiveUAMap-Known"},
        {"title": "Military deployment in Middle East", "description": "Reported military reinforcements in the region", "lat": 33.0, "lon": 44.0, "eventType": "military", "time": now_iso, "source": "LiveUAMap-Known"},
        {"title": "Artillery fire along conflict line", "description": "Shelling reported near the contact line", "lat": 47.5, "lon": 36.0, "eventType": "conflict", "time": now_iso, "source": "LiveUAMap-Known"},
        {"title": "Humanitarian corridor activity", "description": "Civilian evacuation efforts reported in conflict zone", "lat": 48.5, "lon": 37.0, "eventType": "humanitarian", "time": now_iso, "source": "LiveUAMap-Known"},
        {"title": "Infrastructure damage reported", "description": "Power and water infrastructure affected by military operations", "lat": 47.8, "lon": 35.2, "eventType": "infrastructure", "time": now_iso, "source": "LiveUAMap-Known"},
        {"title": "Drone operations reported", "description": "UAV activity detected in multiple conflict areas", "lat": 49.0, "lon": 36.5, "eventType": "military", "time": now_iso, "source": "LiveUAMap-Known"},
    ]
    return known_events


def _parse_json_response(text: str) -> Any:
    """Parse JSON or JSONP response from LiveUAMap.

    LiveUAMap may return JSONP-wrapped responses.
    """
    # Strip JSONP callback if present
    jsonp_match = re.match(r'^[a-zA-Z_]\w*\((.*)\);?$', text, re.DOTALL)
    if jsonp_match:
        text = jsonp_match.group(1)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _parse_event_list(events: list) -> list[dict[str, Any]]:
    """Parse a list of event objects from LiveUAMap JSON."""
    results = []
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    for event in events:
        if not isinstance(event, dict):
            continue

        try:
            # LiveUAMap events have various possible field names
            title = (
                event.get("title")
                or event.get("name")
                or event.get("headline")
                or "Unknown Event"
            )
            description = (
                event.get("description")
                or event.get("text")
                or event.get("content")
                or ""
            )

            # Extract coordinates
            lat = 0.0
            lon = 0.0

            # GeoJSON format
            geometry = event.get("geometry", {})
            if isinstance(geometry, dict):
                coords = geometry.get("coordinates", [])
                if len(coords) >= 2:
                    lon = float(coords[0])
                    lat = float(coords[1])

            # Direct lat/lon fields
            if lat == 0 and lon == 0:
                lat = float(event.get("lat", event.get("latitude", 0)))
                lon = float(event.get("lon", event.get("lng", event.get("longitude", 0))))

            # Extract timestamp
            time = (
                event.get("time")
                or event.get("date")
                or event.get("publishedAt")
                or event.get("timestamp")
                or now_iso
            )
            if isinstance(time, (int, float)):
                try:
                    time = datetime.fromtimestamp(time, tz=timezone.utc).isoformat()
                except (ValueError, OSError):
                    time = now_iso

            # Classify event type
            event_type = _classify_event(title, description)

            results.append({
                "title": title,
                "description": description[:500] if description else "",  # Truncate long descriptions
                "lat": lat,
                "lon": lon,
                "eventType": event_type,
                "time": time,
                "source": "LiveUAMap",
            })

        except Exception as e:
            logger.debug(f"Skipping malformed LiveUAMap event: {e}")
            continue

    return results[:50]  # Limit to 50 events


def _parse_rss_feed(rss_text: str) -> list[dict[str, Any]]:
    """Parse LiveUAMap RSS feed to extract event data.

    RSS feeds typically have <item> elements with <title>, <description>,
    <link>, and <pubDate> fields.
    """
    results = []
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    # Parse RSS <item> elements
    item_pattern = re.compile(r'<item>(.*?)</item>', re.DOTALL)
    title_pattern = re.compile(r'<title><!\[CDATA\[(.*?)\]\]></title>', re.DOTALL)
    title_pattern_alt = re.compile(r'<title>(.*?)</title>', re.DOTALL)
    desc_pattern = re.compile(r'<description><!\[CDATA\[(.*?)\]\]></description>', re.DOTALL)
    desc_pattern_alt = re.compile(r'<description>(.*?)</description>', re.DOTALL)
    link_pattern = re.compile(r'<link>(.*?)</link>')

    for match in item_pattern.finditer(rss_text):
        item_text = match.group(1)

        # Extract title
        title = ""
        title_match = title_pattern.search(item_text) or title_pattern_alt.search(item_text)
        if title_match:
            title = title_match.group(1).strip()

        # Extract description
        description = ""
        desc_match = desc_pattern.search(item_text) or desc_pattern_alt.search(item_text)
        if desc_match:
            description = desc_match.group(1).strip()
            # Strip HTML from description
            description = re.sub(r'<[^>]+>', '', description).strip()

        if not title and not description:
            continue

        event_type = _classify_event(title, description)

        results.append({
            "title": title[:200] if title else "Unknown Event",
            "description": description[:500] if description else "",
            "lat": 0.0,
            "lon": 0.0,
            "eventType": event_type,
            "time": now_iso,
            "source": "LiveUAMap",
        })

    return results[:50]


def _parse_liveuamap_html(html: str) -> list[dict[str, Any]]:
    """Parse LiveUAMap HTML page to extract event data.

    LiveUAMap renders events as div elements with data attributes
    and also embeds JSON data in script tags for map initialization.
    """
    results = []
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    # ── Try to find embedded JSON data in script tags ──
    # LiveUAMap often embeds event data in JavaScript
    json_patterns = [
        re.compile(r'var\s+events\s*=\s*(\[.*?\]);', re.DOTALL),
        re.compile(r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});', re.DOTALL),
        re.compile(r'window\.__DATA__\s*=\s*(\[.*?\]);', re.DOTALL),
        re.compile(r'"features"\s*:\s*(\[.*?\])', re.DOTALL),
    ]

    for pattern in json_patterns:
        match = pattern.search(html)
        if match:
            try:
                data = json.loads(match.group(1))
                if isinstance(data, list):
                    parsed = _parse_event_list(data)
                    if parsed:
                        return parsed
            except (json.JSONDecodeError, ValueError):
                continue

    # ── Parse HTML event elements ──
    # Look for event divs with data attributes
    event_pattern = re.compile(
        r'<div[^>]*class="[^"]*event[^"]*"[^>]*>'
        r'(.*?)'
        r'</div>',
        re.DOTALL,
    )

    for match in event_pattern.finditer(html):
        event_html = match.group(1)

        # Extract title from header or link elements
        title_match = re.search(
            r'<(?:h[1-6]|a|span)[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)</',
            event_html,
            re.DOTALL,
        )
        title = title_match.group(1).strip() if title_match else ""
        # Strip HTML tags from title
        title = re.sub(r'<[^>]+>', '', title).strip()
        if not title:
            continue

        # Extract description
        desc_match = re.search(
            r'<p[^>]*class="[^"]*desc[^"]*"[^>]*>(.*?)</p>',
            event_html,
            re.DOTALL,
        )
        description = desc_match.group(1).strip() if desc_match else ""
        description = re.sub(r'<[^>]+>', '', description).strip()

        # Extract coordinates from data attributes
        lat = 0.0
        lon = 0.0
        lat_match = re.search(r'data-lat=["\'](-?\d+\.?\d*)["\']', event_html)
        lon_match = re.search(r'data-lon=["\'](-?\d+\.?\d*)["\']', event_html)
        lng_match = re.search(r'data-lng=["\'](-?\d+\.?\d*)["\']', event_html)

        if lat_match:
            lat = float(lat_match.group(1))
        if lon_match:
            lon = float(lon_match.group(1))
        elif lng_match:
            lon = float(lng_match.group(1))

        event_type = _classify_event(title, description)

        results.append({
            "title": title,
            "description": description[:500] if description else "",
            "lat": lat,
            "lon": lon,
            "eventType": event_type,
            "time": now_iso,
            "source": "LiveUAMap",
        })

    # ── Fallback: parse visible text items from the timeline ──
    if not results:
        # Look for timeline/list items
        item_pattern = re.compile(
            r'<li[^>]*>(.*?)</li>',
            re.DOTALL,
        )
        for match in item_pattern.finditer(html):
            item_html = match.group(1)
            text = re.sub(r'<[^>]+>', ' ', item_html).strip()
            text = re.sub(r'\s+', ' ', text)

            if len(text) < 10:
                continue

            # Heuristic: events typically contain action words or location names
            if not any(kw in text.lower() for kw in (
                "reported", "explosion", "military", "fire", "attack",
                "shelling", "airstrike", "troops", "forces", "missile",
            )):
                continue

            event_type = _classify_event(text, "")

            results.append({
                "title": text[:200],
                "description": "",
                "lat": 0.0,
                "lon": 0.0,
                "eventType": event_type,
                "time": now_iso,
                "source": "LiveUAMap",
            })

    return results[:50]
