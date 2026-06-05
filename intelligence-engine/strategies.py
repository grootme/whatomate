"""
Six Decision Strategies for the Intelligence Engine.
All strategies process REAL data from connected services (OSINT, Agent Missions, etc.).
"""

import math
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from collections import defaultdict

import redis.asyncio as aioredis

logger = logging.getLogger("intelligence-engine.strategies")


# ---------------------------------------------------------------------------
# Threshold configuration helpers
# ---------------------------------------------------------------------------

DEFAULT_THRESHOLDS: dict[str, dict[str, float]] = {
    "earthquake": {"low": 3.0, "moderate": 5.0, "high": 7.0, "critical": 9.0},
    "fire": {"low": 50, "moderate": 200, "high": 500, "critical": 1000},
    "flight": {"low": 10, "moderate": 50, "high": 100, "critical": 200},
    "ship": {"low": 5, "moderate": 20, "high": 50, "critical": 100},
    "sigint": {"low": 1, "moderate": 5, "high": 10, "critical": 20},
    "news": {"low": 5, "moderate": 20, "high": 50, "critical": 100},
    "default": {"low": 10, "moderate": 50, "high": 80, "critical": 95},
}

SEVERITY_ORDER = ["low", "moderate", "high", "critical"]


def classify_severity(value: float, thresholds: dict[str, float]) -> str:
    """Classify a value into a severity level based on thresholds."""
    for level in SEVERITY_ORDER:
        if value < thresholds.get(level, 999):
            return level if level != "low" else "low"
    return "critical"


def get_thresholds_for_category(category: str) -> dict[str, float]:
    """Get thresholds for a given data category."""
    return DEFAULT_THRESHOLDS.get(category, DEFAULT_THRESHOLDS["default"])


# ---------------------------------------------------------------------------
# Base Strategy
# ---------------------------------------------------------------------------

class BaseStrategy(ABC):
    """Abstract base for all decision strategies."""

    name: str = "base"

    def __init__(self, redis: aioredis.Redis):
        self.redis = redis

    @abstractmethod
    async def execute(self, data: dict[str, Any], context: Optional[dict] = None) -> dict[str, Any]:
        """Execute the strategy on the given data. Must return a result dict."""
        ...

    async def get_config(self) -> dict[str, Any]:
        """Retrieve stored config from Redis."""
        raw = await self.redis.get(f"strategy:config:{self.name}")
        if raw:
            import json
            return json.loads(raw)
        return {}

    async def save_config(self, config: dict[str, Any]) -> None:
        """Persist config to Redis."""
        import json
        await self.redis.set(f"strategy:config:{self.name}", json.dumps(config))


# ---------------------------------------------------------------------------
# 1. Threshold Strategy
# ---------------------------------------------------------------------------

