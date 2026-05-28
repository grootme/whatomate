"""Shadowbroker OSINT Backend Configuration"""

import os

PORT = int(os.environ.get("OSINT_PORT", 8000))
CACHE_DURATION = 300  # 5 minutes cache for scraped data
USER_AGENT = "Shadowbroker-OSINT/0.1.0"

# Rate limiting
RATE_LIMIT_REQUESTS = 60
RATE_LIMIT_WINDOW = 60  # seconds

# API endpoints
USGS_EARTHQUAKE_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
NASA_FIRMS_MAP_KEY = os.environ.get("NASA_FIRMS_MAP_KEY", "48f3d852d3a84cf043ad1a08c07c2146")
NASA_FIRMS_URL = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/-180,-90,180,90/1"
OPENSKY_URL = "https://opensky-network.org/api/states/all"
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc?query=war%20conflict&mode=artlist&maxrecords=20&format=json"
NWS_ALERTS_URL = "https://api.weather.gov/alerts?severity=Extreme,Severe"

# RSS feeds
RSS_FEEDS = [
    ("BBC World", "http://feeds.bbci.co.uk/news/world/rss.xml"),
    ("NYT World", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"),
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
]

# Military callsign prefixes
MILITARY_CALLSIGNS = ["RCH", "EVAC", "PANS", "REACH", "DUKE", "NCR", "VIVID", "ASCOT", "CROS", "TITAN", "BART", "SLAY", "QID", "DRGN", "MULE"]

# UAV / Drone callsign prefixes
UAV_CALLSIGN_PREFIXES = ["UAV", "RPA", "DRN", "MQ", "RQ", "GAU", "TUAV"]

# GPS Jamming
GPSJAM_API_URL = "https://gpsjam.org/api/v1/current"
GPSJAM_HTML_URL = "https://gpsjam.org"
GPSJAM_ARCHIVE_URL = "https://gpsjam.org/api/v1/archive"

# FAA NOTAMs
FAA_NOTAM_URL = "https://notams.aim.faa.gov/notamSearch/search"

# ADSBExchange for flight/UAV data (free API)
ADSBEXCHANGE_URL = "https://adsbexchange.com/api/aircraft/v2/lat/30.0/lon/40.0/dist/5000/"

# LiveUAMap — use the Ukraine-specific feed
LIVEUAMAP_JSON_URL = "https://liveuamap.com/export/3613b9e4f7f246e5b5c1c1ee067c4c42"
LIVEUAMAP_HTML_URL = "https://liveuamap.com"
LIVEUAMAP_RSS_URL = "https://liveuamap.com/feed"

# SIGINT sources
MESHTASTIC_API_URL = "https://map.meshverse.com/api/nodes"
MESHTASTIC_ALT_URL = "https://meshmap.net/api/nodes"
APRS_API_URL = "https://api.aprs.fi/api/get"
APRS_API_KEY = os.environ.get("APRS_API_KEY", "")  # Optional: set for higher limits

# OpenSky Network credentials (optional, increases rate limits)
OPENSKY_USERNAME = os.environ.get("OPENSKY_USERNAME", "")
OPENSKY_PASSWORD = os.environ.get("OPENSKY_PASSWORD", "")

# Redis
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))

# HTTP client settings
HTTP_TIMEOUT = 15.0
HTTP_MAX_RETRIES = 2
