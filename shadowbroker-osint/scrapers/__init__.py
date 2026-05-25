"""Shadowbroker OSINT Scrapers Package"""

from .earthquakes import fetch_earthquakes
from .fires import fetch_fires
from .flights import fetch_flights
from .gdelt import fetch_gdelt
from .news import fetch_news
from .weather import fetch_weather_alerts
from .ships import fetch_ships

__all__ = [
    "fetch_earthquakes",
    "fetch_fires",
    "fetch_flights",
    "fetch_gdelt",
    "fetch_news",
    "fetch_weather_alerts",
    "fetch_ships",
]
