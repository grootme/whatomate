# =============================================================================
# Telethon Service — Docker Build
# =============================================================================
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt . 2>/dev/null || true

RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# Install telethon and fastapi explicitly
RUN pip install --no-cache-dir telethon fastapi uvicorn

# Copy application code
COPY . .

# Create directories for sessions and data
RUN mkdir -p /app/sessions /app/data

EXPOSE 8700

CMD ["python", "server.py"]
