"""Shadowbroker OSINT Backend — FastAPI Application.

Real-time OSINT data aggregation service on port 8000.
Consumed by the Shadowbroker AI Bridge (port 8660).
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import (
    CACHE_DURATION,
    PORT,
    REDIS_HOST,
    REDIS_PORT,
    USER_AGENT,
    HTTP_TIMEOUT,
)
from scrapers import (
    fetch_earthquakes,
    fetch_fires,
    fetch_flights,
    fetch_gdelt,
    fetch_gps_jamming,
    fetch_liveuamap,
    fetch_news,
    fetch_ships,
    fetch_sigint,
    fetch_uavs,
    fetch_weather_alerts,
)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("shadowbroker")

# ── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Shadowbroker OSINT",
    version="0.1.0",
    description="Real-time OSINT data aggregation service",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Redis Connection ─────────────────────────────────────────────────────────
_redis: aioredis.Redis | None = None
_redis_available: bool = False


async def _get_redis() -> aioredis.Redis | None:
    """Get or create the Redis connection (lazy init)."""
    global _redis, _redis_available
    if _redis is not None:
        return _redis
    try:
        _redis = aioredis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
        # Verify connection
        await _redis.ping()
        _redis_available = True
        logger.info(f"Redis connected at {REDIS_HOST}:{REDIS_PORT}")
        return _redis
    except Exception as e:
        _redis_available = False
        logger.warning(f"Redis unavailable at {REDIS_HOST}:{REDIS_PORT}: {e}")
        _redis = None
        return None


async def _publish_to_stream(stream: str, fields: dict[str, str]) -> None:
    """Publish an event to a Redis Stream. Non-blocking on failure."""
    try:
        client = await _get_redis()
        if client is None:
            return
        await client.xadd(stream, fields)  # type: ignore[arg-type]
        logger.debug(f"Published to Redis stream '{stream}'")
    except Exception as e:
        global _redis_available
        _redis_available = False
        logger.warning(f"Failed to publish to Redis stream '{stream}': {e}")
        # Reset connection so next attempt re-creates it
        global _redis
        if _redis is not None:
            try:
                await _redis.aclose()
            except Exception:
                pass
            _redis = None


# ── In-Memory Cache ──────────────────────────────────────────────────────────
_cache: dict[str, Any] = {}
_cache_timestamps: dict[str, float] = {}


def _is_cache_valid(key: str) -> bool:
    """Check if cached data is still within CACHE_DURATION."""
    ts = _cache_timestamps.get(key, 0)
    return (time.time() - ts) < CACHE_DURATION


def _set_cache(key: str, data: Any) -> None:
    """Store data in cache with current timestamp."""
    _cache[key] = data
    _cache_timestamps[key] = time.time()


# ── HTTP Client (shared across scrapers) ─────────────────────────────────────
_http_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    """Get or create the shared HTTP client."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT},
            timeout=httpx.Timeout(
                connect=8.0,
                read=HTTP_TIMEOUT,
                write=HTTP_TIMEOUT,
                pool=HTTP_TIMEOUT,
            ),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _http_client


# ── Threat Level Computation ─────────────────────────────────────────────────


