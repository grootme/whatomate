"""
Intelligence Engine - Main FastAPI Application (v2 - Optimized).

Port: 8900
Connects to:
  - Redis at localhost:6379
  - OSINT service at http://localhost:8000/api/live-data
  - Agent Missions at http://localhost:8680/api/dashboard
  - Cognitive Service at http://localhost:8645

Changes from v1:
  - GET endpoints return cached data only (no heavy computation on GET)
  - POST endpoints trigger fresh ingestion/analysis
  - Shorter HTTP timeouts (10s) to upstream services
  - Background tasks for heavy operations
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from event_store import EventStore, EventType
from strategies import STRATEGY_REGISTRY, get_strategy, AdaptiveStrategy
from dna_layers import DNAEngine
from cycles import CycleManager

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("intelligence-engine")

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
redis_client: aioredis.Redis | None = None
event_store: EventStore | None = None
dna_engine: DNAEngine | None = None
cycle_manager: CycleManager | None = None

ENGINE_START_TIME: str = datetime.now(timezone.utc).isoformat()

# Cache for expensive operations
_cache: dict = {}
_cache_ttl: dict = {}  # key -> expiry timestamp

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    alert_id: str
    feedback_type: str
    category: str = "default"
    details: Optional[dict] = None


class ReportGenerateRequest(BaseModel):
    group_id: Optional[str] = None
    report_type: str = "full"


class IngestRequest(BaseModel):
    sources: Optional[list[str]] = None  # ["osint", "missions", "cognitive"]

# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def set_cache(key: str, value: dict, ttl_seconds: int = 120):
    _cache[key] = value
    _cache_ttl[key] = asyncio.get_event_loop().time() + ttl_seconds


def get_cache(key: str) -> Optional[dict]:
    if key in _cache:
        if asyncio.get_event_loop().time() < _cache_ttl.get(key, 0):
            return _cache[key]
        del _cache[key]
        _cache_ttl.pop(key, None)
    return None

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, event_store, dna_engine, cycle_manager

    logger.info("Connecting to Redis at localhost:6379 ...")
    redis_client = aioredis.Redis(host="localhost", port=6379, decode_responses=True)
    try:
        await redis_client.ping()
        logger.info("Redis connected successfully")
    except Exception as e:
        logger.warning("Redis not available at startup: %s", e)

    event_store = EventStore(redis_client)
    dna_engine = DNAEngine(redis_client, event_store)
    cycle_manager = CycleManager(redis_client)

    # Run initial ingestion in background
    asyncio.create_task(_initial_ingestion())

    logger.info("Intelligence Engine v2 started on port 8900")
    yield

    if dna_engine:
        await dna_engine.close()
    if redis_client:
        await redis_client.aclose()
    logger.info("Intelligence Engine shut down")


async def _initial_ingestion():
    """Run initial data ingestion on startup."""
    await asyncio.sleep(2)  # Wait for everything to settle
    try:
        logger.info("Running initial ingestion...")
        result = await dna_engine.ingestion.run_full_ingestion()
        osint_ok = "errors" not in result.get("osint", {}) or len(result["osint"].get("errors", [])) == 0
        missions_ok = "errors" not in result.get("missions", {}) or len(result["missions"].get("errors", [])) == 0
        logger.info("Initial ingestion complete - OSINT: %s, Missions: %s", osint_ok, missions_ok)
        
        # Run initial analysis
        analysis_data = dna_engine._prepare_analysis_data(result)
        analysis = await dna_engine.analysis.analyze(analysis_data)
        logger.info("Initial analysis complete - risk: %s", analysis.get("overall_risk_level", "unknown"))
        
        set_cache("last_ingestion", result, 300)
        set_cache("last_analysis", analysis, 300)
    except Exception as e:
        logger.error("Initial ingestion failed: %s", e)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Whatomate Intelligence Engine",
    description="Multi-agent intelligence system with DNA layers, decision strategies, and cycles",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def ensure_redis():
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis not initialized")
    try:
        await redis_client.ping()
    except Exception:
        raise HTTPException(status_code=503, detail="Redis connection lost")


async def _fetch_osint_summary() -> dict:
    """Fetch a lightweight summary from OSINT service."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get("http://localhost:8000/api/health/scraper-status")
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        logger.warning("OSINT summary fetch failed: %s", e)
    return {"status": "unreachable"}


