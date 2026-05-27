"""Shadowbroker OSINT Backend — FastAPI Application.

Real-time OSINT data aggregation service on port 8000.
Consumed by the Shadowbroker AI Bridge (port 8660).
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import (
    CACHE_DURATION,
    PORT,
    USER_AGENT,
    HTTP_TIMEOUT,
)
from scrapers import (
    fetch_earthquakes,
    fetch_fires,
    fetch_flights,
    fetch_gdelt,
    fetch_news,
    fetch_weather_alerts,
    fetch_ships,
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
            return [] if name != "flights" else {"military_flights": [], "commercial_flights": [], "tracked_flights": [], "private_jets": []}
        except Exception as e:
            logger.error(f"Scraper {name} failed: {e}")
            return [] if name != "flights" else {"military_flights": [], "commercial_flights": [], "tracked_flights": [], "private_jets": []}

    (
        earthquakes,
        fires,
        flight_data,
        gdelt,
        news,
        weather_alerts,
        ships,
    ) = await asyncio.gather(
        _safe(fetch_earthquakes(client), "earthquakes"),
        _safe(fetch_fires(client), "fires"),
        _safe(fetch_flights(client), "flights"),
        _safe(fetch_gdelt(client), "gdelt"),
        _safe(fetch_news(client), "news"),
        _safe(fetch_weather_alerts(client), "weather"),
        _safe(fetch_ships(client), "ships"),
    )

    # Extract flight categories
    military_flights = flight_data.get("military_flights", []) if isinstance(flight_data, dict) else []
    commercial_flights = flight_data.get("commercial_flights", []) if isinstance(flight_data, dict) else []
    tracked_flights = flight_data.get("tracked_flights", []) if isinstance(flight_data, dict) else []
    private_jets = flight_data.get("private_jets", []) if isinstance(flight_data, dict) else []

    # Assemble the full data payload
    payload: dict[str, Any] = {
        "threat_level": "low",  # Will be computed below
        "military_flights": military_flights,
        "ships": ships,
        "earthquakes": earthquakes,
        "gdelt": gdelt,
        "news": news,
        "firms_fires": fires,
        "gps_jamming": [],
        "weather_alerts": weather_alerts,
        "uavs": [],
        "liveuamap": [],
        "correlations": [],
        "crowdthreat": [],
        "sigint": [],
        "sigint_totals": {"meshtastic": 0, "aprs": 0},
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
        f"wx_alerts={len(weather_alerts)}"
    )

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
            "depth": 0,
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
            "date": "",
            "source": "GDELT",
        })

    # ── News ──
    news = []
    for n in data.get("news", []):
        news.append({
            "title": n.get("title", ""),
            "source": n.get("source", ""),
            "url": n.get("url", ""),
            "publishedAt": "",
            "category": "",
        })

    return {
        "earthquakes": earthquakes,
        "flights": flights,
        "weather": weather,
        "fires": fires,
        "ships": ships,
        "gdelt": gdelt,
        "news": news,
    }


# ── API Endpoints ────────────────────────────────────────────────────────────


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "0.1.0"}


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


@app.get("/api/live-data/osint-snapshot")
async def live_data_osint_snapshot():
    """OsintSnapshot-compatible endpoint.

    Fetches all OSINT data and transforms it into the OsintSnapshot format
    expected by the TypeScript intelligence platform.  Keeps the original
    /api/live-data endpoint unchanged for backward compatibility.
    """
    try:
        data = await _fetch_all_data()
        return _transform_to_osint_snapshot(data)
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
    """Warm up the cache on startup (with timeout so server starts regardless)."""
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
    """Clean up HTTP client on shutdown."""
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
    logger.info("Shadowbroker OSINT shut down")


# ── Direct Run ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
