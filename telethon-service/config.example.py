"""
Telethon Service Configuration
Copy this to config.py and fill in your credentials.
"""

# Telegram User API credentials (from my.telegram.org)
API_ID = 0  # Your API ID
API_HASH = ''  # Your API Hash
PHONE_NUMBER = ''  # Your phone number with country code

# Pre-authenticated session string (from previous login)
SESSION_STRING = ''  # Leave empty for first-time login

# Service configuration
SERVICE_PORT = 8700
SERVICE_HOST = '0.0.0.0'

# Integration endpoints
HERMES_URL = 'http://localhost:8642'
SHADOWBROKER_URL = 'http://localhost:8660'
COGNITIVE_URL = 'http://localhost:8645'
DEERFLOW_URL = 'http://localhost:8000'

# Telegram Bot (for sending responses)
TELEGRAM_BOT_TOKEN = ''  # Your bot token
TELEGRAM_CHAT_ID = ''  # Your chat ID
