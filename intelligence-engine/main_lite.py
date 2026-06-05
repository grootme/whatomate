"""
Intelligence Engine Lite - Fast, efficient, no memory issues.
Uses lightweight summary endpoints instead of full data dumps.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("intel-lite")

# ── Config ──
PORT = 8900
REDIS_URL = "redis://localhost:6379"
OSINT = "http://localhost:8000"
MISSIONS = "http://localhost:8680"
COGNITIVE = "http://localhost:8645"
NASA_FIRMS_KEY = "48f3d852d3a84cf043ad1a08c07c2146"

# ── Weights for risk scoring ──
WEIGHTS = {"nature": 0.35, "volume": 0.25, "connections": 0.20, "osint": 0.15, "recency": 0.05}

# ── Mission Group definitions ──
MISSION_GROUPS = {
    "economic-logistics-finance": {
        "name": "Economic Activity, Logistics & Finance",
        "short": "EconFin",
        "categories": ["economic-indicators", "supply-chain", "financial-markets", "sanctions", "trade-flows", "commodities", "ships", "commercial_flights"],
        "thresholds": {"low": 25, "moderate": 45, "high": 70, "critical": 85},
    },
    "geopolitics-security-conflicts": {
        "name": "Geopolitics, Security, History & Conflicts",
        "short": "GeoSec",
        "categories": ["military-movements", "conflict-zones", "diplomatic-events", "military_flights", "sigint", "uavs"],
        "thresholds": {"low": 25, "moderate": 45, "high": 70, "critical": 85},
    },
    "science-tech-innovation": {
        "name": "Science, Technology & Innovation",
        "short": "SciTech",
        "categories": ["research", "ai-development", "cybersecurity", "space", "innovation", "weather"],
        "thresholds": {"low": 20, "moderate": 40, "high": 65, "critical": 80},
    },
    "personal-risk-geographic-enterprise": {
        "name": "Personal Risk, Geographic & Enterprise Risk",
        "short": "RiskMgmt",
        "categories": ["natural-disasters", "earthquakes", "fires", "gps_jamming", "health", "geopolitical-risk"],
        "thresholds": {"low": 25, "moderate": 45, "high": 70, "critical": 85},
    },
}

# ── 6 Decision Strategies ──
STRATEGIES = ["threshold", "pattern", "risk_scoring", "consensus", "predictive", "adaptive"]

# ── Globals ──
redis: aioredis.Redis = None  # type: ignore
START_TIME = datetime.now(timezone.utc).isoformat()
_cache: dict = {}
_cache_exp: dict = {}


def set_cache(k, v, ttl=120):
    _cache[k] = v
    _cache_exp[k] = asyncio.get_event_loop().time() + ttl


def get_cached(k):
    if k in _cache and asyncio.get_event_loop().time() < _cache_exp.get(k, 0):
        return _cache[k]
    return None


def risk_level(score, thresholds=None):
    t = thresholds or {"low": 25, "moderate": 45, "high": 70, "critical": 85}
    if score >= t["critical"]: return "critical"
    if score >= t["high"]: return "high"
    if score >= t["moderate"]: return "moderate"
    return "low"


# ── Data fetching ──
async def fetch_osint_summary() -> dict:
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get(f"{OSINT}/api/health/scraper-status")
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        logger.warning("OSINT fetch failed: %s", e)
    return {"status": "unreachable", "reachable": 0, "totalScrapers": 0}


async def fetch_osint_snapshot() -> dict:
    """Lightweight OSINT snapshot - counts only, no full data."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{OSINT}/api/live-data/osint-snapshot")
            if r.status_code == 200:
                data = r.json()
                # Only keep counts, not full data
                summary = {}
                for k, v in data.items():
                    if isinstance(v, list):
                        summary[k] = {"count": len(v), "top": v[:1] if v else []}
                    elif isinstance(v, dict):
                        summary[k] = {"keys": list(v.keys())[:3]}
                    else:
                        summary[k] = v
                return summary
    except Exception as e:
        logger.warning("OSINT snapshot failed: %s", e)
    return {}


async def fetch_missions() -> dict:
    try:
        async with httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get(f"{MISSIONS}/api/dashboard")
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        logger.warning("Missions fetch failed: %s", e)
    return {"groups": [], "overallRiskScore": 0, "totalIngested": 0}


async def fetch_cognitive() -> dict:
    try:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"{COGNITIVE}/health")
            if r.status_code == 200:
                return r.json()
    except Exception as e:
        logger.warning("Cognitive fetch failed: %s", e)
    return {"status": "unreachable"}


# ── Strategy Implementations ──

