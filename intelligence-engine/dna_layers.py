"""
DNA Layers - The four processing layers of the Intelligence Engine.

Layer 1 - Ingestion: Pull real data from OSINT & Agent Missions services
Layer 2 - Analysis: Process through all 6 strategies, cross-correlate
Layer 3 - Monitoring: Active monitoring rules, alert generation, risk tracking
Layer 4 - Reports: Structured intelligence report generation
"""

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import redis.asyncio as aioredis

from event_store import EventStore, Event, EventType
from strategies import (
    get_strategy,
    ThresholdStrategy,
    PatternStrategy,
    RiskScoringStrategy,
    ConsensusStrategy,
    PredictiveStrategy,
    AdaptiveStrategy,
)

logger = logging.getLogger("intelligence-engine.dna")

# ---------------------------------------------------------------------------
# Service endpoints
# ---------------------------------------------------------------------------
OSINT_URL = "http://localhost:8000/api/live-data"
MISSIONS_URL = "http://localhost:8680/api/dashboard"
COGNITIVE_URL = "http://localhost:8645"
NASA_FIRMS_API_KEY = "48f3d852d3a84cf043ad1a08c07c2146"


# ---------------------------------------------------------------------------
# Layer 1 - Ingestion
# ---------------------------------------------------------------------------