def _compute_threat_level(data: dict[str, Any]) -> str:
    """Compute overall threat level based on aggregated data.

    Returns one of: "low", "medium", "high", "critical", "elevated"
    """
    score = 0

    # Earthquake severity
    eq_count = len(data.get("earthquakes", []))
    max_mag = 0
    for eq in data.get("earthquakes", []):
        mag = eq.get("magnitude", 0)
        if mag > max_mag:
            max_mag = mag
    if max_mag >= 7.0:
        score += 3
    elif max_mag >= 6.0:
        score += 2
    elif max_mag >= 5.0:
        score += 1
    if eq_count >= 5:
        score += 1

    # Military flights
    mil_count = len(data.get("military_flights", []))
    if mil_count >= 20:
        score += 2
    elif mil_count >= 10:
        score += 1

    # Weather alerts
    wx_count = len(data.get("weather_alerts", []))
    if wx_count >= 10:
        score += 2
    elif wx_count >= 5:
        score += 1

    # GDELT conflict events
    gdelt_count = len(data.get("gdelt", []))
    if gdelt_count >= 15:
        score += 1

    # Fire activity
    fire_count = len(data.get("firms_fires", []))
    if fire_count >= 100:
        score += 1

    # GPS jamming severity
    gps_jamming = data.get("gps_jamming", [])
    severe_jamming = [g for g in gps_jamming if g.get("severity") == "severe"]
    moderate_jamming = [g for g in gps_jamming if g.get("severity") == "moderate"]
    if len(severe_jamming) >= 3:
        score += 2
    elif len(severe_jamming) >= 1 or len(moderate_jamming) >= 3:
        score += 1

    # UAV / drone activity
    uav_count = len(data.get("uavs", []))
    if uav_count >= 10:
        score += 1

    # LiveUAMap conflict events
    liveuamap_events = data.get("liveuamap", [])
    conflict_events = [e for e in liveuamap_events if e.get("eventType") == "conflict"]
    if len(conflict_events) >= 5:
        score += 1

    # SIGINT activity
    sigint_data = data.get("sigint", [])
    if len(sigint_data) >= 50:
        score += 1

    # Map score to threat level
    if score >= 8:
        return "critical"
    elif score >= 6:
        return "high"
    elif score >= 4:
        return "elevated"
    elif score >= 2:
        return "medium"
    else:
        return "low"


# ── Scraper Fallback Results ─────────────────────────────────────────────────


def _empty_result_for(name: str) -> Any:
    """Return the appropriate empty result for a given scraper name.

    Most scrapers return [], but flights and sigint return dicts.
    """
    if name == "flights":
        return {
            "military_flights": [],
            "commercial_flights": [],
            "tracked_flights": [],
            "private_jets": [],
        }
    if name == "sigint":
        return {
            "sigint": [],
            "sigint_totals": {"meshtastic": 0, "aprs": 0},
        }
    return []


# ── Data Aggregation ─────────────────────────────────────────────────────────


async def _fetch_all_data() -> dict[str, Any]:
    """Fetch all OSINT data in parallel with caching.

    Returns the complete live-data payload.
    """
    # Check if we have a valid full cache
    if _is_cache_valid("live_data"):
        logger.debug("Returning cached live data")
        return _cache["live_data"]

    client = await _get_client()

    # Run all scrapers in parallel with individual timeouts
    SCRAPER_TIMEOUT = 20  # seconds per scraper

    async def _safe(coro, name: str):
        """Run a scraper with a timeout, returning empty result on failure."""
        try:
            return await asyncio.wait_for(coro, timeout=SCRAPER_TIMEOUT)
        except asyncio.TimeoutError:
            logger.error(f"Scraper {name} timed out after {SCRAPER_TIMEOUT}s")
            return _empty_result_for(name)
        except Exception as e:
            logger.error(f"Scraper {name} failed: {e}")
            return _empty_result_for(name)

    (
        earthquakes,
        fires,
        flight_data,
        gdelt,
        gps_jamming,
        liveuamap,
        news,
        ships,
        sigint_data,
        uavs,
        weather_alerts,
    ) = await asyncio.gather(
        _safe(fetch_earthquakes(client), "earthquakes"),
        _safe(fetch_fires(client), "fires"),
        _safe(fetch_flights(client), "flights"),
        _safe(fetch_gdelt(client), "gdelt"),
        _safe(fetch_gps_jamming(client), "gps_jamming"),
        _safe(fetch_liveuamap(client), "liveuamap"),
        _safe(fetch_news(client), "news"),
        _safe(fetch_ships(client), "ships"),
        _safe(fetch_sigint(client), "sigint"),
        _safe(fetch_uavs(client), "uavs"),
        _safe(fetch_weather_alerts(client), "weather"),
    )

    # Extract flight categories
    military_flights = flight_data.get("military_flights", []) if isinstance(flight_data, dict) else []
    commercial_flights = flight_data.get("commercial_flights", []) if isinstance(flight_data, dict) else []
    tracked_flights = flight_data.get("tracked_flights", []) if isinstance(flight_data, dict) else []
    private_jets = flight_data.get("private_jets", []) if isinstance(flight_data, dict) else []

    # Extract sigint data
    sigint = sigint_data.get("sigint", []) if isinstance(sigint_data, dict) else []
    sigint_totals = sigint_data.get("sigint_totals", {"meshtastic": 0, "aprs": 0}) if isinstance(sigint_data, dict) else {"meshtastic": 0, "aprs": 0}

    # Assemble the full data payload
    payload: dict[str, Any] = {
        "threat_level": "low",  # Will be computed below
        "military_flights": military_flights,
        "ships": ships,
        "earthquakes": earthquakes,
        "gdelt": gdelt,
        "news": news,
        "firms_fires": fires,
        "gps_jamming": gps_jamming,
        "weather_alerts": weather_alerts,
        "uavs": uavs,
        "liveuamap": liveuamap,
        "correlations": [],
        "crowdthreat": [],
        "sigint": sigint,
        "sigint_totals": sigint_totals,
        "tracked_flights": tracked_flights,
        "private_jets": private_jets,
        "commercial_flights": commercial_flights,
    }

    # Compute threat level
    payload["threat_level"] = _compute_threat_level(payload)

    # Cache the result
    _set_cache("live_data", payload)

    logger.info(
        f"Live data refreshed: threat_level={payload['threat_level']}, "
        f"eq={len(earthquakes)}, fires={len(fires)}, "
        f"mil_flights={len(military_flights)}, "
        f"news={len(news)}, gdelt={len(gdelt)}, "
        f"wx_alerts={len(weather_alerts)}, "
        f"gps_jamming={len(gps_jamming)}, uavs={len(uavs)}, "
        f"liveuamap={len(liveuamap)}, sigint={len(sigint)}"
    )

    # Publish data-refreshed event to Redis Stream
    data_json = json.dumps(payload, default=str)
    await _publish_to_stream("whatomate:osint_events", {
        "event_type": "osint.data_refreshed",
        "source": "shadowbroker-osint",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "data_json": data_json[:4000],
    })

    return payload