class ThresholdStrategy(BaseStrategy):
    """
    Compare data points against configurable thresholds (low/moderate/high/critical).
    Return alerts when thresholds are exceeded.
    """

    name = "threshold"

    async def execute(self, data: dict[str, Any], context: Optional[dict] = None) -> dict[str, Any]:
        context = context or {}
        alerts: list[dict[str, Any]] = []
        summary: dict[str, int] = {"low": 0, "moderate": 0, "high": 0, "critical": 0}

        # Merge stored config thresholds with defaults
        stored_config = await self.get_config()
        custom_thresholds = stored_config.get("thresholds", {})

        # Process OSINT data categories
        osint_data = data.get("osint", {})
        for category, items in osint_data.items():
            if not isinstance(items, list):
                continue
            thresholds = custom_thresholds.get(category, get_thresholds_for_category(category))

            for item in items:
                if not isinstance(item, dict):
                    continue
                # Determine the metric value based on category
                value = self._extract_metric(category, item)
                if value is None:
                    continue

                severity = classify_severity(value, thresholds)
                summary[severity] += 1

                if severity in ("moderate", "high", "critical"):
                    alerts.append({
                        "category": category,
                        "severity": severity,
                        "value": value,
                        "threshold": thresholds.get(severity, 0),
                        "data_point": item,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

        # Process mission data
        missions = data.get("missions", [])
        if isinstance(missions, list):
            for mission in missions:
                if not isinstance(mission, dict):
                    continue
                risk = mission.get("risk_level") or mission.get("risk", 0)
                if isinstance(risk, str):
                    if risk.lower() in ("high", "critical"):
                        alerts.append({
                            "category": "mission",
                            "severity": risk.lower(),
                            "value": risk,
                            "data_point": mission,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                        summary[risk.lower()] += 1
                elif isinstance(risk, (int, float)):
                    thresholds = custom_thresholds.get("mission", get_thresholds_for_category("default"))
                    severity = classify_severity(risk, thresholds)
                    summary[severity] += 1
                    if severity in ("moderate", "high", "critical"):
                        alerts.append({
                            "category": "mission",
                            "severity": severity,
                            "value": risk,
                            "threshold": thresholds.get(severity, 0),
                            "data_point": mission,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

        return {
            "strategy": self.name,
            "alerts": alerts,
            "summary": summary,
            "total_alerts": len(alerts),
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _extract_metric(category: str, item: dict) -> Optional[float]:
        """Extract a numeric metric from a data item based on category."""
        if category == "earthquake":
            for key in ("magnitude", "mag", "ml", "intensity"):
                val = item.get(key)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        pass
        elif category == "fire":
            for key in ("frp", "brightness", "confidence", "area", "count"):
                val = item.get(key)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        pass
        elif category in ("flight", "flights"):
            return float(len(item)) if isinstance(item, dict) else None
        elif category in ("ship", "ships", "vessels"):
            for key in ("speed", "course", "count"):
                val = item.get(key)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        pass
        elif category == "sigint":
            for key in ("signal_strength", "frequency", "count"):
                val = item.get(key)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        pass
        elif category == "news":
            for key in ("sentiment_score", "urgency", "relevance"):
                val = item.get(key)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        pass
        # Generic fallback
        for key in ("value", "metric", "score", "level", "count"):
            val = item.get(key)
            if val is not None:
                try:
                    return float(val)
                except (ValueError, TypeError):
                    pass
        return None


# ---------------------------------------------------------------------------
# 2. Pattern Strategy
# ---------------------------------------------------------------------------

class PatternStrategy(BaseStrategy):
    """
    Detect patterns in time-series data:
    - frequency spikes
    - consecutive events
    - geographic clustering
    - temporal patterns
    """

    name = "pattern"

    async def execute(self, data: dict[str, Any], context: Optional[dict] = None) -> dict[str, Any]:
        context = context or {}
        patterns: list[dict[str, Any]] = []

        osint_data = data.get("osint", {})
        for category, items in osint_data.items():
            if not isinstance(items, list) or len(items) == 0:
                continue

            # 1. Frequency spike detection
            freq_pattern = self._detect_frequency_spike(category, items)
            if freq_pattern:
                patterns.append(freq_pattern)

            # 2. Consecutive event detection
            consec_pattern = self._detect_consecutive_events(category, items)
            if consec_pattern:
                patterns.append(consec_pattern)

            # 3. Geographic clustering
            geo_pattern = self._detect_geographic_clustering(category, items)
            if geo_pattern:
                patterns.append(geo_pattern)

            # 4. Temporal patterns
            temporal_pattern = self._detect_temporal_pattern(category, items)
            if temporal_pattern:
                patterns.append(temporal_pattern)

        # Cross-source pattern detection
        cross_pattern = self._detect_cross_source_patterns(data)
        if cross_pattern:
            patterns.append(cross_pattern)

        return {
            "strategy": self.name,
            "patterns_detected": len(patterns),
            "patterns": patterns,
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

    def _detect_frequency_spike(self, category: str, items: list[dict]) -> Optional[dict]:
        """Detect if event frequency exceeds normal bounds."""
        if len(items) < 3:
            return None

        # Group items by time bucket (hour)
        hourly_counts: dict[str, int] = defaultdict(int)
        for item in items:
            ts = item.get("timestamp") or item.get("time") or item.get("date")
            if ts:
                try:
                    if isinstance(ts, str):
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        bucket = dt.strftime("%Y-%m-%dT%H")
                    else:
                        bucket = str(ts)[:13]
                    hourly_counts[bucket] += 1
                except (ValueError, TypeError):
                    hourly_counts["unknown"] += 1
            else:
                hourly_counts["no_timestamp"] += 1

        if not hourly_counts:
            return None

        counts = list(hourly_counts.values())
        if len(counts) < 2:
            return None

        mean_count = sum(counts) / len(counts)
        if mean_count == 0:
            return None

        max_count = max(counts)
        spike_ratio = max_count / mean_count

        if spike_ratio >= 2.0:
            return {
                "pattern_type": "frequency_spike",
                "category": category,
                "spike_ratio": round(spike_ratio, 2),
                "mean_frequency": round(mean_count, 2),
                "max_frequency": max_count,
                "description": f"Frequency spike in {category}: {spike_ratio:.1f}x above average",
            }
        return None

    def _detect_consecutive_events(self, category: str, items: list[dict]) -> Optional[dict]:
        """Detect sequences of consecutive similar events."""
        if len(items) < 3:
            return None

        # Check for consecutive events with similar properties
        consecutive_count = 1
        max_consecutive = 1
        prev_item = None

        for item in items:
            if prev_item is not None:
                # Check similarity based on category
                similar = self._items_similar(category, prev_item, item)
                if similar:
                    consecutive_count += 1
                    max_consecutive = max(max_consecutive, consecutive_count)
                else:
                    consecutive_count = 1
            prev_item = item

        if max_consecutive >= 3:
            return {
                "pattern_type": "consecutive_events",
                "category": category,
                "consecutive_count": max_consecutive,
                "description": f"{max_consecutive} consecutive similar {category} events detected",
            }
        return None

    def _detect_geographic_clustering(self, category: str, items: list[dict]) -> Optional[dict]:
        """Detect geographic clustering of events."""
        coords = []
        for item in items:
            lat = item.get("latitude") or item.get("lat")
            lon = item.get("longitude") or item.get("lon") or item.get("lng")
            if lat is not None and lon is not None:
                try:
                    coords.append((float(lat), float(lon)))
                except (ValueError, TypeError):
                    pass

        if len(coords) < 3:
            return None

        # Simple clustering: find groups within ~1 degree (~111km)
        clusters: list[list[int]] = []
        assigned: set[int] = set()

        for i, (lat1, lon1) in enumerate(coords):
            if i in assigned:
                continue
            cluster = [i]
            assigned.add(i)
            for j, (lat2, lon2) in enumerate(coords):
                if j in assigned:
                    continue
                dist = math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2)
                if dist < 1.0:
                    cluster.append(j)
                    assigned.add(j)
            if len(cluster) >= 3:
                clusters.append(cluster)

        if clusters:
            return {
                "pattern_type": "geographic_clustering",
                "category": category,
                "cluster_count": len(clusters),
                "largest_cluster": max(len(c) for c in clusters),
                "description": f"{len(clusters)} geographic cluster(s) in {category}, largest with {max(len(c) for c in clusters)} events",
            }
        return None

    def _detect_temporal_pattern(self, category: str, items: list[dict]) -> Optional[dict]:
        """Detect temporal patterns (e.g., events clustering at certain times of day)."""
        hour_counts: dict[int, int] = defaultdict(int)
        for item in items:
            ts = item.get("timestamp") or item.get("time") or item.get("date")
            if ts:
                try:
                    if isinstance(ts, str):
                        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                        hour_counts[dt.hour] += 1
                except (ValueError, TypeError):
                    pass

        if len(hour_counts) < 3:
            return None

        counts = list(hour_counts.values())
        mean_count = sum(counts) / len(counts)
        if mean_count == 0:
            return None

        peak_hours = [h for h, c in hour_counts.items() if c > mean_count * 1.5]
        if len(peak_hours) >= 1 and len(peak_hours) < len(hour_counts) // 2:
            return {
                "pattern_type": "temporal_pattern",
                "category": category,
                "peak_hours": peak_hours,
                "peak_counts": {str(h): hour_counts[h] for h in peak_hours},
                "mean_per_hour": round(mean_count, 2),
                "description": f"{category} events cluster during hours: {peak_hours}",
            }
        return None

    def _detect_cross_source_patterns(self, data: dict[str, Any]) -> Optional[dict]:
        """Detect correlations between different data sources."""
        osint_data = data.get("osint", {})
        categories_with_data = [k for k, v in osint_data.items() if isinstance(v, list) and len(v) > 0]

        # Check for geographic overlap between categories
        category_coords: dict[str, list[tuple[float, float]]] = {}
        for cat in categories_with_data:
            coords = []
            for item in osint_data[cat]:
                lat = item.get("latitude") or item.get("lat")
                lon = item.get("longitude") or item.get("lon") or item.get("lng")
                if lat is not None and lon is not None:
                    try:
                        coords.append((float(lat), float(lon)))
                    except (ValueError, TypeError):
                        pass
            if coords:
                category_coords[cat] = coords

        # Find overlapping regions
        overlaps: list[dict] = []
        cat_list = list(category_coords.keys())
        for i in range(len(cat_list)):
            for j in range(i + 1, len(cat_list)):
                cat_a, cat_b = cat_list[i], cat_list[j]
                overlap_count = 0
                for lat1, lon1 in category_coords[cat_a]:
                    for lat2, lon2 in category_coords[cat_b]:
                        dist = math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2)
                        if dist < 2.0:
                            overlap_count += 1
                if overlap_count > 0:
                    overlaps.append({
                        "sources": [cat_a, cat_b],
                        "overlap_count": overlap_count,
                    })

        if overlaps:
            return {
                "pattern_type": "cross_source_correlation",
                "category": "multi",
                "overlaps": overlaps,
                "description": f"Geographic correlation between {len(overlaps)} source pair(s)",
            }
        return None

    @staticmethod
    def _items_similar(category: str, a: dict, b: dict) -> bool:
        """Check if two items are similar based on category-specific criteria."""
        if category == "earthquake":
            try:
                mag_a = float(a.get("magnitude", a.get("mag", 0)))
                mag_b = float(b.get("magnitude", b.get("mag", 0)))
                return abs(mag_a - mag_b) < 1.0
            except (ValueError, TypeError):
                pass
        elif category == "fire":
            try:
                lat_a = float(a.get("latitude", a.get("lat", 0)))
                lon_a = float(a.get("longitude", a.get("lon", 0)))
                lat_b = float(b.get("latitude", b.get("lat", 0)))
                lon_b = float(b.get("longitude", b.get("lon", 0)))
                return math.sqrt((lat_a - lat_b) ** 2 + (lon_a - lon_b) ** 2) < 0.5
            except (ValueError, TypeError):
                pass
        # Generic: same type/category
        return a.get("type") == b.get("type") and a.get("type") is not None


# ---------------------------------------------------------------------------
# 3. Risk Scoring Strategy
# ---------------------------------------------------------------------------

class RiskScoringStrategy(BaseStrategy):
    """
    Score 0-100 with weighted components:
      - Nature (35%): type and inherent danger
      - Volume (25%): number of occurrences
      - Connections (20%): correlation between sources
      - OSINT (15%): corroboration from open sources
      - Recency (5%): how recent the events are
    """

    name = "risk_scoring"

    WEIGHTS = {
        "nature": 0.35,
        "volume": 0.25,
        "connections": 0.20,
        "osint": 0.15,
        "recency": 0.05,
    }

    # Inherent danger ratings by category (0-100)
    NATURE_SCORES: dict[str, float] = {
        "earthquake": 80,
        "fire": 70,
        "sigint": 85,
        "flight": 40,
        "ship": 30,
        "news": 50,
        "cyber": 75,
        "weather": 60,
        "volcano": 90,
        "tsunami": 95,
        "default": 50,
    }

    async def execute(self, data: dict[str, Any], context: Optional[dict] = None) -> dict[str, Any]:
        context = context or {}
        osint_data = data.get("osint", {})
        missions = data.get("missions", [])

        group_scores: dict[str, dict[str, Any]] = {}

        # Score each OSINT category
        for category, items in osint_data.items():
            if not isinstance(items, list):
                continue

            nature_score = self._compute_nature(category, items)
            volume_score = self._compute_volume(items)
            connections_score = self._compute_connections(category, osint_data)
            osint_score = self._compute_osint_corroboration(category, items)
            recency_score = self._compute_recency(items)

            composite = (
                nature_score * self.WEIGHTS["nature"]
                + volume_score * self.WEIGHTS["volume"]
                + connections_score * self.WEIGHTS["connections"]
                + osint_score * self.WEIGHTS["osint"]
                + recency_score * self.WEIGHTS["recency"]
            )

            group_scores[category] = {
                "composite_score": round(composite, 2),
                "components": {
                    "nature": round(nature_score, 2),
                    "volume": round(volume_score, 2),
                    "connections": round(connections_score, 2),
                    "osint": round(osint_score, 2),
                    "recency": round(recency_score, 2),
                },
                "item_count": len(items),
                "risk_level": self._score_to_level(composite),
            }

        # Score missions
        if isinstance(missions, list) and missions:
            mission_nature = 60.0
            mission_volume = min(100, len(missions) * 10)
            mission_connections = 40.0
            mission_osint = 30.0
            mission_recency = self._compute_recency(
                [m for m in missions if isinstance(m, dict)]
            )

            mission_composite = (
                mission_nature * self.WEIGHTS["nature"]
                + mission_volume * self.WEIGHTS["volume"]
                + mission_connections * self.WEIGHTS["connections"]
                + mission_osint * self.WEIGHTS["osint"]
                + mission_recency * self.WEIGHTS["recency"]
            )
            group_scores["missions"] = {
                "composite_score": round(mission_composite, 2),
                "components": {
                    "nature": round(mission_nature, 2),
                    "volume": round(mission_volume, 2),
                    "connections": round(mission_connections, 2),
                    "osint": round(mission_osint, 2),
                    "recency": round(mission_recency, 2),
                },
                "item_count": len(missions),
                "risk_level": self._score_to_level(mission_composite),
            }

        # Overall composite
        if group_scores:
            overall = sum(s["composite_score"] for s in group_scores.values()) / len(group_scores)
        else:
            overall = 0.0

        return {
            "strategy": self.name,
            "overall_score": round(overall, 2),
            "overall_risk_level": self._score_to_level(overall),
            "group_scores": group_scores,
            "weights": self.WEIGHTS,
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

    def _compute_nature(self, category: str, items: list[dict]) -> float:
        """Inherent danger based on category type and event severity."""
        base = self.NATURE_SCORES.get(category, self.NATURE_SCORES["default"])
        # Adjust based on severity of actual events
        max_severity = 0.0
        for item in items:
            sev = self._item_severity(category, item)
            max_severity = max(max_severity, sev)
        # Blend: 60% base nature + 40% actual severity
        return base * 0.6 + max_severity * 0.4

    def _compute_volume(self, items: list) -> float:
        """Score based on number of occurrences. More events = higher score."""
        count = len(items)
        # Logarithmic scaling: 1→10, 10→52, 50→80, 100→100
        if count == 0:
            return 0.0
        return min(100, 10 + 20 * math.log10(count + 1))

    def _compute_connections(self, category: str, osint_data: dict) -> float:
        """Score based on cross-source correlations."""
        other_categories = [k for k in osint_data if k != category and isinstance(osint_data[k], list) and len(osint_data[k]) > 0]
        # More correlated sources = higher score
        if not other_categories:
            return 10.0
        # Check for geographic overlap
        overlap_count = 0
        cat_coords = self._get_coords(osint_data.get(category, []))
        for other_cat in other_categories:
            other_coords = self._get_coords(osint_data[other_cat])
            for lat1, lon1 in cat_coords:
                for lat2, lon2 in other_coords:
                    if math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) < 5.0:
                        overlap_count += 1
                        break
        connection_ratio = min(1.0, overlap_count / max(1, len(other_categories)))
        return 20 + connection_ratio * 80

    def _compute_osint_corroboration(self, category: str, items: list[dict]) -> float:
        """Score based on OSINT source corroboration."""
        sources = set()
        for item in items:
            src = item.get("source") or item.get("provider") or item.get("agency")
            if src:
                sources.add(str(src))
        # More independent sources = higher corroboration
        if not sources:
            return 20.0
        return min(100, 20 + len(sources) * 15)

    def _compute_recency(self, items: list[dict]) -> float:
        """Score based on how recent the events are."""
        now = datetime.now(timezone.utc)
        recent_count = 0
        for item in items:
            ts = item.get("timestamp") or item.get("time") or item.get("date")
            if ts:
                try:
                    dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                    if (now - dt) < timedelta(hours=24):
                        recent_count += 1
                except (ValueError, TypeError):
                    pass
        if not items:
            return 0.0
        recency_ratio = recent_count / len(items)
        return recency_ratio * 100

    @staticmethod
    def _item_severity(category: str, item: dict) -> float:
        """Get a 0-100 severity for an individual item."""
        if category == "earthquake":
            try:
                mag = float(item.get("magnitude", item.get("mag", 0)))
                return min(100, mag * 10)
            except (ValueError, TypeError):
                return 50.0
        elif category == "fire":
            try:
                frp = float(item.get("frp", item.get("brightness", 0)))
                return min(100, frp / 5)
            except (ValueError, TypeError):
                return 50.0
        return 50.0

    @staticmethod
    def _get_coords(items: list[dict]) -> list[tuple[float, float]]:
        coords = []
        for item in items:
            lat = item.get("latitude") or item.get("lat")
            lon = item.get("longitude") or item.get("lon") or item.get("lng")
            if lat is not None and lon is not None:
                try:
                    coords.append((float(lat), float(lon)))
                except (ValueError, TypeError):
                    pass
        return coords

    @staticmethod
    def _score_to_level(score: float) -> str:
        if score >= 80:
            return "critical"
        elif score >= 60:
            return "high"
        elif score >= 40:
            return "moderate"
        elif score >= 20:
            return "low"
        return "minimal"


# ---------------------------------------------------------------------------
# 4. Multi-Agent Consensus Strategy
# ---------------------------------------------------------------------------

class ConsensusStrategy(BaseStrategy):
    """
    Multi-agent consensus:
      - 4/4 agents agree → auto-execute
      - 3/4 agents agree → auto-execute + notify
      - 2/4 agents agree → human review required
      - 1/4 agent agrees → likely false positive
    """

    name = "consensus"

    AGENT_NAMES = ["threshold_agent", "pattern_agent", "risk_agent", "predictive_agent"]

    async def execute(self, data: dict[str, Any], context: Optional[dict] = None) -> dict[str, Any]:
        context = context or {}

        # Run each sub-strategy to get their "vote"
        threshold = ThresholdStrategy(self.redis)
        pattern = PatternStrategy(self.redis)
        risk = RiskScoringStrategy(self.redis)
        predictive = PredictiveStrategy(self.redis)

        try:
            threshold_result = await threshold.execute(data, context)
        except Exception as e:
            logger.warning(f"Threshold agent failed: {e}")
            threshold_result = {"strategy": "threshold", "error": str(e)}

        try:
            pattern_result = await pattern.execute(data, context)
        except Exception as e:
            logger.warning(f"Pattern agent failed: {e}")
            pattern_result = {"strategy": "pattern", "error": str(e)}

        try:
            risk_result = await risk.execute(data, context)
        except Exception as e:
            logger.warning(f"Risk agent failed: {e}")
            risk_result = {"strategy": "risk_scoring", "error": str(e)}

        try:
            predictive_result = await predictive.execute(data, context)
        except Exception as e:
            logger.warning(f"Predictive agent failed: {e}")
            predictive_result = {"strategy": "predictive", "error": str(e)}

        # Determine each agent's vote
        votes: dict[str, dict[str, Any]] = {}
        votes["threshold_agent"] = self._interpret_threshold_vote(threshold_result)
        votes["pattern_agent"] = self._interpret_pattern_vote(pattern_result)
        votes["risk_agent"] = self._interpret_risk_vote(risk_result)
        votes["predictive_agent"] = self._interpret_predictive_vote(predictive_result)

        # Count agreeing agents (those that flag an issue)
        agreeing = sum(1 for v in votes.values() if v["concern_raised"])
        total = len(votes)

        # Determine action based on consensus
        if agreeing == 4:
            action = "auto_execute"
            confidence = "high"
        elif agreeing == 3:
            action = "auto_execute_notify"
            confidence = "high"
        elif agreeing == 2:
            action = "human_review"
            confidence = "medium"
        elif agreeing == 1:
            action = "likely_false_positive"
            confidence = "low"
        else:
            action = "no_action"
            confidence = "high"

        return {
            "strategy": self.name,
            "consensus": {
                "agreeing_agents": agreeing,
                "total_agents": total,
                "action": action,
                "confidence": confidence,
            },
            "agent_votes": votes,
            "agent_results": {
                "threshold": threshold_result,
                "pattern": pattern_result,
                "risk_scoring": risk_result,
                "predictive": predictive_result,
            },
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _interpret_threshold_vote(result: dict) -> dict[str, Any]:
        """Does the threshold strategy flag concern?"""
        alerts = result.get("total_alerts", 0)
        concern = alerts > 0
        severity = "none"
        if alerts > 0:
            summary = result.get("summary", {})
            if summary.get("critical", 0) > 0:
                severity = "critical"
            elif summary.get("high", 0) > 0:
                severity = "high"
            elif summary.get("moderate", 0) > 0:
                severity = "moderate"
            else:
                severity = "low"
        return {"concern_raised": concern, "severity": severity, "alert_count": alerts}

    @staticmethod
    def _interpret_pattern_vote(result: dict) -> dict[str, Any]:
        """Does the pattern strategy flag concern?"""
        patterns = result.get("patterns_detected", 0)
        concern = patterns > 0
        return {"concern_raised": concern, "pattern_count": patterns, "details": result.get("patterns", [])}

    @staticmethod
    def _interpret_risk_vote(result: dict) -> dict[str, Any]:
        """Does the risk scoring strategy flag concern?"""
        overall = result.get("overall_score", 0)
        concern = overall >= 40
        return {
            "concern_raised": concern,
            "risk_score": overall,
            "risk_level": result.get("overall_risk_level", "minimal"),
        }

    @staticmethod
    def _interpret_predictive_vote(result: dict) -> dict[str, Any]:
        """Does the predictive strategy flag concern?"""
        prediction = result.get("prediction", {})
        trend = prediction.get("trend", "stable")
        predicted_risk = prediction.get("predicted_risk_score", 0)
        concern = trend == "increasing" or predicted_risk >= 50
        return {"concern_raised": concern, "trend": trend, "predicted_risk": predicted_risk}


# ---------------------------------------------------------------------------
# 5. Predictive Strategy
# ---------------------------------------------------------------------------

class PredictiveStrategy(BaseStrategy):
    """
    Use historical data trends to predict future risk levels.
    Simple moving average + trend detection.
    """

    name = "predictive"

    async def execute(self, data: dict[str, Any], context: Optional[dict] = None) -> dict[str, Any]:
        context = context or {}
        osint_data = data.get("osint", {})

        # Load historical scores from Redis
        history = await self._load_history()

        # Compute current overall risk
        risk_strategy = RiskScoringStrategy(self.redis)
        try:
            current_risk_result = await risk_strategy.execute(data, context)
            current_score = current_risk_result.get("overall_score", 0)
        except Exception:
            current_score = 0

        # Store current score in history
        now = datetime.now(timezone.utc)
        history_entry = {"timestamp": now.isoformat(), "score": current_score}
        await self._store_history_entry(history_entry)
        history.append(history_entry)

        # Keep last 24 hours of history
        cutoff = (now - timedelta(hours=24)).isoformat()
        history = [h for h in history if h.get("timestamp", "") >= cutoff]

        # Compute moving average
        scores = [h.get("score", 0) for h in history]
        if scores:
            moving_avg = sum(scores) / len(scores)
        else:
            moving_avg = current_score

        # Detect trend
        trend = self._detect_trend(scores)
        predicted_score = self._predict_next_score(scores, trend)

        # Per-category predictions
        category_predictions = {}
        for category, items in osint_data.items():
            if not isinstance(items, list):
                continue
            cat_history = await self._load_category_history(category)
            cat_entry = {
                "timestamp": now.isoformat(),
                "score": min(100, len(items) * 5),
            }
            await self._store_category_history(category, cat_entry)
            cat_history.append(cat_entry)

            cat_scores = [h.get("score", 0) for h in cat_history[-20:]]
            cat_trend = self._detect_trend(cat_scores)
            cat_predicted = self._predict_next_score(cat_scores, cat_trend)

            category_predictions[category] = {
                "current_items": len(items),
                "trend": cat_trend,
                "predicted_score": round(cat_predicted, 2),
            }

        return {
            "strategy": self.name,
            "prediction": {
                "current_risk_score": round(current_score, 2),
                "moving_average_24h": round(moving_avg, 2),
                "trend": trend,
                "predicted_risk_score": round(predicted_score, 2),
                "confidence": self._trend_confidence(scores),
            },
            "category_predictions": category_predictions,
            "history_depth": len(history),
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

    async def _load_history(self) -> list[dict]:
        """Load risk score history from Redis."""
        import json
        raw = await self.redis.lrange("predictive:history", 0, -1)
        return [json.loads(item) for item in raw]

    async def _store_history_entry(self, entry: dict) -> None:
        """Store a history entry, keeping last 288 entries (24h at 5min intervals)."""
        import json
        pipe = self.redis.pipeline()
        pipe.lpush("predictive:history", json.dumps(entry))
        pipe.ltrim("predictive:history", 0, 287)
        await pipe.execute()

    async def _load_category_history(self, category: str) -> list[dict]:
        """Load category-specific history."""
        import json
        raw = await self.redis.lrange(f"predictive:cat:{category}", 0, -1)
        return [json.loads(item) for item in raw]

    async def _store_category_history(self, category: str, entry: dict) -> None:
        """Store category history entry."""
        import json
        pipe = self.redis.pipeline()
        pipe.lpush(f"predictive:cat:{category}", json.dumps(entry))
        pipe.ltrim(f"predictive:cat:{category}", 0, 47)
        await pipe.execute()

    @staticmethod
    def _detect_trend(scores: list[float]) -> str:
        """Detect trend direction from score series."""
        if len(scores) < 3:
            return "insufficient_data"

        # Simple linear regression slope
        n = len(scores)
        x_mean = (n - 1) / 2
        y_mean = sum(scores) / n

        numerator = sum((i - x_mean) * (scores[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))

        if denominator == 0:
            return "stable"

        slope = numerator / denominator

        # Classify slope
        if slope > 2:
            return "increasing"
        elif slope < -2:
            return "decreasing"
        return "stable"

    @staticmethod
    def _predict_next_score(scores: list[float], trend: str) -> float:
        """Predict next score based on trend and recent values."""
        if not scores:
            return 0.0

        recent = scores[-5:] if len(scores) >= 5 else scores
        recent_avg = sum(recent) / len(recent)

        if trend == "increasing":
            return min(100, recent_avg * 1.1)
        elif trend == "decreasing":
            return max(0, recent_avg * 0.9)
        return recent_avg

    @staticmethod
    def _trend_confidence(scores: list[float]) -> str:
        """Assess confidence in trend prediction."""
        if len(scores) < 5:
            return "low"
        elif len(scores) < 12:
            return "medium"
        return "high"


# ---------------------------------------------------------------------------
# 6. Adaptive Strategy
# ---------------------------------------------------------------------------

class AdaptiveStrategy(BaseStrategy):
    """
    Self-adjusting thresholds based on false positive/negative rates.
    Learning from feedback.
    """

    name = "adaptive"

    async def execute(self, data: dict[str, Any], context: Optional[dict] = None) -> dict[str, Any]:
        context = context or {}

        # Load feedback history
        feedback_history = await self._load_feedback()

        # Load current thresholds
        stored_config = await self.get_config()
        current_thresholds = stored_config.get("thresholds", dict(DEFAULT_THRESHOLDS))

        # Calculate false positive/negative rates
        metrics = self._compute_metrics(feedback_history)

        # Adjust thresholds based on feedback
        adjusted_thresholds = self._adjust_thresholds(current_thresholds, metrics)

        # Save adjusted thresholds
        stored_config["thresholds"] = adjusted_thresholds
        stored_config["metrics"] = metrics
        stored_config["last_adjustment"] = datetime.now(timezone.utc).isoformat()
        await self.save_config(stored_config)

        # Run threshold strategy with adjusted thresholds
        threshold_strategy = ThresholdStrategy(self.redis)
        # Override its config temporarily
        await threshold_strategy.save_config({"thresholds": adjusted_thresholds})
        threshold_result = await threshold_strategy.execute(data, context)

        return {
            "strategy": self.name,
            "metrics": metrics,
            "adjustments": self._compute_adjustments(current_thresholds, adjusted_thresholds),
            "current_thresholds": adjusted_thresholds,
            "threshold_result": threshold_result,
            "feedback_count": len(feedback_history),
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

    async def record_feedback(
        self,
        alert_id: str,
        feedback_type: str,  # "true_positive", "false_positive", "false_negative", "true_negative"
        category: str,
        details: Optional[dict] = None,
    ) -> str:
        """Record feedback on an alert for adaptive learning."""
        import json
        feedback_id = f"fb:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}:{alert_id}"
        entry = {
            "feedback_id": feedback_id,
            "alert_id": alert_id,
            "feedback_type": feedback_type,
            "category": category,
            "details": details or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        pipe = self.redis.pipeline()
        pipe.lpush("adaptive:feedback", json.dumps(entry))
        pipe.ltrim("adaptive:feedback", 0, 999)
        await pipe.execute()
        return feedback_id

    async def _load_feedback(self) -> list[dict]:
        """Load feedback history from Redis."""
        import json
        raw = await self.redis.lrange("adaptive:feedback", 0, -1)
        return [json.loads(item) for item in raw]

    @staticmethod
    def _compute_metrics(feedback: list[dict]) -> dict[str, Any]:
        """Compute false positive/negative rates from feedback."""
        tp = sum(1 for f in feedback if f.get("feedback_type") == "true_positive")
        fp = sum(1 for f in feedback if f.get("feedback_type") == "false_positive")
        fn = sum(1 for f in feedback if f.get("feedback_type") == "false_negative")
        tn = sum(1 for f in feedback if f.get("feedback_type") == "true_negative")
        total = tp + fp + fn + tn

        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        return {
            "total_feedback": total,
            "true_positives": tp,
            "false_positives": fp,
            "false_negatives": fn,
            "true_negatives": tn,
            "false_positive_rate": round(fpr, 4),
            "false_negative_rate": round(fnr, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
        }

    @staticmethod
    def _adjust_thresholds(current: dict[str, dict[str, float]], metrics: dict) -> dict[str, dict[str, float]]:
        """Adjust thresholds based on feedback metrics."""
        adjusted = {}
        fpr = metrics.get("false_positive_rate", 0)
        fnr = metrics.get("false_negative_rate", 0)

        for category, thresholds in current.items():
            adj = dict(thresholds)
            if fpr > 0.3:
                # Too many false positives → raise thresholds (less sensitive)
                for level in SEVERITY_ORDER:
                    adj[level] = adj.get(level, 50) * 1.1
            elif fpr < 0.05 and fnr > 0.2:
                # Too many false negatives → lower thresholds (more sensitive)
                for level in SEVERITY_ORDER:
                    adj[level] = adj.get(level, 50) * 0.9
            adjusted[category] = adj

        return adjusted

    @staticmethod
    def _compute_adjustments(old: dict, new: dict) -> dict[str, str]:
        """Describe what adjustments were made."""
        adjustments = {}
        for cat in new:
            if cat in old:
                for level in SEVERITY_ORDER:
                    old_val = old[cat].get(level, 0)
                    new_val = new[cat].get(level, 0)
                    if abs(new_val - old_val) > 0.01:
                        direction = "raised" if new_val > old_val else "lowered"
                        adjustments[f"{cat}.{level}"] = f"{direction} from {old_val:.1f} to {new_val:.1f}"
        return adjustments


# ---------------------------------------------------------------------------
# Strategy Registry
# ---------------------------------------------------------------------------

STRATEGY_REGISTRY: dict[str, type[BaseStrategy]] = {
    "threshold": ThresholdStrategy,
    "pattern": PatternStrategy,
    "risk_scoring": RiskScoringStrategy,
    "consensus": ConsensusStrategy,
    "predictive": PredictiveStrategy,
    "adaptive": AdaptiveStrategy,
}


def get_strategy(name: str, redis: aioredis.Redis) -> BaseStrategy:
    """Get a strategy instance by name."""
    cls = STRATEGY_REGISTRY.get(name)
    if cls is None:
        raise ValueError(f"Unknown strategy: {name}. Available: {list(STRATEGY_REGISTRY.keys())}")
    return cls(redis)