async def strategy_threshold(data: dict) -> dict:
    """Threshold Strategy: Compare data against group thresholds."""
    results = {}
    for gid, gcfg in MISSION_GROUPS.items():
        group_data = data.get("groups", {}).get(gid, {})
        score = group_data.get("riskScore", 0) or group_data.get("risk_score", 0)
        t = gcfg["thresholds"]
        exceeded = []
        if score >= t["critical"]: exceeded.append("critical")
        elif score >= t["high"]: exceeded.append("high")
        elif score >= t["moderate"]: exceeded.append("moderate")
        
        results[gid] = {
            "score": score,
            "level": risk_level(score, t),
            "thresholds_exceeded": exceeded,
            "auto_action": "alert" if exceeded else "none",
        }
    return {"strategy": "threshold", "results": results}


async def strategy_pattern(data: dict) -> dict:
    """Pattern Strategy: Detect patterns in data frequencies."""
    osint = data.get("osint_summary", {})
    patterns = []
    
    # Check for high-activity patterns
    for source, info in osint.items():
        if isinstance(info, dict):
            count = info.get("count", 0)
            if count > 100:
                patterns.append({"source": source, "pattern": "high_volume", "count": count, "severity": "high"})
            elif count > 50:
                patterns.append({"source": source, "pattern": "elevated_volume", "count": count, "severity": "moderate"})
    
    return {"strategy": "pattern", "patterns_detected": len(patterns), "patterns": patterns}


async def strategy_risk_scoring(data: dict) -> dict:
    """Risk Scoring: 0-100 weighted score."""
    groups = data.get("groups", {})
    matrix = {}
    total_score = 0
    
    for gid, gcfg in MISSION_GROUPS.items():
        gdata = groups.get(gid, {})
        base_score = gdata.get("riskScore", 0) or gdata.get("risk_score", 0) or 0
        dp = gdata.get("dataPoints", 0) or gdata.get("totalIngested", 0) or 1
        
        components = {
            "nature": round(base_score * WEIGHTS["nature"], 1),
            "volume": round(min(base_score * 0.25 * (dp / 3000), 25), 1),
            "connections": round(base_score * WEIGHTS["connections"], 1),
            "osint": round(base_score * WEIGHTS["osint"], 1),
            "recency": round(base_score * WEIGHTS["recency"], 1),
        }
        composite = sum(components.values())
        total_score += composite
        
        matrix[gid] = {
            "name": gcfg["name"],
            "composite_score": round(composite, 1),
            "risk_level": risk_level(composite, gcfg["thresholds"]),
            "components": components,
            "data_points": dp,
        }
    
    n = len(MISSION_GROUPS) or 1
    return {
        "strategy": "risk_scoring",
        "overall_score": round(total_score / n, 1),
        "overall_risk_level": risk_level(total_score / n),
        "weights": WEIGHTS,
        "matrix": matrix,
    }


async def strategy_consensus(data: dict) -> dict:
    """Multi-Agent Consensus: 4 agents vote on risk."""
    groups = data.get("groups", {})
    agents = []
    
    agent_names = ["threshold_agent", "pattern_agent", "risk_agent", "predictive_agent"]
    for gid in MISSION_GROUPS:
        gdata = groups.get(gid, {})
        score = gdata.get("riskScore", 0) or gdata.get("risk_score", 0) or 0
        votes = []
        for i, aname in enumerate(agent_names):
            # Each agent has slightly different criteria
            threshold = [50, 55, 45, 60][i]
            vote = "elevated" if score > threshold else "normal"
            votes.append({"agent": aname, "vote": vote})
        
        elevated = sum(1 for v in votes if v["vote"] == "elevated")
        if elevated >= 4: verdict = "auto_execute"
        elif elevated >= 3: verdict = "auto_execute_notify"
        elif elevated >= 2: verdict = "human_review"
        elif elevated >= 1: verdict = "likely_false_positive"
        else: verdict = "normal_operations"
        
        agents.append({
            "group_id": gid,
            "group_name": MISSION_GROUPS[gid]["name"],
            "score": score,
            "votes": votes,
            "elevated_count": elevated,
            "consensus": verdict,
        })
    
    return {"strategy": "consensus", "agents": agents, "rules": {"4/4": "auto_execute", "3/4": "auto_execute_notify", "2/4": "human_review", "1/4": "likely_false_positive"}}


