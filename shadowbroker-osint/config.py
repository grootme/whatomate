"""Shadowbroker OSINT Backend Configuration"""

PORT = 8000
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

# HTTP client settings
HTTP_TIMEOUT = 15.0
HTTP_MAX_RETRIES = 2