# ── Summary / Report Generation ──────────────────────────────────────────────


def _generate_summary(data: dict[str, Any]) -> str:
    """Generate a brief threat summary from the data."""
    parts = []

    threat = data.get("threat_level", "unknown")
    parts.append(f"Current global threat level: {threat.upper()}.")

    # Earthquakes
    eqs = data.get("earthquakes", [])
    if eqs:
        max_eq = max(eqs, key=lambda e: e.get("magnitude", 0))
        # Title already contains magnitude info, use it directly
        parts.append(
            f"Seismic activity: {len(eqs)} significant earthquake(s) detected, "
            f"largest {max_eq.get('title', 'unknown')}."
        )
    else:
        parts.append("No significant seismic activity in the past 24 hours.")

    # Military flights
    mil = data.get("military_flights", [])
    if mil:
        parts.append(f"Military aviation: {len(mil)} military flight(s) tracked worldwide.")
    else:
        parts.append("No military flights currently tracked.")

    # Weather
    wx = data.get("weather_alerts", [])
    if wx:
        severe = [a for a in wx if a.get("severity") in ("Extreme", "Severe")]
        parts.append(f"Weather: {len(wx)} active alert(s), {len(severe)} severe/extreme.")
    else:
        parts.append("No active severe weather alerts.")

    # Fires
    fires = data.get("firms_fires", [])
    if fires:
        parts.append(f"Fire monitoring: {len(fires)} active fire detection(s) via VIIRS.")

    # News
    news = data.get("news", [])
    if news:
        parts.append(f"Intelligence feed: {len(news)} recent article(s) from global sources.")

    # GPS Jamming
    gps_jam = data.get("gps_jamming", [])
    if gps_jam:
        severe = [g for g in gps_jam if g.get("severity") == "severe"]
        parts.append(f"GPS interference: {len(gps_jam)} region(s) affected, {len(severe)} severe.")

    # UAVs
    uavs = data.get("uavs", [])
    if uavs:
        parts.append(f"Drone activity: {len(uavs)} UAV(s) tracked.")

    # LiveUAMap
    lum = data.get("liveuamap", [])
    if lum:
        conflict = [e for e in lum if e.get("eventType") == "conflict"]
        parts.append(f"Conflict map: {len(lum)} event(s), {len(conflict)} armed conflict(s).")

    # SIGINT
    sigint = data.get("sigint", [])
    sigint_totals = data.get("sigint_totals", {})
    if sigint:
        parts.append(
            f"Signals intelligence: {sigint_totals.get('meshtastic', 0)} Meshtastic, "
            f"{sigint_totals.get('aprs', 0)} APRS signals detected."
        )

    return " ".join(parts)


