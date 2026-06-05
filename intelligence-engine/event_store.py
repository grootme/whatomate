"""
Event Store - Immutable event sourcing for the Intelligence Engine.
All state changes are recorded as events in Redis for audit, replay, and recovery.
"""

import json
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import redis.asyncio as aioredis

EVENT_VERSION = "1.0"


class EventType(str, Enum):
    INGEST = "INGEST"
    ANALYZE = "ANALYZE"
    ALERT = "ALERT"
    REPORT = "REPORT"
    FEEDBACK = "FEEDBACK"
    THRESHOLD_CHANGE = "THRESHOLD_CHANGE"


class Event:
    """Immutable event record."""

    def __init__(
        self,
        event_type: EventType,
        payload: dict[str, Any],
        source: str = "intelligence-engine",
        correlation_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        self.event_id = str(uuid.uuid4())
        self.event_type = event_type
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.source = source
        self.version = EVENT_VERSION
        self.correlation_id = correlation_id or str(uuid.uuid4())
        self.payload = payload
        self.metadata = metadata or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value if isinstance(self.event_type, EventType) else self.event_type,
            "timestamp": self.timestamp,
            "source": self.source,
            "version": self.version,
            "correlation_id": self.correlation_id,
            "payload": self.payload,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Event":
        event = cls.__new__(cls)
        event.event_id = data.get("event_id", str(uuid.uuid4()))
        event.event_type = EventType(data.get("event_type", "INGEST"))
        event.timestamp = data.get("timestamp", datetime.now(timezone.utc).isoformat())
        event.source = data.get("source", "unknown")
        event.version = data.get("version", EVENT_VERSION)
        event.correlation_id = data.get("correlation_id", str(uuid.uuid4()))
        event.payload = data.get("payload", {})
        event.metadata = data.get("metadata", {})
        return event


class EventStore:
    """
    Redis-backed append-only event store.

    Key patterns:
      - Global event log (sorted set by timestamp): events:log
      - Event data by ID: events:data:{event_id}
      - Events by type: events:type:{event_type}
      - Events by source: events:source:{source}
    """

    def __init__(self, redis: aioredis.Redis):
        self.redis = redis

    async def append(self, event: Event) -> str:
        """Append an event to the store. Returns event_id."""
        event_data = json.dumps(event.to_dict())

        pipe = self.redis.pipeline()
        # Store full event data
        pipe.set(f"events:data:{event.event_id}", event_data)
        # Add to global log sorted by timestamp score
        ts_score = datetime.fromisoformat(event.timestamp).timestamp()
        pipe.zadd("events:log", {event.event_id: ts_score})
        # Add to type index
        pipe.sadd(f"events:type:{event.event_type.value}", event.event_id)
        # Add to source index
        pipe.sadd(f"events:source:{event.source}", event.event_id)
        await pipe.execute()

        return event.event_id

    async def get(self, event_id: str) -> Optional[Event]:
        """Retrieve a single event by ID."""
        data = await self.redis.get(f"events:data:{event_id}")
        if data is None:
            return None
        return Event.from_dict(json.loads(data))

    async def query(
        self,
        event_type: Optional[EventType] = None,
        source: Optional[str] = None,
        since: Optional[str] = None,
        until: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Event]:
        """Query events with optional filters."""
        if event_type:
            # Query by type
            event_ids = await self.redis.smembers(f"events:type:{event_type.value}")
            event_ids = [eid.decode() if isinstance(eid, bytes) else eid for eid in event_ids]
            events = []
            for eid in event_ids:
                data = await self.redis.get(f"events:data:{eid}")
                if data:
                    events.append(Event.from_dict(json.loads(data)))
            # Sort by timestamp descending
            events.sort(key=lambda e: e.timestamp, reverse=True)
            return events[offset : offset + limit]

        # Query from global log
        min_score = "-inf"
        max_score = "+inf"
        if since:
            min_score = datetime.fromisoformat(since).timestamp()
        if until:
            max_score = datetime.fromisoformat(until).timestamp()

        event_ids = await self.redis.zrevrangebyscore(
            "events:log", max_score, min_score, start=offset, num=limit
        )
        events = []
        for eid in event_ids:
            eid_str = eid.decode() if isinstance(eid, bytes) else eid
            data = await self.redis.get(f"events:data:{eid_str}")
            if data:
                event = Event.from_dict(json.loads(data))
                if source and event.source != source:
                    continue
                events.append(event)
        return events

    async def replay(self, since: Optional[str] = None, until: Optional[str] = None) -> list[Event]:
        """Replay events in chronological order for state reconstruction."""
        min_score = "-inf"
        max_score = "+inf"
        if since:
            min_score = datetime.fromisoformat(since).timestamp()
        if until:
            max_score = datetime.fromisoformat(until).timestamp()

        event_ids = await self.redis.zrangebyscore("events:log", min_score, max_score)
        events = []
        for eid in event_ids:
            eid_str = eid.decode() if isinstance(eid, bytes) else eid
            data = await self.redis.get(f"events:data:{eid_str}")
            if data:
                events.append(Event.from_dict(json.loads(data)))
        return events

    async def count(self, event_type: Optional[EventType] = None) -> int:
        """Count events, optionally filtered by type."""
        if event_type:
            return await self.redis.scard(f"events:type:{event_type.value}")
        return await self.redis.zcard("events:log")

    async def get_correlation_chain(self, correlation_id: str) -> list[Event]:
        """Get all events in a correlation chain."""
        all_events = await self.query(limit=10000)
        return [e for e in all_events if e.correlation_id == correlation_id]