async def _fetch_missions_summary() -> dict:
    """Fetch dashboard summary from Agent Missions."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get("http://localhost:8680/api/dashboard")
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        logger.warning("Missions summary fetch failed: %s", e)
    return {"status": "unreachable"}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    redis_ok = False
    if redis_client:
        try:
            redis_ok = await redis_client.ping()
        except Exception:
            redis_ok = False

    return {
        "status": "healthy" if redis_ok else "degraded",
        "service": "intelligence-engine",
        "version": "2.0.0",
        "port": 8900,
        "redis_connected": redis_ok,
        "uptime_since": ENGINE_START_TIME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/status")
async def system_status():
    """Full system status - uses cache, no heavy operations."""
    await ensure_redis()

    cached = get_cache("system_status")
    if cached:
        return cached

    event_count = await event_store.count()
    monitoring_states = await dna_engine.monitoring.get_all_states()
    recent_alerts = await dna_engine.monitoring.get_alerts(limit=5)
    cycle_status = await cycle_manager.get_cycle_status()

    # Quick upstream checks
    osint_summary = await _fetch_osint_summary()
    missions_summary = await _fetch_missions_summary()

    result = {
        "engine": {
            "status": "operational",
            "started_at": ENGINE_START_TIME,
            "event_count": event_count,
        },
        "redis": {"connected": True},
        "osint": {
            "status": osint_summary.get("status", "unknown"),
            "scrapers_reachable": osint_summary.get("reachable", 0),
            "total_scrapers": osint_summary.get("totalScrapers", 0),
        },
        "missions": {
            "status": missions_summary.get("service", "unknown"),
            "groups_active": len(missions_summary.get("groups", [])),
            "total_ingested": missions_summary.get("totalIngested", 0),
            "overall_risk": missions_summary.get("overallRiskScore", 0),
        },
        "monitoring": {
            "active_groups": len(monitoring_states),
            "recent_alert_count": len(recent_alerts),
        },
        "cycles": {
            "fix_cycles": cycle_status["fix_cycle_count"],
            "innovation_cycles": cycle_status["innovation_cycle_count"],
        },
        "strategies": {
            "available": list(STRATEGY_REGISTRY.keys()),
            "count": len(STRATEGY_REGISTRY),
        },
        "connections": {
            "osint": "http://localhost:8000",
            "missions": "http://localhost:8680",
            "cognitive": "http://localhost:8645",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    set_cache("system_status", result, 60)
    return result


# ---- DNA Layer Endpoints ----

@app.get("/api/v1/dna/ingestion")
async def dna_ingestion():
    """Ingestion layer status - returns cached data."""
    await ensure_redis()

    cached = get_cache("last_ingestion")
    recent_data = await dna_engine.ingestion.get_recent_data(limit=3)

    # Count keys
    key_count = 0
    async for _ in redis_client.scan_iter("dna:ingestion:*"):
        key_count += 1

    # Scraper status from OSINT service
    scraper_status = await _fetch_osint_summary()

    return {
        "layer": "ingestion",
        "status": "active",
        "cached_keys": key_count,
        "recent_data_count": len(recent_data),
        "recent_sources": [
            {"key": d.get("key", ""), "categories": list(d.get("data", {}).keys())[:5] if isinstance(d.get("data"), dict) else []}
            for d in recent_data
        ],
        "osint_scrapers": {
            "reachable": scraper_status.get("reachable", 0),
            "total": scraper_status.get("totalScrapers", 0),
            "scrapers": scraper_status.get("scrapers", {}),
        },
        "has_cached_ingestion": cached is not None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/dna/ingestion/run")
async def dna_ingestion_run(background_tasks: BackgroundTasks):
    """Trigger a fresh ingestion from all sources (background)."""
    await ensure_redis()

    async def _run():
        try:
            result = await dna_engine.ingestion.run_full_ingestion()
            analysis_data = dna_engine._prepare_analysis_data(result)
            analysis = await dna_engine.analysis.analyze(analysis_data)
            set_cache("last_ingestion", result, 300)
            set_cache("last_analysis", analysis, 300)
            set_cache("system_status", None, 0)  # Invalidate
            logger.info("Background ingestion + analysis complete")
        except Exception as e:
            logger.error("Background ingestion failed: %s", e)

    background_tasks.add_task(_run)
    return {
        "status": "started",
        "message": "Ingestion running in background. Check /api/v1/dna/ingestion for results.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/dna/analysis")
async def dna_analysis(group_id: Optional[str] = Query(None)):
    """Analysis results - returns cached analysis or last known data."""
    await ensure_redis()

    # Try cached analysis first
    cached = get_cache("last_analysis")
    if cached:
        if group_id and group_id in cached.get("group_analyses", {}):
            return {
                "layer": "analysis",
                "group_id": group_id,
                "analysis": cached["group_analyses"][group_id],
                "source": "cache",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        return {
            "layer": "analysis",
            "group_id": group_id,
            "overall_risk_score": cached.get("overall_risk_score", 0),
            "overall_risk_level": cached.get("overall_risk_level", "unknown"),
            "group_analyses": cached.get("group_analyses", {}),
            "source": "cache",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # Fall back to Agent Missions dashboard data
    missions = await _fetch_missions_summary()
    groups_data = {}
    for g in missions.get("groups", []):
        gid = g.get("id", "")
        groups_data[gid] = {
            "name": g.get("name", ""),
            "risk_score": g.get("riskScore", 0),
            "risk_level": g.get("riskLevel", "unknown"),
            "data_points": g.get("dataPoints", 0),
            "active_alerts": g.get("activeAlerts", 0),
        }

    return {
        "layer": "analysis",
        "group_id": group_id,
        "overall_risk_score": missions.get("overallRiskScore", 0),
        "overall_risk_level": "moderate" if missions.get("overallRiskScore", 0) > 40 else "low",
        "group_analyses": groups_data,
        "source": "agent-missions-proxy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/dna/analysis/run")
async def dna_analysis_run(background_tasks: BackgroundTasks, group_id: Optional[str] = Query(None)):
    """Trigger a fresh analysis (background)."""
    await ensure_redis()

    async def _run():
        try:
            result = await dna_engine.ingestion.run_full_ingestion()
            analysis_data = dna_engine._prepare_analysis_data(result)
            analysis = await dna_engine.analysis.analyze(analysis_data, group_id)
            set_cache("last_analysis", analysis, 300)
            logger.info("Background analysis complete")
        except Exception as e:
            logger.error("Background analysis failed: %s", e)

    background_tasks.add_task(_run)
    return {"status": "started", "message": "Analysis running in background."}


@app.get("/api/v1/dna/monitoring")
async def dna_monitoring(group_id: Optional[str] = Query(None)):
    """Active monitoring state & alerts."""
    await ensure_redis()

    states = await dna_engine.monitoring.get_all_states()
    alerts = await dna_engine.monitoring.get_alerts(group_id, limit=20)

    specific_state = None
    if group_id:
        specific_state = await dna_engine.monitoring.get_state(group_id)

    return {
        "layer": "monitoring",
        "group_id": group_id,
        "all_states": states,
        "specific_state": specific_state,
        "alert_count": len(alerts),
        "alerts": alerts,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/dna/reports")
async def dna_reports(limit: int = Query(10, ge=1, le=50)):
    """Generated reports."""
    await ensure_redis()
    reports = await dna_engine.reports.list_reports(limit)
    return {
        "layer": "reports",
        "report_count": len(reports),
        "reports": reports,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/dna/reports/generate")
async def generate_report(request: ReportGenerateRequest, background_tasks: BackgroundTasks):
    """Generate new report (background)."""
    await ensure_redis()

    async def _run():
        try:
            report = await dna_engine.reports.generate_report(
                group_id=request.group_id,
                report_type=request.report_type,
            )
            logger.info("Report generated: %s", report.get("id", "unknown"))
        except Exception as e:
            logger.error("Report generation failed: %s", e)

    background_tasks.add_task(_run)
    return {"status": "started", "message": "Report generation in background."}


# ---- Strategy Endpoints ----

@app.get("/api/v1/strategies")
async def list_strategies():
    """Strategy configs (from registry, no computation)."""
    await ensure_redis()
    strategies = {}
    for name, cls in STRATEGY_REGISTRY.items():
        strategy = cls(redis_client)
        config = await strategy.get_config()
        strategies[name] = {
            "name": name,
            "class": cls.__name__,
            "config": config,
        }
    return {
        "strategies": strategies,
        "count": len(strategies),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/strategies/{name}/execute")
async def execute_strategy(name: str, background_tasks: BackgroundTasks):
    """Execute specific strategy with live data (background)."""
    await ensure_redis()

    if name not in STRATEGY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Strategy '{name}' not found. Available: {list(STRATEGY_REGISTRY.keys())}")

    async def _run():
        try:
            ingestion_result = await dna_engine.ingestion.run_full_ingestion()
            data = dna_engine._prepare_analysis_data(ingestion_result)
            strategy = get_strategy(name, redis_client)
            result = await strategy.execute(data)
            set_cache(f"strategy_{name}", result, 300)
            logger.info("Strategy %s executed: risk=%s", name, result.get("risk_level", result.get("overall_risk_level", "unknown")))
        except Exception as e:
            logger.error("Strategy %s execution failed: %s", name, e)

    background_tasks.add_task(_run)
    return {"status": "started", "strategy": name, "message": "Running in background. Check /api/v1/strategies for results."}


@app.get("/api/v1/consensus")
async def consensus():
    """Multi-agent consensus results (cached or from missions)."""
    await ensure_redis()

    cached = get_cache("strategy_consensus")
    if cached:
        return cached

    # Fall back to missions dashboard
    missions = await _fetch_missions_summary()
    groups = missions.get("groups", [])
    
    # Simulate consensus from agent mission scores
    consensus_data = {
        "strategy": "consensus",
        "agents": [],
        "overall_verdict": "pending",
    }
    
    if groups:
        for g in groups:
            score = g.get("riskScore", 0)
            level = g.get("riskLevel", "unknown")
            consensus_data["agents"].append({
                "group_id": g.get("id", ""),
                "group_name": g.get("name", ""),
                "risk_score": score,
                "risk_level": level,
                "vote": "elevated" if score > 50 else "normal",
            })
        
        elevated_count = sum(1 for a in consensus_data["agents"] if a["vote"] == "elevated")
        total = len(consensus_data["agents"])
        if elevated_count >= 3:
            consensus_data["overall_verdict"] = "auto_execute_notify"
        elif elevated_count >= 2:
            consensus_data["overall_verdict"] = "human_review"
        elif elevated_count >= 1:
            consensus_data["overall_verdict"] = "auto_execute"
        else:
            consensus_data["overall_verdict"] = "normal_operations"

    return consensus_data


# ---- Event Store Endpoints ----

@app.get("/api/v1/events")
async def query_events(
    event_type: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Event store query."""
    await ensure_redis()

    et = EventType(event_type) if event_type else None
    events = await event_store.query(
        event_type=et,
        source=source,
        since=since,
        until=until,
        limit=limit,
        offset=offset,
    )
    total = await event_store.count(et)

    return {
        "total": total,
        "returned": len(events),
        "offset": offset,
        "limit": limit,
        "events": [e.to_dict() for e in events],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---- Risk Matrix ----

@app.get("/api/v1/risk-matrix")
async def risk_matrix():
    """Risk score matrix - from cache or missions proxy."""
    await ensure_redis()

    cached = get_cache("risk_matrix")
    if cached:
        return cached

    # Build from missions dashboard
    missions = await _fetch_missions_summary()
    groups = missions.get("groups", [])
    
    weights = {"nature": 0.35, "volume": 0.25, "connections": 0.20, "osint": 0.15, "recency": 0.05}
    matrix = {}
    overall_score = 0
    
    for g in groups:
        gid = g.get("id", "")
        score = g.get("riskScore", 0)
        level = g.get("riskLevel", "unknown")
        dp = g.get("dataPoints", 0)
        
        # Reverse-engineer approximate component scores
        matrix[gid] = {
            "composite_score": score,
            "risk_level": level,
            "data_points": dp,
            "components": {
                "nature": round(score * 0.35, 1),
                "volume": round(min(score * 0.25 * (dp / 3000), 25), 1),
                "connections": round(score * 0.20, 1),
                "osint": round(score * 0.15, 1),
                "recency": round(score * 0.05, 1),
            },
            "name": g.get("name", ""),
        }
        overall_score += score
    
    if groups:
        overall_score = round(overall_score / len(groups), 1)
    
    result = {
        "overall_score": overall_score,
        "overall_risk_level": "critical" if overall_score > 80 else "high" if overall_score > 60 else "moderate" if overall_score > 40 else "low",
        "weights": weights,
        "matrix": matrix,
        "source": "agent-missions-proxy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    set_cache("risk_matrix", result, 120)
    return result


# ---- Feedback Endpoint ----

@app.post("/api/v1/feedback")
async def submit_feedback(request: FeedbackRequest):
    """Submit feedback for adaptive learning."""
    await ensure_redis()

    if request.feedback_type not in ("true_positive", "false_positive", "false_negative", "true_negative"):
        raise HTTPException(status_code=400, detail=f"Invalid feedback_type: {request.feedback_type}")

    strategy = AdaptiveStrategy(redis_client)
    feedback_id = await strategy.record_feedback(
        alert_id=request.alert_id,
        feedback_type=request.feedback_type,
        category=request.category,
        details=request.details,
    )

    return {
        "feedback_id": feedback_id,
        "status": "recorded",
        "alert_id": request.alert_id,
        "feedback_type": request.feedback_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---- Cycles Endpoint ----

@app.get("/api/v1/cycles")
async def cycles_status():
    """Fix/innovation cycle status."""
    await ensure_redis()
    status = await cycle_manager.get_cycle_status()
    return status


# ---- OSINT Direct Proxy ----

@app.get("/api/v1/osint/live-data")
async def osint_live_data():
    """Proxy OSINT live data with timeout protection."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get("http://localhost:8000/api/live-data")
            if r.status_code == 200:
                data = r.json()
                # Return summary, not full payload
                summary = {}
                for k, v in data.items():
                    if isinstance(v, list):
                        summary[k] = {"count": len(v), "sample": v[:2] if v else []}
                    elif isinstance(v, dict):
                        summary[k] = {"keys": list(v.keys())[:5]}
                    else:
                        summary[k] = v
                return {"source": "osint", "summary": summary, "timestamp": datetime.now(timezone.utc).isoformat()}
            return {"error": f"OSINT returned {r.status_code}"}
    except Exception as e:
        return {"error": str(e), "source": "osint"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8900)