def _generate_report(data: dict[str, Any]) -> str:
    """Generate a detailed intelligence report."""
    lines = []
    lines.append("=" * 60)
    lines.append("  SHADOWBROKER OSINT INTELLIGENCE REPORT")
    lines.append(f"  Generated: {datetime.now(tz=timezone.utc).isoformat()}")
    lines.append("=" * 60)
    lines.append("")

    # Threat assessment
    threat = data.get("threat_level", "unknown")
    lines.append(f"OVERALL THREAT LEVEL: {threat.upper()}")
    lines.append("")

    # Seismic
    lines.append("─" * 40)
    lines.append("SEISMIC ACTIVITY")
    lines.append("─" * 40)
    eqs = data.get("earthquakes", [])
    if eqs:
        for eq in eqs[:10]:
            lines.append(
                f"  • {eq.get('title', 'Unknown')} "
                f"({eq.get('time', 'N/A')})"
            )
    else:
        lines.append("  No significant seismic activity.")
    lines.append("")

    # Military aviation
    lines.append("─" * 40)
    lines.append("MILITARY AVIATION")
    lines.append("─" * 40)
    mil = data.get("military_flights", [])
    if mil:
        for f in mil[:10]:
            lines.append(
                f"  • {f.get('callsign', 'N/A')} | Alt: {f.get('altitude', 0):.0f}m | "
                f"From: {f.get('origin_country', 'N/A')}"
            )
        if len(mil) > 10:
            lines.append(f"  ... and {len(mil) - 10} more")
    else:
        lines.append("  No military flights tracked.")
    lines.append("")

    # Weather
    lines.append("─" * 40)
    lines.append("WEATHER ALERTS")
    lines.append("─" * 40)
    wx = data.get("weather_alerts", [])
    if wx:
        for a in wx[:10]:
            lines.append(f"  • [{a.get('severity', '?')}] {a.get('event', 'N/A')} — {a.get('area', 'N/A')}")
    else:
        lines.append("  No active weather alerts.")
    lines.append("")

    # Fires
    lines.append("─" * 40)
    lines.append("FIRE DETECTIONS (VIIRS)")
    lines.append("─" * 40)
    fires = data.get("firms_fires", [])
    lines.append(f"  Active detections: {len(fires)}")
    if fires:
        high_conf = [f for f in fires if f.get("confidence") == "high"]
        lines.append(f"  High confidence: {len(high_conf)}")
    lines.append("")

    # News
    lines.append("─" * 40)
    lines.append("NEWS INTELLIGENCE FEED")
    lines.append("─" * 40)
    news = data.get("news", [])
    if news:
        for n in news[:10]:
            lines.append(f"  • [{n.get('source', '?')}] {n.get('title', 'N/A')}")
    else:
        lines.append("  No news articles retrieved.")
    lines.append("")

    # GDELT
    lines.append("─" * 40)
    lines.append("GDELT CONFLICT EVENTS")
    lines.append("─" * 40)
    gdelt = data.get("gdelt", [])
    if gdelt:
        for g in gdelt[:10]:
            lines.append(f"  • {g.get('name', 'N/A')}")
    else:
        lines.append("  No GDELT events retrieved.")
    lines.append("")

    # GPS Jamming
    lines.append("─" * 40)
    lines.append("GPS JAMMING / SPOOFING")
    lines.append("─" * 40)
    gps_jam = data.get("gps_jamming", [])
    if gps_jam:
        for g in gps_jam[:10]:
            lines.append(
                f"  • [{g.get('severity', '?').upper()}] {g.get('region', 'N/A')}"
            )
    else:
        lines.append("  No GPS jamming data available.")
    lines.append("")

    # UAVs
    lines.append("─" * 40)
    lines.append("UAV / DRONE ACTIVITY")
    lines.append("─" * 40)
    uavs = data.get("uavs", [])
    if uavs:
        for u in uavs[:10]:
            lines.append(
                f"  • {u.get('callsign', 'N/A')} | {u.get('type', 'N/A')} | "
                f"Alt: {u.get('altitude', 0):.0f}m | {u.get('zone', 'N/A')}"
            )
        if len(uavs) > 10:
            lines.append(f"  ... and {len(uavs) - 10} more")
    else:
        lines.append("  No UAV activity tracked.")
    lines.append("")

    # LiveUAMap
    lines.append("─" * 40)
    lines.append("LIVEUAMAP CONFLICT EVENTS")
    lines.append("─" * 40)
    lum = data.get("liveuamap", [])
    if lum:
        for e in lum[:10]:
            lines.append(
                f"  • [{e.get('eventType', '?').upper()}] {e.get('title', 'N/A')}"
            )
        if len(lum) > 10:
            lines.append(f"  ... and {len(lum) - 10} more")
    else:
        lines.append("  No LiveUAMap events retrieved.")
    lines.append("")

    # SIGINT
    lines.append("─" * 40)
    lines.append("SIGNALS INTELLIGENCE (SIGINT)")
    lines.append("─" * 40)
    sigint = data.get("sigint", [])
    sigint_totals = data.get("sigint_totals", {})
    lines.append(
        f"  Meshtastic nodes: {sigint_totals.get('meshtastic', 0)} | "
        f"APRS signals: {sigint_totals.get('aprs', 0)}"
    )
    if sigint:
        for s in sigint[:5]:
            lines.append(
                f"  • [{s.get('type', '?').upper()}] {s.get('callsign', 'N/A')} | "
                f"{s.get('frequency', 'N/A')}"
            )
    lines.append("")

    lines.append("=" * 60)
    lines.append("  END OF REPORT")
    lines.append("=" * 60)

    return "\n".join(lines)