class IngestionLayer:
    """
    Pull real data from external services and store as event-sourced entries.

    Key pattern: dna:ingestion:{timestamp}:{source}
    """

    def __init__(self, redis: aioredis.Redis, event_store: EventStore):
        self.redis = redis
        self.event_store = event_store
        self.http_client = httpx.AsyncClient(timeout=30.0)

    async def ingest_osint(self) -> dict[str, Any]:
        """Pull data from the OSINT service."""
        result: dict[str, Any] = {"sources": {}, "errors": [], "ingested_at": datetime.now(timezone.utc).isoformat()}

        try:
            params = {"nasa_firms_key": NASA_FIRMS_API_KEY}
            resp = await self.http_client.get(OSINT_URL, params=params)
            if resp.status_code == 200:
                data = resp.json()
                result["sources"]["osint"] = data

                # Store raw events in Redis as event sourcing
                timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
                key = f"dna:ingestion:{timestamp}:osint"
                await self.redis.set(key, json.dumps(data))

                # Record in event store
                event = Event(
                    event_type=EventType.INGEST,
                    payload={"source": "osint", "key": key, "categories": list(data.keys()) if isinstance(data, dict) else []},
                    source="ingestion_layer",
                )
                await self.event_store.append(event)

                # Store individual categories
                if isinstance(data, dict):
                    for category, items in data.items():
                        cat_key = f"dna:ingestion:{timestamp}:osint:{category}"
                        await self.redis.set(cat_key, json.dumps(items), ex=86400)  # 24h TTL
            else:
                result["errors"].append(f"OSINT service returned {resp.status_code}")
        except httpx.ConnectError:
            result["errors"].append("OSINT service unreachable")
            logger.warning("OSINT service unreachable at %s", OSINT_URL)
        except Exception as e:
            result["errors"].append(f"OSINT error: {str(e)}")
            logger.error("OSINT ingestion error: %s", e)

        return result

    async def ingest_missions(self) -> dict[str, Any]:
        """Pull data from the Agent Missions service."""
        result: dict[str, Any] = {"missions": [], "errors": [], "ingested_at": datetime.now(timezone.utc).isoformat()}

        try:
            resp = await self.http_client.get(MISSIONS_URL)
            if resp.status_code == 200:
                data = resp.json()
                missions = data if isinstance(data, list) else data.get("missions", data.get("data", []))
                result["missions"] = missions

                timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
                key = f"dna:ingestion:{timestamp}:missions"
                await self.redis.set(key, json.dumps(data))

                event = Event(
                    event_type=EventType.INGEST,
                    payload={"source": "missions", "key": key, "mission_count": len(missions) if isinstance(missions, list) else 0},
                    source="ingestion_layer",
                )
                await self.event_store.append(event)
            else:
                result["errors"].append(f"Missions service returned {resp.status_code}")
        except httpx.ConnectError:
            result["errors"].append("Missions service unreachable")
            logger.warning("Missions service unreachable at %s", MISSIONS_URL)
        except Exception as e:
            result["errors"].append(f"Missions error: {str(e)}")
            logger.error("Missions ingestion error: %s", e)

        return result

    async def ingest_cognitive(self) -> dict[str, Any]:
        """Pull data from the Cognitive service."""
        result: dict[str, Any] = {"cognitive": {}, "errors": [], "ingested_at": datetime.now(timezone.utc).isoformat()}

        try:
            resp = await self.http_client.get(f"{COGNITIVE_URL}/")
            if resp.status_code == 200:
                data = resp.json()
                result["cognitive"] = data

                timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
                key = f"dna:ingestion:{timestamp}:cognitive"
                await self.redis.set(key, json.dumps(data))

                event = Event(
                    event_type=EventType.INGEST,
                    payload={"source": "cognitive", "key": key},
                    source="ingestion_layer",
                )
                await self.event_store.append(event)
            else:
                result["errors"].append(f"Cognitive service returned {resp.status_code}")
        except httpx.ConnectError:
            result["errors"].append("Cognitive service unreachable")
            logger.warning("Cognitive service unreachable at %s", COGNITIVE_URL)
        except Exception as e:
            result["errors"].append(f"Cognitive error: {str(e)}")
            logger.error("Cognitive ingestion error: %s", e)

        return result

    async def run_full_ingestion(self) -> dict[str, Any]:
        """Run ingestion from all sources."""
        osint_result = await self.ingest_osint()
        missions_result = await self.ingest_missions()
        cognitive_result = await self.ingest_cognitive()

        return {
            "osint": osint_result,
            "missions": missions_result,
            "cognitive": cognitive_result,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_recent_data(self, limit: int = 10) -> list[dict]:
        """Retrieve recent ingestion data from Redis."""
        keys = []
        async for key in self.redis.scan_iter("dna:ingestion:*"):
            keys.append(key if isinstance(key, str) else key.decode())

        keys.sort(reverse=True)
        results = []
        for key in keys[:limit]:
            raw = await self.redis.get(key)
            if raw:
                results.append({
                    "key": key if isinstance(key, str) else key.decode(),
                    "data": json.loads(raw) if isinstance(raw, (str, bytes)) else raw,
                })
        return results

    async def close(self):
        await self.http_client.aclose()


# ---------------------------------------------------------------------------
# Layer 2 - Analysis
# ---------------------------------------------------------------------------

class AnalysisLayer:
    """
    Process ingested data through all 6 strategies.
    Cross-correlate data between sources.

    Key pattern: dna:analysis:{group_id}:{timestamp}
    """

    def __init__(self, redis: aioredis.Redis, event_store: EventStore):
        self.redis = redis
        self.event_store = event_store

    async def analyze(self, data: dict[str, Any], group_id: Optional[str] = None) -> dict[str, Any]:
        """Run all strategies on the provided data."""
        group_id = group_id or "default"
        results: dict[str, Any] = {}

        # Execute each strategy
        for strategy_name in ["threshold", "pattern", "risk_scoring", "predictive", "adaptive", "consensus"]:
            try:
                strategy = get_strategy(strategy_name, self.redis)
                result = await strategy.execute(data)
                results[strategy_name] = result
            except Exception as e:
                logger.error("Strategy %s failed: %s", strategy_name, e)
                results[strategy_name] = {"error": str(e), "strategy": strategy_name}

        # Cross-correlation analysis
        cross_correlation = self._cross_correlate(data)
        results["cross_correlation"] = cross_correlation

        # Extract risk score from risk_scoring result
        overall_risk = 0.0
        risk_level = "minimal"
        if "risk_scoring" in results and "error" not in results["risk_scoring"]:
            overall_risk = results["risk_scoring"].get("overall_score", 0)
            risk_level = results["risk_scoring"].get("overall_risk_level", "minimal")

        analysis_result = {
            "group_id": group_id,
            "strategies": results,
            "overall_risk_score": overall_risk,
            "overall_risk_level": risk_level,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }

        # Store analysis in Redis
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        key = f"dna:analysis:{group_id}:{timestamp}"
        await self.redis.set(key, json.dumps(analysis_result, default=str), ex=86400)

        # Record in event store
        event = Event(
            event_type=EventType.ANALYZE,
            payload={"group_id": group_id, "key": key, "risk_score": overall_risk, "risk_level": risk_level},
            source="analysis_layer",
        )
        await self.event_store.append(event)

        return analysis_result

    async def get_analysis_history(self, group_id: Optional[str] = None, limit: int = 10) -> list[dict]:
        """Retrieve analysis history from Redis."""
        pattern = f"dna:analysis:{group_id}:*" if group_id else "dna:analysis:*"
        keys = []
        async for key in self.redis.scan_iter(pattern):
            keys.append(key if isinstance(key, str) else key.decode())

        keys.sort(reverse=True)
        results = []
        for key in keys[:limit]:
            raw = await self.redis.get(key)
            if raw:
                entry = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
                entry["_key"] = key
                results.append(entry)
        return results

    @staticmethod
    def _cross_correlate(data: dict[str, Any]) -> dict[str, Any]:
        """Cross-correlate data between different sources."""
        correlations: list[dict[str, Any]] = []
        osint_data = data.get("osint", {})

        # Check for temporal correlations
        time_windows: dict[str, list[dict]] = {}
        for category, items in osint_data.items():
            if not isinstance(items, list):
                continue
            for item in items:
                ts = item.get("timestamp") or item.get("time") or item.get("date")
                if ts:
                    try:
                        if isinstance(ts, str):
                            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                            hour_key = dt.strftime("%Y-%m-%dT%H")
                            if hour_key not in time_windows:
                                time_windows[hour_key] = []
                            time_windows[hour_key].append({"category": category, "item": item})
                    except (ValueError, TypeError):
                        pass

        # Find time windows with multiple categories
        for time_key, events in time_windows.items():
            categories_in_window = set(e["category"] for e in events)
            if len(categories_in_window) >= 2:
                correlations.append({
                    "type": "temporal_correlation",
                    "time_window": time_key,
                    "categories": list(categories_in_window),
                    "event_count": len(events),
                    "significance": "high" if len(categories_in_window) >= 3 else "moderate",
                })

        return {
            "correlations_found": len(correlations),
            "correlations": correlations,
        }


# ---------------------------------------------------------------------------
# Layer 3 - Monitoring
# ---------------------------------------------------------------------------

class MonitoringLayer:
    """
    Active monitoring rules per group.
    Alert generation when thresholds exceeded.
    Real-time risk score updates.

    Key patterns:
      dna:monitoring:alert:{alert_id}
      dna:monitoring:state:{group_id}
    """

    def __init__(self, redis: aioredis.Redis, event_store: EventStore):
        self.redis = redis
        self.event_store = event_store

    async def update_state(self, group_id: str, analysis_result: dict[str, Any]) -> dict[str, Any]:
        """Update monitoring state for a group based on analysis results."""
        now = datetime.now(timezone.utc)

        # Load current state
        state_key = f"dna:monitoring:state:{group_id}"
        raw = await self.redis.get(state_key)
        current_state = json.loads(raw) if raw else {
            "group_id": group_id,
            "status": "active",
            "current_risk_score": 0,
            "current_risk_level": "minimal",
            "alert_count": 0,
            "last_updated": None,
            "monitoring_since": now.isoformat(),
            "risk_history": [],
        }

        # Update state
        new_risk = analysis_result.get("overall_risk_score", 0)
        new_level = analysis_result.get("overall_risk_level", "minimal")

        risk_history = current_state.get("risk_history", [])
        risk_history.append({"timestamp": now.isoformat(), "score": new_risk, "level": new_level})
        # Keep last 100 entries
        risk_history = risk_history[-100:]

        current_state.update({
            "current_risk_score": new_risk,
            "current_risk_level": new_level,
            "last_updated": now.isoformat(),
            "risk_history": risk_history,
        })

        await self.redis.set(state_key, json.dumps(current_state, default=str))

        # Generate alerts if needed
        alerts = await self._check_alerts(group_id, analysis_result, current_state)

        return {
            "group_id": group_id,
            "state": current_state,
            "new_alerts": len(alerts),
            "alerts": alerts,
            "updated_at": now.isoformat(),
        }

    async def _check_alerts(self, group_id: str, analysis: dict, state: dict) -> list[dict]:
        """Check if any alerts should be generated."""
        alerts: list[dict] = []
        now = datetime.now(timezone.utc)

        risk_score = analysis.get("overall_risk_score", 0)
        risk_level = analysis.get("overall_risk_level", "minimal")

        # Alert on high/critical risk
        if risk_level in ("high", "critical"):
            alert = await self._create_alert(group_id, {
                "alert_type": "risk_threshold_exceeded",
                "severity": risk_level,
                "risk_score": risk_score,
                "message": f"Risk level {risk_level} detected for group {group_id} (score: {risk_score})",
                "timestamp": now.isoformat(),
            })
            alerts.append(alert)

        # Alert on risk score increase
        prev_score = state.get("current_risk_score", 0)
        if risk_score - prev_score >= 20:
            alert = await self._create_alert(group_id, {
                "alert_type": "risk_increase",
                "severity": "moderate" if risk_score < 60 else "high",
                "previous_score": prev_score,
                "current_score": risk_score,
                "delta": risk_score - prev_score,
                "message": f"Risk score increased by {risk_score - prev_score:.1f} for group {group_id}",
                "timestamp": now.isoformat(),
            })
            alerts.append(alert)

        # Alert on threshold strategy findings
        threshold_result = analysis.get("strategies", {}).get("threshold", {})
        if isinstance(threshold_result, dict) and "error" not in threshold_result:
            for alert_item in threshold_result.get("alerts", []):
                if alert_item.get("severity") in ("high", "critical"):
                    alert = await self._create_alert(group_id, {
                        "alert_type": "threshold_alert",
                        "severity": alert_item["severity"],
                        "category": alert_item.get("category"),
                        "value": alert_item.get("value"),
                        "message": f"Threshold exceeded: {alert_item.get('category')} = {alert_item.get('value')}",
                        "timestamp": now.isoformat(),
                    })
                    alerts.append(alert)

        # Alert on pattern findings
        pattern_result = analysis.get("strategies", {}).get("pattern", {})
        if isinstance(pattern_result, dict) and "error" not in pattern_result:
            for pattern in pattern_result.get("patterns", []):
                if pattern.get("pattern_type") in ("frequency_spike", "geographic_clustering"):
                    if pattern.get("spike_ratio", 0) >= 3 or pattern.get("largest_cluster", 0) >= 5:
                        alert = await self._create_alert(group_id, {
                            "alert_type": "pattern_alert",
                            "severity": "moderate",
                            "pattern_type": pattern["pattern_type"],
                            "message": f"Pattern detected: {pattern.get('description', 'unknown pattern')}",
                            "timestamp": now.isoformat(),
                        })
                        alerts.append(alert)

        return alerts

    async def _create_alert(self, group_id: str, alert_data: dict) -> dict:
        """Create and store an alert."""
        alert_id = str(uuid.uuid4())
        alert = {
            "alert_id": alert_id,
            "group_id": group_id,
            **alert_data,
        }

        # Store in Redis
        key = f"dna:monitoring:alert:{alert_id}"
        await self.redis.set(key, json.dumps(alert, default=str), ex=604800)  # 7 day TTL

        # Add to alert index for the group
        await self.redis.lpush(f"dna:monitoring:alerts:{group_id}", alert_id)
        await self.redis.ltrim(f"dna:monitoring:alerts:{group_id}", 0, 99)

        # Record in event store
        event = Event(
            event_type=EventType.ALERT,
            payload=alert,
            source="monitoring_layer",
        )
        await self.event_store.append(event)

        return alert

    async def get_state(self, group_id: str) -> Optional[dict]:
        """Get monitoring state for a group."""
        raw = await self.redis.get(f"dna:monitoring:state:{group_id}")
        if raw:
            return json.loads(raw)
        return None

    async def get_alerts(self, group_id: Optional[str] = None, limit: int = 20) -> list[dict]:
        """Get alerts, optionally filtered by group."""
        if group_id:
            alert_ids = await self.redis.lrange(f"dna:monitoring:alerts:{group_id}", 0, limit - 1)
        else:
            alert_ids = []
            async for key in self.redis.scan_iter("dna:monitoring:alert:*"):
                aid = key.split(":")[-1] if isinstance(key, str) else key.decode().split(":")[-1]
                alert_ids.append(aid)

        alerts = []
        for aid in alert_ids[:limit]:
            aid_str = aid if isinstance(aid, str) else aid.decode()
            raw = await self.redis.get(f"dna:monitoring:alert:{aid_str}")
            if raw:
                alerts.append(json.loads(raw))
        return alerts

    async def get_all_states(self) -> dict[str, dict]:
        """Get monitoring states for all groups."""
        states = {}
        async for key in self.redis.scan_iter("dna:monitoring:state:*"):
            key_str = key if isinstance(key, str) else key.decode()
            group_id = key_str.replace("dna:monitoring:state:", "")
            raw = await self.redis.get(key_str)
            if raw:
                states[group_id] = json.loads(raw)
        return states


# ---------------------------------------------------------------------------
# Layer 4 - Reports
# ---------------------------------------------------------------------------

class ReportsLayer:
    """
    Generate structured intelligence reports.
    Include risk scores, findings, alerts, predictions.

    Key pattern: dna:reports:{report_id}
    """

    def __init__(self, redis: aioredis.Redis, event_store: EventStore):
        self.redis = redis
        self.event_store = event_store

    async def generate_report(
        self,
        group_id: Optional[str] = None,
        report_type: str = "full",
    ) -> dict[str, Any]:
        """Generate a structured intelligence report."""
        now = datetime.now(timezone.utc)
        report_id = f"rpt-{now.strftime('%Y%m%d%H%M%S')}-{str(uuid.uuid4())[:8]}"

        # Gather data for report
        ingestion_data = await self._get_latest_ingestion()
        analysis_data = await self._get_latest_analysis(group_id)
        monitoring_data = await self._get_monitoring_state(group_id)
        alerts_data = await self._get_recent_alerts(group_id)

        # Build report sections
        report: dict[str, Any] = {
            "report_id": report_id,
            "report_type": report_type,
            "group_id": group_id,
            "generated_at": now.isoformat(),
            "summary": self._build_summary(analysis_data, monitoring_data, alerts_data),
            "risk_assessment": self._build_risk_assessment(analysis_data),
            "findings": self._build_findings(analysis_data),
            "alerts": self._build_alerts_section(alerts_data),
            "predictions": self._build_predictions(analysis_data),
            "data_sources": self._build_data_sources(ingestion_data),
            "recommendations": self._build_recommendations(analysis_data, alerts_data),
        }

        # Store report
        key = f"dna:reports:{report_id}"
        await self.redis.set(key, json.dumps(report, default=str), ex=2592000)  # 30 day TTL

        # Add to report index
        await self.redis.lpush("dna:reports:index", report_id)
        await self.redis.ltrim("dna:reports:index", 0, 49)

        # Record in event store
        event = Event(
            event_type=EventType.REPORT,
            payload={"report_id": report_id, "group_id": group_id, "report_type": report_type},
            source="reports_layer",
        )
        await self.event_store.append(event)

        return report

    async def get_report(self, report_id: str) -> Optional[dict]:
        """Retrieve a specific report."""
        raw = await self.redis.get(f"dna:reports:{report_id}")
        if raw:
            return json.loads(raw)
        return None

    async def list_reports(self, limit: int = 10) -> list[dict]:
        """List recent reports."""
        report_ids = await self.redis.lrange("dna:reports:index", 0, limit - 1)
        reports = []
        for rid in report_ids:
            rid_str = rid if isinstance(rid, str) else rid.decode()
            raw = await self.redis.get(f"dna:reports:{rid_str}")
            if raw:
                report = json.loads(raw)
                reports.append({
                    "report_id": rid_str,
                    "generated_at": report.get("generated_at"),
                    "report_type": report.get("report_type"),
                    "group_id": report.get("group_id"),
                    "summary_risk": report.get("summary", {}).get("overall_risk_level", "unknown"),
                })
        return reports

    async def _get_latest_ingestion(self) -> dict:
        """Get latest ingestion data."""
        keys = []
        async for key in self.redis.scan_iter("dna:ingestion:*"):
            keys.append(key if isinstance(key, str) else key.decode())
        keys.sort(reverse=True)
        data = {}
        for key in keys[:5]:
            raw = await self.redis.get(key)
            if raw:
                data[key] = json.loads(raw)
        return data

    async def _get_latest_analysis(self, group_id: Optional[str]) -> list[dict]:
        """Get latest analysis results."""
        pattern = f"dna:analysis:{group_id}:*" if group_id else "dna:analysis:*"
        keys = []
        async for key in self.redis.scan_iter(pattern):
            keys.append(key if isinstance(key, str) else key.decode())
        keys.sort(reverse=True)
        results = []
        for key in keys[:3]:
            raw = await self.redis.get(key)
            if raw:
                results.append(json.loads(raw))
        return results

    async def _get_monitoring_state(self, group_id: Optional[str]) -> dict:
        """Get monitoring state."""
        if group_id:
            raw = await self.redis.get(f"dna:monitoring:state:{group_id}")
            if raw:
                return json.loads(raw)
        return {}

    async def _get_recent_alerts(self, group_id: Optional[str]) -> list[dict]:
        """Get recent alerts."""
        if group_id:
            alert_ids = await self.redis.lrange(f"dna:monitoring:alerts:{group_id}", 0, 9)
        else:
            alert_ids = []
            async for key in self.redis.scan_iter("dna:monitoring:alert:*"):
                aid = key.split(":")[-1] if isinstance(key, str) else key.decode().split(":")[-1]
                alert_ids.append(aid)
        alerts = []
        for aid in alert_ids[:10]:
            aid_str = aid if isinstance(aid, str) else aid.decode()
            raw = await self.redis.get(f"dna:monitoring:alert:{aid_str}")
            if raw:
                alerts.append(json.loads(raw))
        return alerts

    @staticmethod
    def _build_summary(analysis: list[dict], monitoring: dict, alerts: list[dict]) -> dict:
        risk_score = 0
        risk_level = "minimal"
        if analysis:
            risk_score = analysis[0].get("overall_risk_score", 0)
            risk_level = analysis[0].get("overall_risk_level", "minimal")
        return {
            "overall_risk_score": risk_score,
            "overall_risk_level": risk_level,
            "active_alerts": len(alerts),
            "analysis_available": len(analysis) > 0,
            "monitoring_active": bool(monitoring),
        }

    @staticmethod
    def _build_risk_assessment(analysis: list[dict]) -> dict:
        if not analysis:
            return {"status": "no_data", "group_scores": {}}
        latest = analysis[0]
        return {
            "status": "assessed",
            "overall_score": latest.get("overall_risk_score", 0),
            "overall_level": latest.get("overall_risk_level", "unknown"),
            "group_scores": latest.get("strategies", {}).get("risk_scoring", {}).get("group_scores", {}),
        }

    @staticmethod
    def _build_findings(analysis: list[dict]) -> list[dict]:
        findings = []
        if not analysis:
            return findings
        latest = analysis[0]
        strategies = latest.get("strategies", {})

        # Threshold findings
        threshold = strategies.get("threshold", {})
        if isinstance(threshold, dict) and "error" not in threshold:
            for alert in threshold.get("alerts", []):
                findings.append({
                    "type": "threshold_exceeded",
                    "severity": alert.get("severity", "unknown"),
                    "category": alert.get("category", "unknown"),
                    "detail": f"{alert.get('category')} value {alert.get('value')} exceeds {alert.get('severity')} threshold",
                })

        # Pattern findings
        pattern = strategies.get("pattern", {})
        if isinstance(pattern, dict) and "error" not in pattern:
            for p in pattern.get("patterns", []):
                findings.append({
                    "type": "pattern_detected",
                    "severity": "moderate",
                    "category": p.get("category", "unknown"),
                    "detail": p.get("description", "unknown pattern"),
                })

        return findings

    @staticmethod
    def _build_alerts_section(alerts: list[dict]) -> list[dict]:
        return [
            {
                "alert_id": a.get("alert_id"),
                "type": a.get("alert_type"),
                "severity": a.get("severity"),
                "message": a.get("message"),
                "timestamp": a.get("timestamp"),
            }
            for a in alerts
        ]

    @staticmethod
    def _build_predictions(analysis: list[dict]) -> dict:
        if not analysis:
            return {"status": "no_data"}
        strategies = analysis[0].get("strategies", {})
        predictive = strategies.get("predictive", {})
        if isinstance(predictive, dict) and "error" not in predictive:
            return {
                "status": "available",
                "current_risk": predictive.get("prediction", {}).get("current_risk_score", 0),
                "trend": predictive.get("prediction", {}).get("trend", "unknown"),
                "predicted_risk": predictive.get("prediction", {}).get("predicted_risk_score", 0),
                "confidence": predictive.get("prediction", {}).get("confidence", "low"),
                "category_predictions": predictive.get("category_predictions", {}),
            }
        return {"status": "unavailable"}

    @staticmethod
    def _build_data_sources(ingestion: dict) -> list[dict]:
        sources = []
        for key in ingestion:
            source_name = "unknown"
            if "osint" in key:
                source_name = "OSINT"
            elif "missions" in key:
                source_name = "Agent Missions"
            elif "cognitive" in key:
                source_name = "Cognitive Service"
            sources.append({"source": source_name, "key": key})
        return sources

    @staticmethod
    def _build_recommendations(analysis: list[dict], alerts: list[dict]) -> list[str]:
        recommendations = []
        if not analysis:
            recommendations.append("Enable data ingestion from all sources for comprehensive analysis")
            return recommendations

        latest = analysis[0]
        risk_level = latest.get("overall_risk_level", "minimal")

        if risk_level == "critical":
            recommendations.append("IMMEDIATE: Critical risk level detected - initiate emergency protocols")
            recommendations.append("Escalate to senior command and activate all monitoring channels")
        elif risk_level == "high":
            recommendations.append("HIGH PRIORITY: Elevated risk detected - increase monitoring frequency")
            recommendations.append("Review all active alerts and prepare contingency plans")
        elif risk_level == "moderate":
            recommendations.append("Continue monitoring with standard protocols")
            recommendations.append("Review patterns for emerging threats")

        critical_alerts = [a for a in alerts if a.get("severity") == "critical"]
        if critical_alerts:
            recommendations.append(f"Address {len(critical_alerts)} critical alert(s) immediately")

        strategies = latest.get("strategies", {})
        predictive = strategies.get("predictive", {})
        if isinstance(predictive, dict) and predictive.get("prediction", {}).get("trend") == "increasing":
            recommendations.append("Risk trend is increasing - preemptive measures recommended")

        if not recommendations:
            recommendations.append("No immediate action required - continue standard monitoring")

        return recommendations


# ---------------------------------------------------------------------------
# DNA Engine - Orchestrates all layers
# ---------------------------------------------------------------------------

class DNAEngine:
    """Orchestrates the four DNA layers for a complete intelligence cycle."""

    def __init__(self, redis: aioredis.Redis, event_store: EventStore):
        self.redis = redis
        self.event_store = event_store
        self.ingestion = IngestionLayer(redis, event_store)
        self.analysis = AnalysisLayer(redis, event_store)
        self.monitoring = MonitoringLayer(redis, event_store)
        self.reports = ReportsLayer(redis, event_store)

    async def run_cycle(self, group_id: Optional[str] = None) -> dict[str, Any]:
        """Run a complete intelligence cycle: ingest → analyze → monitor."""
        # Layer 1: Ingestion
        ingestion_result = await self.ingestion.run_full_ingestion()

        # Prepare data for analysis
        analysis_data = self._prepare_analysis_data(ingestion_result)

        # Layer 2: Analysis
        analysis_result = await self.analysis.analyze(analysis_data, group_id)

        # Layer 3: Monitoring
        group = group_id or "default"
        monitoring_result = await self.monitoring.update_state(group, analysis_result)

        return {
            "cycle_id": str(uuid.uuid4()),
            "group_id": group,
            "ingestion": {
                "osint_errors": ingestion_result.get("osint", {}).get("errors", []),
                "missions_errors": ingestion_result.get("missions", {}).get("errors", []),
                "cognitive_errors": ingestion_result.get("cognitive", {}).get("errors", []),
            },
            "analysis": {
                "risk_score": analysis_result.get("overall_risk_score", 0),
                "risk_level": analysis_result.get("overall_risk_level", "unknown"),
            },
            "monitoring": {
                "new_alerts": monitoring_result.get("new_alerts", 0),
            },
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _prepare_analysis_data(ingestion_result: dict) -> dict[str, Any]:
        """Prepare data from ingestion for analysis."""
        osint_raw = ingestion_result.get("osint", {}).get("sources", {}).get("osint", {})
        missions_raw = ingestion_result.get("missions", {}).get("missions", [])
        cognitive_raw = ingestion_result.get("cognitive", {}).get("cognitive", {})

        return {
            "osint": osint_raw if isinstance(osint_raw, dict) else {},
            "missions": missions_raw if isinstance(missions_raw, list) else [],
            "cognitive": cognitive_raw if isinstance(cognitive_raw, dict) else {},
        }

    async def close(self):
        await self.ingestion.close()
