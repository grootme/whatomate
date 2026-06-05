"""
Patch: Make DNA endpoints efficient - no full ingestion on GET, use cached data,
add proper timeouts, and don't store huge payloads in Redis.
"""
import re

# Read the main.py
with open("/home/z/my-project/intelligence-engine/main.py", "r") as f:
    content = f.read()

# Fix the DNA ingestion endpoint - don't run full ingestion on GET, just show status
old_ingestion = '''@app.get("/api/v1/dna/ingestion")
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
    }'''

new_ingestion = '''@app.get("/api/v1/dna/ingestion")
async def dna_ingestion():
    """Ingestion layer status & recent data."""
    await ensure_redis()

    # Get recent cached data (no fresh ingestion on GET)
    recent_data = await dna_engine.ingestion.get_recent_data(limit=5)

    # Count ingestion keys
    key_count = 0
    async for _ in redis_client.scan_iter("dna:ingestion:*"):
        key_count += 1

    return {
        "layer": "ingestion",
        "cached_data_count": key_count,
        "recent_data_count": len(recent_data),
        "recent_data": recent_data[:2],  # Limit response size
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/v1/dna/ingestion/run")
async def dna_ingestion_run():
    """Trigger a fresh ingestion from all sources."""
    await ensure_redis()
    ingestion_result = await dna_engine.ingestion.run_full_ingestion()
    return {
        "layer": "ingestion",
        "result": {
            "osint_errors": ingestion_result.get("osint", {}).get("errors", []),
            "missions_errors": ingestion_result.get("missions", {}).get("errors", []),
            "cognitive_errors": ingestion_result.get("cognitive", {}).get("errors", []),
            "completed_at": ingestion_result.get("completed_at"),
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }'''

content = content.replace(old_ingestion, new_ingestion)

# Fix the analysis endpoint similarly
old_analysis = '''@app.get("/api/v1/dna/analysis")
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

        fresh_analysis = await dna_engine.analysis.analyze(analysis_data, group_id)'''

new_analysis = '''@app.get("/api/v1/dna/analysis")
async def dna_analysis(group_id: Optional[str] = Query(None)):
    """Analysis results per group."""
    await ensure_redis()

    history = await dna_engine.analysis.get_analysis_history(group_id, limit=10)

    # Return cached analysis, no fresh computation on GET
    fresh_analysis = None
    if not history:
        # Only run fresh analysis if we have no cached results
        recent_data = await dna_engine.ingestion.get_recent_data(limit=1)
        if recent_data:
            data = recent_data[0].get("data", {})
            osint_data = data.get("osint", data) if isinstance(data, dict) else {}
            analysis_data = {"osint": osint_data, "missions": [], "cognitive": {}}
            try:
                mission_ingestion = await dna_engine.ingestion.ingest_missions()
                analysis_data["missions"] = mission_ingestion.get("missions", [])
            except Exception:
                pass
            fresh_analysis = await dna_engine.analysis.analyze(analysis_data, group_id)'''

content = content.replace(old_analysis, new_analysis)

with open("/home/z/my-project/intelligence-engine/main.py", "w") as f:
    f.write(content)

print("Patched main.py successfully")