# ── OSINT Snapshot Transformation ────────────────────────────────────────────


def _map_fire_confidence(confidence: str) -> int:
    """Map FIRMS confidence string to numeric value for OsintSnapshot."""
    mapping = {"high": 90, "nominal": 50, "low": 20}
    return mapping.get(str(confidence).strip().lower(), 50)


def _transform_to_osint_snapshot(data: dict[str, Any]) -> dict[str, Any]:
    """Transform internal live-data payload into OsintSnapshot format.

    The OsintSnapshot TypeScript interface expects:
      earthquakes: [{location, magnitude, depth, time, source}]
      flights:     [{callsign, type, altitude, heading, zone, time}]
      weather:     {activeAlerts, extremeEvents}
      fires:       [{location, confidence, lat, lon}]
      ships:       [{name, type, lat, lon, speed}]
      gdelt:       [{name, url?, date?, source?}]
      news:        [{title, source, url?, publishedAt?, category?}]
    """
    now_iso = datetime.now(tz=timezone.utc).isoformat()

    # ── Earthquakes ──
    earthquakes = []
    for eq in data.get("earthquakes", []):
        earthquakes.append({
            "location": eq.get("title", "Unknown"),
            "magnitude": eq.get("magnitude", 0),
            "depth": eq.get("depth", 0),  # Real depth from USGS GeoJSON coords[2]
            "time": eq.get("time", ""),
            "source": "USGS",
        })

    # ── Flights (flatten military + commercial) ──
    flights = []
    for f in data.get("military_flights", []):
        flights.append({
            "callsign": f.get("callsign", ""),
            "type": "military",
            "altitude": f.get("altitude", 0),
            "heading": f.get("velocity", 0),
            "zone": f.get("origin_country", ""),
            "time": now_iso,
        })
    for f in data.get("commercial_flights", []):
        flights.append({
            "callsign": f.get("callsign", ""),
            "type": "commercial",
            "altitude": f.get("altitude", 0),
            "heading": f.get("velocity", 0),
            "zone": f.get("origin_country", ""),
            "time": now_iso,
        })

    # ── Weather ──
    wx_alerts = data.get("weather_alerts", [])
    extreme_events = [
        a.get("event", "Unknown")
        for a in wx_alerts
        if a.get("severity") in ("Extreme", "Severe")
    ]
    weather = {
        "activeAlerts": len(wx_alerts),
        "extremeEvents": extreme_events,
    }

    # ── Fires ──
    fires = []
    for f in data.get("firms_fires", []):
        lat = f.get("lat", 0)
        lng = f.get("lng", 0)
        fires.append({
            "location": f"{lat},{lng}",
            "confidence": _map_fire_confidence(f.get("confidence", "nominal")),
            "lat": lat,
            "lon": lng,
        })

    # ── Ships (pass through as-is) ──
    ships = data.get("ships", [])

    # ── GDELT ──
    gdelt = []
    for g in data.get("gdelt", []):
        gdelt.append({
            "name": g.get("name", ""),
            "url": g.get("url", ""),
            "date": g.get("date", ""),  # Real date from GDELT seendate field
            "source": g.get("source", "GDELT"),
        })

    # ── News ──
    news = []
    for n in data.get("news", []):
        news.append({
            "title": n.get("title", ""),
            "source": n.get("source", ""),
            "url": n.get("url", ""),
            "publishedAt": n.get("publishedAt", ""),  # Real published date from RSS feed
            "category": n.get("category", ""),
        })

    # ── GPS Jamming ──
    gps_jamming = []
    for g in data.get("gps_jamming", []):
        gps_jamming.append({
            "region": g.get("region", ""),
            "lat": g.get("lat", 0),
            "lon": g.get("lon", 0),
            "severity": g.get("severity", "low"),
            "description": g.get("description", ""),
            "time": g.get("time", ""),
            "source": g.get("source", "GPSJam"),
        })

    # ── UAVs ──
    uavs = []
    for u in data.get("uavs", []):
        uavs.append({
            "callsign": u.get("callsign", ""),
            "type": u.get("type", ""),
            "altitude": u.get("altitude", 0),
            "lat": u.get("lat", 0),
            "lon": u.get("lon", 0),
            "heading": u.get("heading", 0),
            "zone": u.get("zone", ""),
            "time": u.get("time", ""),
        })

    # ── LiveUAMap ──
    liveuamap = []
    for e in data.get("liveuamap", []):
        liveuamap.append({
            "title": e.get("title", ""),
            "description": e.get("description", ""),
            "lat": e.get("lat", 0),
            "lon": e.get("lon", 0),
            "eventType": e.get("eventType", "military"),
            "time": e.get("time", ""),
            "source": e.get("source", "LiveUAMap"),
        })

    # ── SIGINT ──
    sigint = []
    for s in data.get("sigint", []):
        sigint.append({
            "type": s.get("type", ""),
            "callsign": s.get("callsign", ""),
            "frequency": s.get("frequency", ""),
            "lat": s.get("lat", 0),
            "lon": s.get("lon", 0),
            "altitude": s.get("altitude", 0),
            "time": s.get("time", ""),
            "source": s.get("source", ""),
            "message": s.get("message", ""),
        })

    sigint_totals = data.get("sigint_totals", {"meshtastic": 0, "aprs": 0})

    snapshot = {
        "earthquakes": earthquakes,
        "flights": flights,
        "weather": weather,
        "fires": fires,
        "ships": ships,
        "gdelt": gdelt,
        "news": news,
        "gpsJamming": gps_jamming,
        "uavs": uavs,
        "liveuamap": liveuamap,
        "sigint": sigint,
        "sigintTotals": sigint_totals,
    }

    return snapshot