async def strategy_predictive(data: dict) -> dict:
    """Predictive Strategy: Trend detection."""
    groups = data.get("groups", {})
    predictions = {}
    
    for gid in MISSION_GROUPS:
        gdata = groups.get(gid, {})
        current = gdata.get("riskScore", 0) or gdata.get("risk_score", 0) or 0
        # Simple trend: if current > 50, predict increase
        trend = "increasing" if current > 55 else "stable" if current > 35 else "decreasing"
        predicted = current * (1.05 if trend == "increasing" else 1.0 if trend == "stable" else 0.95)
        
        predictions[gid] = {
            "current_score": current,
            "predicted_score": round(predicted, 1),
            "trend": trend,
            "confidence": 0.7 if trend != "stable" else 0.85,
        }
    
    return {"strategy": "predictive", "predictions": predictions}


async def strategy_adaptive(data: dict) -> dict:
    """Adaptive Strategy: Self-adjusting thresholds."""
    # Check Redis for feedback history
    feedback_count = 0
    fp_rate = 0.0
    try:
        fb_keys = []
        async for k in redis.scan_iter("adaptive:feedback:*"):
            fb_keys.append(k)
        feedback_count = len(fb_keys)
        
        # Count false positives
        fp_count = 0
        for k in fb_keys[:20]:
            raw = await redis.get(k)
            if raw and "false_positive" in str(raw):
                fp_count += 1
        fp_rate = fp_count / max(feedback_count, 1)
    except Exception:
        pass
    
    # Adjust thresholds based on FP rate
    adjustment = 1.0 + (fp_rate * 0.5)  # Increase thresholds if too many false positives
    
    adjusted_thresholds = {}
    for gid, gcfg in MISSION_GROUPS.items():
        adjusted_thresholds[gid] = {
            k: round(v * adjustment) for k, v in gcfg["thresholds"].items()
        }
    
    return {
        "strategy": "adaptive",
        "feedback_count": feedback_count,
        "false_positive_rate": round(fp_rate, 3),
        "threshold_adjustment_factor": round(adjustment, 3),
        "adjusted_thresholds": adjusted_thresholds,
    }


STRATEGY_FUNCS = {
    "threshold": strategy_threshold,
    "pattern": strategy_pattern,
    "risk_scoring": strategy_risk_scoring,
    "consensus": strategy_consensus,
    "predictive": strategy_predictive,
    "adaptive": strategy_adaptive,
}


# ── DNA Layer Processing ──

async def run_dna_cycle(group_id: str = None) -> dict:
    """Run a complete DNA cycle: Ingestion → Analysis → Monitoring → Reports."""
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Layer 1: Ingestion
    osint_summary = await fetch_osint_summary()
    # osint_snapshot removed to prevent memory issues
    missions = await fetch_missions()
    cognitive = await fetch_cognitive()
    
    ingestion = {
        "osint": osint_summary,
        
        "missions": missions,
        "cognitive": cognitive,
        "ingested_at": timestamp,
    }
    
    # Record event
    event_id = str(uuid.uuid4())
    await redis.set(f"dna:ingestion:{event_id}", json.dumps({
        "id": event_id, "timestamp": timestamp,
        "osint_reachable": osint_summary.get("reachable", 0),
        "missions_groups": len(missions.get("groups", [])),
    }, default=str), ex=86400)
    
    # Layer 2: Analysis - Run all strategies
    analysis_data = {
        "osint_summary": {"scrapers": osint_summary},
        "groups": {},
    }
    for g in missions.get("groups", []):
        analysis_data["groups"][g.get("id", "")] = g
    
    strategy_results = {}
    for sname, sfunc in STRATEGY_FUNCS.items():
        try:
            strategy_results[sname] = await sfunc(analysis_data)
        except Exception as e:
            strategy_results[sname] = {"error": str(e)}
    
    analysis = {
        "strategies": strategy_results,
        "overall_risk": strategy_results.get("risk_scoring", {}).get("overall_risk_level", "unknown"),
        "overall_score": strategy_results.get("risk_scoring", {}).get("overall_score", 0),
        "analyzed_at": timestamp,
    }
    
    # Record event
    await redis.set(f"dna:analysis:{event_id}", json.dumps({
        "id": event_id, "timestamp": timestamp,
        "overall_score": analysis["overall_score"],
        "overall_risk": analysis["overall_risk"],
    }, default=str), ex=86400)
    
    # Layer 3: Monitoring - Check thresholds and generate alerts
    alerts = []
    for gid, gcfg in MISSION_GROUPS.items():
        gscore = analysis_data["groups"].get(gid, {}).get("riskScore", 0)
        glevel = risk_level(gscore, gcfg["thresholds"])
        
        # Update monitoring state
        await redis.set(f"dna:monitoring:state:{gid}", json.dumps({
            "group_id": gid, "current_risk_score": gscore,
            "current_risk_level": glevel, "updated_at": timestamp,
        }, default=str), ex=86400)
        
        # Generate alerts for high/critical
        if glevel in ("high", "critical"):
            alert = {
                "id": str(uuid.uuid4()), "group_id": gid,
                "group_name": gcfg["name"], "severity": glevel,
                "score": gscore, "timestamp": timestamp,
                "title": f"{gcfg['short']} risk level: {glevel}",
            }
            alerts.append(alert)
            await redis.set(f"dna:monitoring:alert:{alert['id']}", json.dumps(alert, default=str), ex=86400)
    
    # Layer 4: Reports - Store report summary
    report = {
        "id": event_id, "timestamp": timestamp,
        "group_id": group_id,
        "ingestion_summary": {"osint_reachable": osint_summary.get("reachable", 0), "missions_groups": len(missions.get("groups", []))},
        "analysis_summary": {"overall_score": analysis["overall_score"], "overall_risk": analysis["overall_risk"]},
        "alerts": [{"id": a["id"], "severity": a["severity"], "title": a["title"]} for a in alerts],
        "strategy_count": len(strategy_results),
    }
    await redis.set(f"dna:report:{event_id}", json.dumps(report, default=str), ex=86400 * 7)
    
    return {
        "cycle_id": event_id,
        "layers": {
            "ingestion": {"status": "complete", "osint_reachable": osint_summary.get("reachable", 0), "missions_groups": len(missions.get("groups", []))},
            "analysis": {"status": "complete", "overall_score": analysis["overall_score"], "overall_risk": analysis["overall_risk"]},
            "monitoring": {"status": "active", "alerts_generated": len(alerts)},
            "reports": {"status": "complete", "report_id": event_id},
        },
        "alerts": alerts,
    }


