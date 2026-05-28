# =============================================================================
# Hermes Agent — Docker Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ─── Production ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Create data directory
RUN mkdir -p /app/data

EXPOSE 8642

CMD ["node", "--import", "tsx", "src/index.ts"]
