"""
Intelligence Engine - Main FastAPI Application.

Port: 8900
Connects to:
  - Redis at localhost:6379
  - OSINT service at http://localhost:8000/api/live-data
  - Agent Missions at http://localhost:8680/api/dashboard
  - Cognitive Service at http://localhost:8645
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, Query
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
# Globals (initialized in lifespan)
# ---------------------------------------------------------------------------
redis_client: aioredis.Redis | None = None
event_store: EventStore | None = None
dna_engine: DNAEngine | None = None
cycle_manager: CycleManager | None = None

ENGINE_START_TIME: str = datetime.now(timezone.utc).isoformat()

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    alert_id: str
    feedback_type: str  # "true_positive", "false_positive", "false_negative", "true_negative"
    category: str = "default"
    details: Optional[dict] = None


class ReportGenerateRequest(BaseModel):
    group_id: Optional[str] = None
    report_type: str = "full"


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and teardown resources."""
    global redis_client, event_store, dna_engine, cycle_manager

    logger.info("Connecting to Redis at localhost:6379 ...")
    redis_client = aioredis.Redis(host="localhost", port=6379, decode_responses=True)
    try:
        await redis_client.ping()
        logger.info("Redis connected successfully")
    except Exception as e:
        logger.warning("Redis not available at startup: %s (will retry on requests)", e)

    event_store = EventStore(redis_client)
    dna_engine = DNAEngine(redis_client, event_store)
    cycle_manager = CycleManager(redis_client)

    logger.info("Intelligence Engine started on port 8900")
    yield

    # Cleanup
    if dna_engine:
        await dna_engine.close()
    if redis_client:
        await redis_client.aclose()
    logger.info("Intelligence Engine shut down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Whatomate Intelligence Engine",
    description="Multi-agent intelligence system with DNA layers, decision strategies, and fix/innovation cycles",
    version="1.0.0",
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
    """Ensure Redis is available, raise 503 if not."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Redis not initialized")
    try:
        await redis_client.ping()
    except Exception:
        raise HTTPException(status_code=503, detail="Redis connection lost")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Service health check."""
    redis_ok = False
    if redis_client:
        try:
            redis_ok = await redis_client.ping()
        except Exception:
            redis_ok = False

    return {
        "status": "healthy" if redis_ok else "degraded",
        "service": "intelligence-engine",
        "port": 8900,
        "redis_connected": redis_ok,
        "uptime_since": ENGINE_START_TIME,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/status")
async def system_status():
    """Full system status."""
    await ensure_redis()

    # Count events
    event_count = await event_store.count()

    # Check monitoring states
    monitoring_states = await dna_engine.monitoring.get_all_states()

    # Recent alerts
    recent_alerts = await dna_engine.monitoring.get_alerts(limit=5)

    # Cycle status
    cycle_status = await cycle_manager.get_cycle_status()

    return {
        "engine": {
            "status": "operational",
            "started_at": ENGINE_START_TIME,
            "event_count": event_count,
        },
        "redis": {"connected": True},
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
            "osint": "http://localhost:8000/api/live-data",
            "missions": "http://localhost:8680/api/dashboard",
            "cognitive": "http://localhost:8645",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---- DNA Layer Endpoints ----

@app.get("/api/v1/dna/ingestion")
async def dna_ingestion():
    """Ingestion layer status & recent data."""
    await ensure_redis()

    recent_data = await dna_engine.ingestion.get_recent_data(limit=10)

    # Run a fresh ingestion
    ingestion_result = await dna_engine.ingestion.run_full_ingestion()

    return {
        "layer": "ingestion",
        "recent_data_count": len(recent_data),
        "recent_data": recent_data,
        "last_ingestion": ingestion_result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/dna/analysis")
async def dna_analysis(group_id: Optional[str] = Query(None)):
    """Analysis results per group."""
    await ensure_redis()

    history = await dna_engine.analysis.get_analysis_history(group_id, limit=10)

    # Run a fresh analysis if we have ingested data
    recent_data = await dna_engine.ingestion.get_recent_data(limit=1)
    if recent_data:
        # Use the most recent ingested data for analysis
        data = recent_data[0].get("data", {})
        # If the data is from OSINT, it might be wrapped
        osint_data = data.get("osint", data) if isinstance(data, dict) else {}
        analysis_data = {"osint": osint_data, "missions": [], "cognitive": {}}

        # Try to get mission data too
        mission_ingestion = await dna_engine.ingestion.ingest_missions()
        analysis_data["missions"] = mission_ingestion.get("missions", [])

        fresh_analysis = await dna_engine.analysis.analyze(analysis_data, group_id)
    else:
        # Run full cycle which includes ingestion
        cycle_result = await dna_engine.run_cycle(group_id)
        fresh_analysis = {
            "risk_score": cycle_result.get("analysis", {}).get("risk_score", 0),
            "risk_level": cycle_result.get("analysis", {}).get("risk_level", "unknown"),
        }

    return {
        "layer": "analysis",
        "group_id": group_id,
        "history_count": len(history),
        "history": history,
        "fresh_analysis": fresh_analysis,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


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
async def generate_report(request: ReportGenerateRequest):
    """Generate new report."""
    await ensure_redis()

    report = await dna_engine.reports.generate_report(
        group_id=request.group_id,
        report_type=request.report_type,
    )
    return report


# ---- Strategy Endpoints ----

@app.get("/api/v1/strategies")
async def list_strategies():
    """Strategy statuses and configs."""
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
async def execute_strategy(name: str):
    """Execute specific strategy with live data."""
    await ensure_redis()

    if name not in STRATEGY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Strategy '{name}' not found. Available: {list(STRATEGY_REGISTRY.keys())}")

    # Ingest fresh data
    ingestion_result = await dna_engine.ingestion.run_full_ingestion()
    data = dna_engine._prepare_analysis_data(ingestion_result)

    # Execute the strategy
    strategy = get_strategy(name, redis_client)
    result = await strategy.execute(data)

    return result


@app.get("/api/v1/consensus")
async def consensus():
    """Multi-agent consensus results."""
    await ensure_redis()

    # Ingest fresh data
    ingestion_result = await dna_engine.ingestion.run_full_ingestion()
    data = dna_engine._prepare_analysis_data(ingestion_result)

    # Execute consensus strategy
    strategy = get_strategy("consensus", redis_client)
    result = await strategy.execute(data)

    return result


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
    """Risk score matrix across all groups."""
    await ensure_redis()

    # Ingest fresh data
    ingestion_result = await dna_engine.ingestion.run_full_ingestion()
    data = dna_engine._prepare_analysis_data(ingestion_result)

    # Run risk scoring
    strategy = get_strategy("risk_scoring", redis_client)
    risk_result = await strategy.execute(data)

    # Build matrix from group scores
    matrix: dict[str, dict] = {}
    group_scores = risk_result.get("group_scores", {})
    for group_id, score_info in group_scores.items():
        matrix[group_id] = {
            "composite_score": score_info.get("composite_score", 0),
            "risk_level": score_info.get("risk_level", "unknown"),
            "components": score_info.get("components", {}),
            "item_count": score_info.get("item_count", 0),
        }

    # Add monitoring states
    monitoring_states = await dna_engine.monitoring.get_all_states()
    for group_id, state in monitoring_states.items():
        if group_id not in matrix:
            matrix[group_id] = {
                "composite_score": state.get("current_risk_score", 0),
                "risk_level": state.get("current_risk_level", "unknown"),
                "source": "monitoring",
            }

    return {
        "overall_score": risk_result.get("overall_score", 0),
        "overall_risk_level": risk_result.get("overall_risk_level", "unknown"),
        "weights": risk_result.get("weights", {}),
        "matrix": matrix,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---- Feedback Endpoint ----

@app.post("/api/v1/feedback")
async def submit_feedback(request: FeedbackRequest):
    """Submit feedback for adaptive learning."""
    await ensure_redis()

    if request.feedback_type not in ("true_positive", "false_positive", "false_negative", "true_negative"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid feedback_type: {request.feedback_type}. Must be one of: true_positive, false_positive, false_negative, true_negative",
        )

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


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8900)