# ── API Endpoints ────────────────────────────────────────────────────────────


@app.get("/api/health")
async def health_check():
    """Health check endpoint with Redis status."""
    redis_status = "unavailable"
    if _redis_available:
        try:
            client = await _get_redis()
            if client is not None:
                await client.ping()
                redis_status = "connected"
            else:
                redis_status = "unavailable"
        except Exception:
            redis_status = "error"
    return {
        "status": "ok",
        "version": "0.1.0",
        "redis": redis_status,
        "redis_host": REDIS_HOST,
        "redis_port": REDIS_PORT,
    }


@app.get("/api/live-data")
async def live_data():
    """Main data endpoint — aggregated OSINT data.

    Returns a JSON object with all scraped data categories.
    Cached for CACHE_DURATION seconds.
    """
    try:
        data = await _fetch_all_data()
        return data
    except Exception as e:
        logger.error(f"Error in /api/live-data: {e}")
        # Always return valid structure even on error
        return {
            "threat_level": "low",
            "military_flights": [],
            "ships": [],
            "earthquakes": [],
            "gdelt": [],
            "news": [],
            "firms_fires": [],
            "gps_jamming": [],
            "weather_alerts": [],
            "uavs": [],
            "liveuamap": [],
            "correlations": [],
            "crowdthreat": [],
            "sigint": [],
            "sigint_totals": {"meshtastic": 0, "aprs": 0},
            "tracked_flights": [],
            "private_jets": [],
            "commercial_flights": [],
        }