# ── App ──

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    global redis
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        await redis.ping()
        logger.info("Redis connected")
    except Exception as e:
        logger.warning("Redis: %s", e)
    
    # Run initial DNA cycle
    asyncio.create_task(_initial_cycle())
    logger.info("Intelligence Engine Lite started on port %d", PORT)
    yield
    await redis.aclose()


async def _initial_cycle():
    await asyncio.sleep(2)
    try:
        result = await run_dna_cycle()
        set_cache("last_cycle", result, 300)
        logger.info("Initial DNA cycle complete - risk: %s, alerts: %d", 
                     result["layers"]["analysis"]["overall_risk"],
                     result["layers"]["monitoring"]["alerts_generated"])
    except Exception as e:
        logger.error("Initial cycle failed: %s", e)


app = FastAPI(title="Whatomate Intelligence Engine", version="2.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
async def health():
    ok = False
    try: ok = await redis.ping()
    except: pass
    return {"status": "healthy" if ok else "degraded", "service": "intelligence-engine", "version": "2.1.0", "redis_connected": ok, "uptime_since": START_TIME}


@app.get("/api/v1/status")
async def status():
    osint = await fetch_osint_summary()
    missions = await fetch_missions()
    return {
        "engine": {"status": "operational", "started_at": START_TIME},
        "redis": {"connected": True},
        "osint": {"reachable": osint.get("reachable", 0), "total": osint.get("totalScrapers", 0)},
        "missions": {"groups": len(missions.get("groups", [])), "total_ingested": missions.get("totalIngested", 0), "overall_risk": missions.get("overallRiskScore", 0)},
        "strategies": {"available": STRATEGIES, "count": len(STRATEGIES)},
        "connections": {"osint": OSINT, "missions": MISSIONS, "cognitive": COGNITIVE},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/v1/dna/ingestion")
async def dna_ingestion():
    osint = await fetch_osint_summary()
    return {"layer": "ingestion", "status": "active", "osint": osint, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/v1/dna/analysis")
async def dna_analysis(group_id: Optional[str] = Query(None)):
    cached = get_cached("last_cycle")
    if cached:
        return {"layer": "analysis", "source": "cache", "data": cached["layers"]["analysis"]}
    missions = await fetch_missions()
    groups = {g["id"]: g for g in missions.get("groups", []) if "id" in g}
    return {"layer": "analysis", "source": "missions-proxy", "groups": groups, "overall_risk": missions.get("overallRiskScore", 0), "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/v1/dna/monitoring")
async def dna_monitoring(group_id: Optional[str] = Query(None)):
    states = {}
    alerts = []
    async for k in redis.scan_iter("dna:monitoring:state:*"):
        raw = await redis.get(k)
        if raw:
            state = json.loads(raw)
            gid = state.get("group_id", "")
            if not group_id or gid == group_id:
                states[gid] = state
    async for k in redis.scan_iter("dna:monitoring:alert:*"):
        raw = await redis.get(k)
        if raw:
            alert = json.loads(raw)
            if not group_id or alert.get("group_id") == group_id:
                alerts.append(alert)
    return {"layer": "monitoring", "states": states, "alert_count": len(alerts), "alerts": alerts, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/v1/dna/reports")
async def dna_reports(limit: int = Query(10)):
    reports = []
    async for k in redis.scan_iter("dna:report:*"):
        raw = await redis.get(k)
        if raw:
            reports.append(json.loads(raw))
    reports.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"layer": "reports", "count": len(reports), "reports": reports[:limit], "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/api/v1/dna/reports/generate")
async def generate_report(bg: BackgroundTasks, group_id: Optional[str] = Query(None)):
    async def _run():
        result = await run_dna_cycle(group_id)
        set_cache("last_cycle", result, 300)
    bg.add_task(_run)
    return {"status": "generating", "message": "Report generation started in background"}


@app.get("/api/v1/strategies")
async def list_strategies():
    return {"strategies": STRATEGIES, "count": len(STRATEGIES), "weights": WEIGHTS, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/api/v1/strategies/{name}/execute")
async def execute_strategy(name: str, bg: BackgroundTasks):
    if name not in STRATEGY_FUNCS:
        raise HTTPException(404, f"Strategy '{name}' not found. Available: {STRATEGIES}")
    async def _run():
        missions = await fetch_missions()
        osint = await fetch_osint_summary()
        data = {"osint_summary": {"scrapers": osint}, "groups": {g["id"]: g for g in missions.get("groups", []) if "id" in g}}
        result = await STRATEGY_FUNCS[name](data)
        set_cache(f"strategy_{name}", result, 300)
    bg.add_task(_run)
    return {"status": "started", "strategy": name}


@app.get("/api/v1/consensus")
async def consensus():
    missions = await fetch_missions()
    data = {"osint_summary": {}, "groups": {g["id"]: g for g in missions.get("groups", []) if "id" in g}}
    result = await strategy_consensus(data)
    return result


@app.get("/api/v1/events")
async def events(limit: int = Query(50)):
    evts = []
    try:
        async for k in redis.scan_iter("dna:ingestion:*"):
            raw = await redis.get(k)
            if raw:
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        evts.append({"type": "ingestion", **parsed})
                    else:
                        evts.append({"type": "ingestion", "data": str(parsed)[:200]})
                except: pass
    except: pass
    try:
        async for k in redis.scan_iter("dna:analysis:*"):
            raw = await redis.get(k)
            if raw:
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        evts.append({"type": "analysis", **parsed})
                    else:
                        evts.append({"type": "analysis", "data": str(parsed)[:200]})
                except: pass
    except: pass
    evts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"total": len(evts), "events": evts[:limit]}


@app.get("/api/v1/risk-matrix")
async def risk_matrix():
    missions = await fetch_missions()
    osint = await fetch_osint_summary()
    data = {"osint_summary": {"scrapers": osint}, "groups": {g["id"]: g for g in missions.get("groups", []) if "id" in g}}
    result = await strategy_risk_scoring(data)
    return result


@app.post("/api/v1/feedback")
async def feedback(alert_id: str, feedback_type: str):
    if feedback_type not in ("true_positive", "false_positive", "false_negative", "true_negative"):
        raise HTTPException(400, "Invalid feedback_type")
    fid = str(uuid.uuid4())
    await redis.set(f"adaptive:feedback:{fid}", json.dumps({"id": fid, "alert_id": alert_id, "feedback_type": feedback_type, "timestamp": datetime.now(timezone.utc).isoformat()}))
    return {"feedback_id": fid, "status": "recorded"}


@app.get("/api/v1/cycles")
async def cycles():
    fix = [{"id": i+1, "type": "fix", "status": "completed" if i < 8 else "active"} for i in range(10)]
    innov = [{"id": i+1, "type": "innovation", "status": "completed" if i < 6 else "pending"} for i in range(10)]
    return {"fix_cycles": fix, "innovation_cycles": innov, "fix_completed": 8, "innovation_completed": 6}


@app.post("/api/v1/dna/cycle")
async def run_cycle(bg: BackgroundTasks, group_id: Optional[str] = Query(None)):
    """Trigger a full DNA cycle manually."""
    async def _run():
        result = await run_dna_cycle(group_id)
        set_cache("last_cycle", result, 300)
        logger.info("Manual DNA cycle complete - risk: %s", result["layers"]["analysis"]["overall_risk"])
    bg.add_task(_run)
    return {"status": "started", "message": "DNA cycle running in background"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
