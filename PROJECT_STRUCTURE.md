# Whatomate Project Structure

This document describes the organization of the Whatomate codebase after the reorganization performed on 2026-03-04.

## Top-Level Directory Layout

```
/home/z/my-project/
├── cmd/                          # Go application entrypoints
│   ├── whatomate/main.go         # Main server/worker binary
│   └── qrpair-test/main.go      # QR pair manual test tool
├── internal/                     # Go internal packages (not importable externally)
│   ├── config/                   # Configuration loading
│   ├── contactutil/              # Contact utility functions
│   ├── crypto/                   # Encryption/hashing utilities
│   ├── database/                 # PostgreSQL & Redis connections
│   ├── frontend/                 # Embedded frontend (Go embed)
│   ├── handlers/                 # HTTP request handlers (core business logic)
│   ├── middleware/                # HTTP middleware (auth, CORS, security)
│   ├── models/                   # Database models & GORM definitions
│   ├── queue/                    # Redis job queue
│   ├── templateutil/             # Template processing utilities
│   ├── websocket/                # WebSocket hub & client management
│   └── worker/                   # Background worker process
├── pkg/                          # Go public packages
│   └── whatsapp/                 # WhatsApp client adapters (Meta + whatsmeow)
├── test/                         # Go test utilities & fixtures
├── frontend/                     # Vue.js 3 frontend (shadcn-vue)
│   ├── src/                      # Vue source code
│   ├── e2e/                      # Playwright end-to-end tests
│   ├── lib/                      # Shared libraries (Redis streams, shadowbroker)
│   ├── cognitive-api-server.ts   # Cognitive Capital API server
│   └── ...
├── src/                          # Next.js dashboard app
│   ├── app/                      # Next.js App Router pages & API routes
│   ├── components/               # React components (shadcn/ui)
│   └── ...
├── hermes-agent/                 # Hermes AI agent service
│   ├── src/                      # Agent source (tools, skills, channels)
│   ├── whatsapp-bridge/          # Baileys WhatsApp bridge
│   └── ...
├── shadowbroker-osint/           # Shadowbroker OSINT scraping service
│   ├── scrapers/                 # Data scrapers (flights, weather, news, etc.)
│   ├── main.py                   # Service entrypoint
│   └── ...
├── telethon-service/             # Telegram integration service
├── mcp/                          # Model Context Protocol server
├── docs/                         # Astro documentation site
├── prisma/                       # Prisma schema (used by Next.js dashboard)
├── download/                     # Generated report outputs (PDFs, charts, HTML)
├── agent-ctx/                    # AI agent task context files
│
├── scripts/                      # All operational scripts
│   ├── services/                 # Service startup scripts
│   │   ├── start-all-services.sh
│   │   ├── start-backend.sh      # Go backend starter
│   │   ├── start-integration.sh  # Full platform integration startup
│   │   ├── start-whatomate.sh    # Backend + frontend starter
│   │   ├── services.sh           # Service manager (start/stop/status)
│   │   ├── dev.sh                # Development mode (Cognitive + Bridge + Vite)
│   │   └── test-qr-pair.sh       # QR pair test script
│   ├── bridge/                   # WhatsApp bridge scripts
│   │   ├── run-bridge.sh         # Bridge runner
│   │   └── keep-bridge-alive.sh  # Bridge auto-restart wrapper
│   └── reports/                  # Report generation scripts
│       ├── generate_report.py
│       ├── generate_intelligence_report.py
│       └── generate_charts.py
│
├── infrastructure/               # Infrastructure & deployment config
│   ├── docker/                   # Docker build files
│   │   ├── Dockerfile
│   │   ├── Dockerfile.goreleaser
│   │   └── docker-compose.yml
│   ├── Caddyfile                 # Caddy reverse proxy config
│   └── ecosystem.config.cjs      # PM2 process manager config
│
├── skills/                       # 58 AI skills (do not reorganize)
├── examples/                     # Example code snippets
│
├── go.mod / go.sum               # Go module definition (root-level = canonical)
├── Makefile                      # Go build targets
├── config.example.toml           # Example configuration
├── package.json                  # Next.js dashboard package
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
├── worklog.md                    # Development worklog
└── README.md                     # Project documentation
```

## Key Design Decisions

### Go Backend: Root-Level is Canonical
The Go backend code (`cmd/`, `internal/`, `pkg/`, `go.mod`, `go.sum`, `Makefile`) lives at the project root. The previous `backend/` directory was a divergent duplicate (105 files differed) and has been removed. All service startup scripts now reference the root-level Go code.

### Scripts Organization
All shell scripts and generation scripts have been moved from the root level to `scripts/`:
- **scripts/services/**: Service lifecycle scripts (start, stop, dev mode)
- **scripts/bridge/**: WhatsApp bridge management
- **scripts/reports/**: Python report generation scripts (also remain in download/ for output)

### Infrastructure Consolidation
Docker, Caddy, and PM2 configuration moved to `infrastructure/`:
- **infrastructure/docker/**: Docker build and compose files
- **infrastructure/Caddyfile**: Reverse proxy configuration
- **infrastructure/ecosystem.config.cjs**: PM2 process manager

### Cleanup Performed
1. **Removed `backend/`** - Divergent duplicate of root-level Go code (preserved `cmd/qrpair-test/` and `scripts/test-qr-pair.sh`)
2. **Removed `skills/ui-ux-pro-max/data/`** - Identical duplicate of `skills/ui-ux-pro-max/assets/data/` (25 CSV files)
3. **Removed `mini-services/`** - Only contained an empty `shadowbroker-osint/package.json` with no actual code (the real code is at root-level `shadowbroker-osint/`)

## Service Architecture

| Service | Port | Directory | Technology |
|---------|------|-----------|------------|
| Go Backend | 8080 | Root (`cmd/whatomate/`) | Go + Fastglue |
| Vue Frontend | 3000 | `frontend/` | Vue 3 + Vite + shadcn-vue |
| Next.js Dashboard | 3000* | `src/` (root) | Next.js + React + shadcn/ui |
| WhatsApp Bridge | 3001 | `hermes-agent/whatsapp-bridge/` | Baileys (Node.js) |
| Cognitive API | 8645 | `frontend/cognitive-api-server.ts` | TypeScript |
| Hermes Agent | 8642 | `hermes-agent/` | TypeScript |
| Shadowbroker OSINT | 8660 | `shadowbroker-osint/` | Python |
| MCP Server | - | `mcp/` | TypeScript |
| Docs Site | - | `docs/` | Astro |

*Note: Vue frontend and Next.js dashboard share port 3000 depending on which is running.

## Quick Start

```bash
# Development mode (Vue frontend + Bridge + Cognitive)
bash scripts/services/dev.sh

# Start backend only
bash scripts/services/start-backend.sh

# Start everything (full integration)
bash scripts/services/start-integration.sh

# Start backend + Vue frontend
bash scripts/services/start-whatomate.sh
```
