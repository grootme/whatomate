/**
 * Cognitive Capital API Server
 * A lightweight knowledge management service for the whatomate ecosystem
 * Powered by Redis (ioredis) instead of SQLite
 *
 * Port: 8645
 * Redis: localhost:6379
 * Storage: Redis hash `cognitive:entries`
 */

import Redis from "ioredis";
import { createServer, IncomingMessage, ServerResponse } from "http";

// ─── Configuration ───────────────────────────────────────────────
const PORT = 8645;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const HASH_KEY = "cognitive:entries";
const INDEX_KEY = "cognitive:index"; // sorted set for ordering
const STATS_KEY = "cognitive:stats";
const COUNTER_KEY = "cognitive:counter";

// ─── Redis Client ────────────────────────────────────────────────
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  lazyConnect: true,
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[Redis] Connected to", REDIS_URL);
});

redis.on("ready", () => {
  console.log("[Redis] Ready for commands");
});

// ─── Types ───────────────────────────────────────────────────────
interface KnowledgeEntry {
  id: string;
  jid: string;
  sender: string;
  content: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface CreateEntryPayload {
  jid: string;
  sender: string;
  content: string;
  category: string;
  tags?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────
function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJSON(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string) {
  sendJSON(res, status, { error: message, status: "error" });
}

function parseUrl(url: string) {
  const [path, queryString] = url.split("?");
  const params = new URLSearchParams(queryString || "");
  return { path, params };
}

async function getRedisStatus(): Promise<string> {
  try {
    const result = await redis.ping();
    return result === "PONG" ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

async function generateId(): Promise<string> {
  const counter = await redis.incr(COUNTER_KEY);
  const timestamp = Date.now().toString(36);
  return `cog_${timestamp}_${counter}`;
}

// ─── Sample Knowledge Data ───────────────────────────────────────
const SAMPLE_ENTRIES: CreateEntryPayload[] = [
  // economic-logistics-finance
  {
    jid: "whatomate@conference.economic-logistics-finance",
    sender: "system",
    content:
      "Global supply chain resilience depends on diversification of shipping routes and strategic inventory buffers. The Suez Canal disruption of 2021 demonstrated cascading effects across manufacturing sectors.",
    category: "economic-logistics-finance",
    tags: ["supply-chain", "logistics", "resilience", "shipping"],
  },
  {
    jid: "whatomate@conference.economic-logistics-finance",
    sender: "system",
    content:
      "Central bank digital currencies (CBDCs) represent a paradigm shift in monetary policy implementation. Over 130 countries are currently exploring or piloting CBDC frameworks.",
    category: "economic-logistics-finance",
    tags: ["CBDC", "monetary-policy", "digital-currency", "fintech"],
  },
  {
    jid: "whatomate@conference.economic-logistics-finance",
    sender: "system",
    content:
      "Trade finance digitization through blockchain-based platforms reduces settlement times from 5-10 days to under 24 hours, with potential annual savings of $20B globally.",
    category: "economic-logistics-finance",
    tags: ["blockchain", "trade-finance", "digitization", "settlement"],
  },
  // geopolitics-security-conflicts
  {
    jid: "whatomate@conference.geopolitics-security-conflicts",
    sender: "system",
    content:
      "Hybrid warfare combines conventional military tactics with cyber attacks, disinformation campaigns, and economic coercion. NATO's 2023 strategic concept formally recognizes hybrid threats as a core challenge.",
    category: "geopolitics-security-conflicts",
    tags: ["hybrid-warfare", "NATO", "cyber-security", "disinformation"],
  },
  {
    jid: "whatomate@conference.geopolitics-security-conflicts",
    sender: "system",
    content:
      "Arctic geopolitical competition intensifies as melting sea ice opens new shipping lanes. Russia, China, and NATO members are increasing military and economic presence in the region.",
    category: "geopolitics-security-conflicts",
    tags: ["arctic", "geopolitics", "shipping-lanes", "military"],
  },
  {
    jid: "whatomate@conference.geopolitics-security-conflicts",
    sender: "system",
    content:
      "Critical infrastructure protection has become a national security priority. The expansion of 5G networks and IoT devices creates new attack surfaces for state-sponsored threat actors.",
    category: "geopolitics-security-conflicts",
    tags: ["infrastructure", "5G", "IoT", "national-security"],
  },
  // science-tech-innovation
  {
    jid: "whatomate@conference.science-tech-innovation",
    sender: "system",
    content:
      "Quantum computing breakthroughs in error correction are approaching the threshold for practical advantage. Google's 2024 Willow chip demonstrated exponential error suppression below a critical threshold.",
    category: "science-tech-innovation",
    tags: ["quantum-computing", "error-correction", "breakthrough", "Google"],
  },
  {
    jid: "whatomate@conference.science-tech-innovation",
    sender: "system",
    content:
      "CRISPR gene editing therapies have moved from lab to clinic. FDA approval of Casgevy for sickle cell disease marks a new era in precision medicine and genetic therapeutics.",
    category: "science-tech-innovation",
    tags: ["CRISPR", "gene-editing", "precision-medicine", "FDA"],
  },
  {
    jid: "whatomate@conference.science-tech-innovation",
    sender: "system",
    content:
      "Large language models (LLMs) are increasingly used for scientific discovery, from protein structure prediction to materials science. AlphaFold and GNoME demonstrate AI-augmented research paradigms.",
    category: "science-tech-innovation",
    tags: ["LLM", "AI", "scientific-discovery", "AlphaFold"],
  },
  // risk-management
  {
    jid: "whatomate@conference.risk-management",
    sender: "system",
    content:
      "Climate risk assessment now integrates physical and transition risks into financial modeling. TCFD frameworks require scenario analysis across 1.5°C, 2°C, and 4°C warming pathways.",
    category: "risk-management",
    tags: ["climate-risk", "TCFD", "scenario-analysis", "financial-modeling"],
  },
  {
    jid: "whatomate@conference.risk-management",
    sender: "system",
    content:
      "Operational resilience frameworks (Basel III, DORA) mandate that financial institutions map critical business services, set impact tolerances, and test recovery capabilities under extreme scenarios.",
    category: "risk-management",
    tags: ["operational-resilience", "Basel-III", "DORA", "regulation"],
  },
  {
    jid: "whatomate@conference.risk-management",
    sender: "system",
    content:
      "Supply chain risk management leverages network analysis and real-time monitoring to identify concentration risks, single points of failure, and cascading disruption propagation paths.",
    category: "risk-management",
    tags: ["supply-chain", "network-analysis", "concentration-risk", "monitoring"],
  },
];

// ─── Initialization ──────────────────────────────────────────────
async function initializeSampleData() {
  const exists = await redis.exists(HASH_KEY);
  if (exists) {
    console.log("[Init] Sample data already exists, skipping initialization");
    return;
  }

  console.log("[Init] Seeding sample knowledge entries...");

  for (const entry of SAMPLE_ENTRIES) {
    const id = await generateId();
    const now = new Date().toISOString();
    const record: KnowledgeEntry = {
      id,
      jid: entry.jid,
      sender: entry.sender,
      content: entry.content,
      category: entry.category,
      tags: entry.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    await redis.hset(HASH_KEY, id, JSON.stringify(record));
    await redis.zadd(INDEX_KEY, Date.now(), id);
  }

  console.log(`[Init] Seeded ${SAMPLE_ENTRIES.length} sample entries`);
}

// ─── Route Handlers ──────────────────────────────────────────────

async function handleHealth(_req: IncomingMessage, res: ServerResponse) {
  const redisStatus = await getRedisStatus();
  const totalEntries = await redis.hlen(HASH_KEY);

  sendJSON(res, 200, {
    status: "ok",
    redis: redisStatus,
    service: "cognitive-capital-api",
    version: "1.0.0",
    entries: totalEntries,
    timestamp: new Date().toISOString(),
  });
}

async function handleSearch(req: IncomingMessage, res: ServerResponse) {
  const { params } = parseUrl(req.url || "");
  const query = params.get("q") || "";
  const category = params.get("category") || "";

  if (!query && !category) {
    sendError(res, 400, "Search requires 'q' or 'category' parameter");
    return;
  }

  try {
    const allEntries = await redis.hvals(HASH_KEY);
    let results: KnowledgeEntry[] = allEntries.map((e) => JSON.parse(e) as KnowledgeEntry);

    // Filter by keyword
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (entry) =>
          entry.content.toLowerCase().includes(q) ||
          entry.tags.some((t) => t.toLowerCase().includes(q)) ||
          entry.sender.toLowerCase().includes(q) ||
          entry.category.toLowerCase().includes(q)
      );
    }

    // Filter by category
    if (category) {
      const cat = category.toLowerCase();
      results = results.filter((entry) => entry.category.toLowerCase().includes(cat));
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    sendJSON(res, 200, {
      status: "ok",
      query,
      category: category || undefined,
      count: results.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    sendError(res, 500, message);
  }
}

async function handleCreateEntry(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = await parseBody<CreateEntryPayload>(req);

    // Validation
    if (!payload.jid) {
      sendError(res, 400, "Missing required field: jid");
      return;
    }
    if (!payload.sender) {
      sendError(res, 400, "Missing required field: sender");
      return;
    }
    if (!payload.content) {
      sendError(res, 400, "Missing required field: content");
      return;
    }
    if (!payload.category) {
      sendError(res, 400, "Missing required field: category");
      return;
    }

    // Validate category belongs to a mission domain
    const validCategories = [
      "economic-logistics-finance",
      "geopolitics-security-conflicts",
      "science-tech-innovation",
      "risk-management",
    ];
    if (!validCategories.includes(payload.category)) {
      sendError(res, 400, `Invalid category. Must be one of: ${validCategories.join(", ")}`);
      return;
    }

    const id = await generateId();
    const now = new Date().toISOString();

    const entry: KnowledgeEntry = {
      id,
      jid: payload.jid,
      sender: payload.sender,
      content: payload.content,
      category: payload.category,
      tags: payload.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    await redis.hset(HASH_KEY, id, JSON.stringify(entry));
    await redis.zadd(INDEX_KEY, Date.now(), id);

    sendJSON(res, 201, {
      status: "created",
      entry,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create entry";
    sendError(res, 500, message);
  }
}

async function handleListEntries(req: IncomingMessage, res: ServerResponse) {
  const { params } = parseUrl(req.url || "");
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20", 10)));
  const category = params.get("category") || "";

  try {
    let allEntries = await redis.hvals(HASH_KEY);
    let entries: KnowledgeEntry[] = allEntries.map((e) => JSON.parse(e) as KnowledgeEntry);

    // Filter by category if provided
    if (category) {
      const cat = category.toLowerCase();
      entries = entries.filter((entry) => entry.category.toLowerCase() === cat);
    }

    // Sort by creation date (newest first)
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = entries.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginated = entries.slice(start, start + limit);

    sendJSON(res, 200, {
      status: "ok",
      page,
      limit,
      total,
      totalPages,
      results: paginated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list entries";
    sendError(res, 500, message);
  }
}

async function handleStats(_req: IncomingMessage, res: ServerResponse) {
  try {
    const allEntries = await redis.hvals(HASH_KEY);
    const entries: KnowledgeEntry[] = allEntries.map((e) => JSON.parse(e) as KnowledgeEntry);

    // Category breakdown
    const byCategory: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let totalContentLength = 0;

    for (const entry of entries) {
      // Category count
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;

      // Tag aggregation
      for (const tag of entry.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }

      totalContentLength += entry.content.length;
    }

    // Top tags (sorted by frequency)
    const topTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    // Sender breakdown
    const bySender: Record<string, number> = {};
    for (const entry of entries) {
      bySender[entry.sender] = (bySender[entry.sender] || 0) + 1;
    }

    sendJSON(res, 200, {
      status: "ok",
      totalEntries: entries.length,
      categories: byCategory,
      topTags,
      bySender,
      avgContentLength:
        entries.length > 0 ? Math.round(totalContentLength / entries.length) : 0,
      redisStatus: await getRedisStatus(),
      missionDomains: {
        "economic-logistics-finance": byCategory["economic-logistics-finance"] || 0,
        "geopolitics-security-conflicts": byCategory["geopolitics-security-conflicts"] || 0,
        "science-tech-innovation": byCategory["science-tech-innovation"] || 0,
        "risk-management": byCategory["risk-management"] || 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get stats";
    sendError(res, 500, message);
  }
}

async function handleQuery(req: IncomingMessage, res: ServerResponse) {
  try {
    const payload = await parseBody<{ query: string; category?: string; topK?: number }>(req);

    if (!payload.query) {
      sendError(res, 400, "Missing required field: query");
      return;
    }

    const topK = payload.topK || 5;
    const q = payload.query.toLowerCase();

    // Split query into terms for matching
    const terms = q
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .map((t) => t.toLowerCase());

    const allEntries = await redis.hvals(HASH_KEY);
    let entries: KnowledgeEntry[] = allEntries.map((e) => JSON.parse(e) as KnowledgeEntry);

    // Filter by category if provided
    if (payload.category) {
      entries = entries.filter((entry) => entry.category === payload.category);
    }

    // Score each entry by relevance
    const scored = entries.map((entry) => {
      let score = 0;
      const contentLower = entry.content.toLowerCase();
      const tagsLower = entry.tags.map((t) => t.toLowerCase());

      for (const term of terms) {
        // Content match
        const contentMatches = (contentLower.match(new RegExp(term, "gi")) || []).length;
        score += contentMatches * 2;

        // Tag exact match (higher weight)
        if (tagsLower.some((t) => t.includes(term))) {
          score += 10;
        }

        // Category match
        if (entry.category.toLowerCase().includes(term)) {
          score += 5;
        }
      }

      // Bonus for exact phrase match in content
      if (contentLower.includes(q)) {
        score += 20;
      }

      return { entry, score };
    });

    // Sort by score descending, take top K
    const results = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => ({
        entry: s.entry,
        relevance: s.score,
      }));

    sendJSON(res, 200, {
      status: "ok",
      query: payload.query,
      category: payload.category || "all",
      matchesFound: results.length,
      topK,
      results,
      note: "AI-powered query stub — relevance scoring based on keyword matching. Full semantic search pending LLM integration.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    sendError(res, 500, message);
  }
}

// ─── Router ──────────────────────────────────────────────────────
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const { path } = parseUrl(req.url || "/");
  const method = req.method || "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const startTime = Date.now();

  try {
    // Route matching
    if (path === "/health" && method === "GET") {
      await handleHealth(req, res);
    } else if (path === "/api/search" && method === "GET") {
      await handleSearch(req, res);
    } else if (path === "/api/entries" && method === "POST") {
      await handleCreateEntry(req, res);
    } else if (path === "/api/entries" && method === "GET") {
      await handleListEntries(req, res);
    } else if (path === "/api/stats" && method === "GET") {
      await handleStats(req, res);
    } else if (path === "/api/query" && method === "POST") {
      await handleQuery(req, res);
    } else {
      sendJSON(res, 404, {
        error: "Not Found",
        status: "error",
        availableEndpoints: [
          "GET  /health",
          "GET  /api/search?q=keyword",
          "POST /api/entries",
          "GET  /api/entries",
          "GET  /api/stats",
          "POST /api/query",
        ],
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error(`[Error] ${method} ${path}:`, message);
    sendError(res, 500, message);
  }

  const duration = Date.now() - startTime;
  console.log(`${method} ${path} → ${res.statusCode} (${duration}ms)`);
}

// ─── Server Bootstrap ────────────────────────────────────────────
async function start() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     Cognitive Capital API Server v1.0.0          ║");
  console.log("║     Part of the whatomate ecosystem              ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log();

  // Connect to Redis
  try {
    await redis.connect();
    console.log("[Redis] Connection established");
  } catch (err) {
    console.error("[Redis] Failed to connect:", err);
    console.error("[Redis] Server will start but Redis operations will fail");
  }

  // Initialize sample data
  try {
    await initializeSampleData();
  } catch (err) {
    console.error("[Init] Failed to seed data:", err);
  }

  // Create HTTP server
  const server = createServer(handleRequest);

  server.listen(PORT, () => {
    console.log();
    console.log(`[Server] Listening on port ${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    console.log(`[Server] API endpoints:`);
    console.log(`  GET  /health           - Service health & Redis status`);
    console.log(`  GET  /api/search?q=kw  - Search knowledge entries`);
    console.log(`  POST /api/entries      - Create knowledge entry`);
    console.log(`  GET  /api/entries      - List entries (paginated)`);
    console.log(`  GET  /api/stats        - Knowledge base statistics`);
    console.log(`  POST /api/query        - AI-powered query (stub)`);
    console.log();
    console.log("[Server] Ready for requests ✓");
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[Server] Shutting down gracefully...");
    server.close();
    await redis.quit();
    console.log("[Server] Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Start the server
start().catch((err) => {
  console.error("[Fatal] Failed to start server:", err);
  process.exit(1);
});
