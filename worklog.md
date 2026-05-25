---
Task ID: 1
Agent: Main Agent
Task: Fix Shadowbroker crash loop and refactor Hermes Agent to agentic AI architecture

Work Log:
- Fixed broken symlinks in /home/z/my-project/frontend/lib/shadowbroker/ (skills/index.js, tools/index.js)
- Fixed xpending_range ioredis API mismatch in redis-streams.ts with fallback
- Added OPENROUTER_API_KEY and COGNITIVE_URL to Shadowbroker PM2 config via .env.secrets
- Created AgentExecutor (hermes-agent/src/services/agent-executor.ts) - AI-driven prompt decomposition with OpenRouter function calling
- Refactored Hermes Agent index.ts to use AgentExecutor instead of CommandRouter
- Refactored Telegram channel to use plain text instead of HTML (fixes parse errors)
- Updated MCP tools to include agent-level tools and proper function calling format
- Fixed EventBusBridge XADD errors by flattening fields as key-value pairs
- Created .env.secrets for PM2 secrets management
- Removed tracked secret files from git (config.py, .env)
- Pushed all changes to GitHub (grootme/whatomate)

Stage Summary:
- All 7 PM2 services running stable with 0 crash restarts
- Shadowbroker: 45 restarts → 0 (fixed broken symlinks and missing API key)
- Hermes Agent: v0.16.0 with agentic AI architecture
- Agent can understand any prompt, decompose it, and call appropriate tools
- 17 MCP tools exposed, 16 function calling tool definitions
- All changes committed and pushed to GitHub
