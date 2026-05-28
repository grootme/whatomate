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
NASA_FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/OPEN_KEY/VIIRS_SNPP_NRT/0,0,180,90/1"
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

# FAA NOTAMs
FAA_NOTAM_URL = "https://notams.aim.faa.gov/notamSearch/search"

# LiveUAMap
LIVEUAMAP_JSON_URL = "https://liveuamap.com/export/3613b9e4f7f246e5b5c1c1ee067c4c42"
LIVEUAMAP_HTML_URL = "https://liveuamap.com"

# SIGINT sources
MESHTASTIC_API_URL = "https://map.meshverse.com/api/nodes"
APRS_API_URL = "https://api.aprs.fi/api/get"
APRS_API_KEY = ""  # Optional: set to your APRS.fi API key for higher limits

# Redis
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))

# HTTP client settings
HTTP_TIMEOUT = 15.0
HTTP_MAX_RETRIES = 2