async def _fetch_and_transform_snapshot() -> dict[str, Any]:
    """Fetch OSINT data, transform to snapshot, and publish to Redis."""
    data = await _fetch_all_data()
    snapshot = _transform_to_osint_snapshot(data)

    # Publish snapshot event to Redis Stream
    snapshot_json = json.dumps(snapshot, default=str)
    await _publish_to_stream("whatomate:osint_snapshot", {
        "event_type": "osint.snapshot_ready",
        "source": "shadowbroker-osint",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "data_json": snapshot_json[:4000],
    })

    return snapshot


@app.get("/api/live-data/osint-snapshot")
async def live_data_osint_snapshot():
    """OsintSnapshot-compatible endpoint.

    Fetches all OSINT data and transforms it into the OsintSnapshot format
    expected by the TypeScript intelligence platform.  Keeps the original
    /api/live-data endpoint unchanged for backward compatibility.
    """
    try:
        return await _fetch_and_transform_snapshot()
    except Exception as e:
        logger.error(f"Error in /api/live-data/osint-snapshot: {e}")
        return _transform_to_osint_snapshot({
            "earthquakes": [],
            "military_flights": [],
            "commercial_flights": [],
            "weather_alerts": [],
            "firms_fires": [],
            "ships": [],
            "gdelt": [],
            "news": [],
            "gps_jamming": [],
            "uavs": [],
            "liveuamap": [],
            "sigint": [],
            "sigint_totals": {"meshtastic": 0, "aprs": 0},
        })


@app.get("/api/ai/summary")
async def ai_summary():
    """AI-consumable threat summary endpoint."""
    try:
        data = await _fetch_all_data()
        summary = _generate_summary(data)
        return {"summary": summary, "threat_level": data.get("threat_level", "low")}
    except Exception as e:
        logger.error(f"Error in /api/ai/summary: {e}")
        return {"summary": "Unable to generate threat summary.", "threat_level": "low"}


@app.get("/api/ai/report")
async def ai_report():
    """Detailed intelligence report endpoint."""
    try:
        data = await _fetch_all_data()
        report = _generate_report(data)
        return {
            "report": report,
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Error in /api/ai/report: {e}")
        return {
            "report": "Unable to generate intelligence report.",
            "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        }


# ── Startup / Shutdown ───────────────────────────────────────────────────────


@app.on_event("startup")
async def startup():
    """Warm up the cache on startup. Redis check is deferred to first use (lazy)."""
    # Redis connection is lazy — _get_redis() will be called on first publish.
    # No blocking check here to avoid startup hangs when Redis is unavailable.
    logger.info(f"Redis will be connected lazily at {REDIS_HOST}:{REDIS_PORT} (if available)")

    # Warm cache
    logger.info("Shadowbroker OSINT starting up — warming cache...")
    try:
        await asyncio.wait_for(_fetch_all_data(), timeout=35)
        logger.info("Cache warmed successfully")
    except asyncio.TimeoutError:
        logger.warning("Cache warm-up timed out — server will serve data on next request")
    except Exception as e:
        logger.warning(f"Cache warm-up failed (will retry on next request): {e}")


@app.on_event("shutdown")
async def shutdown():
    """Clean up HTTP client and Redis connection on shutdown."""
    global _http_client, _redis
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None
    logger.info("Shadowbroker OSINT shut down")


# ── Direct Run ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
