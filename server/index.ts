import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { acceptMcpResponses } from "./mcp-accept";
import { pageHandler } from "./pages";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { callerNotes } from "./notes";
import { outreachNotes, refreshOutreach, listOutreach, stopOutreach } from "./outreach";
import { pool, ensureSchema, noteOwnerNetwork, recordPageView, recordServedExample, recordServiceUsage, clearOldToolIo, TOOL_RUN_SQL } from "./db";
import { keyFromReq } from "./auth";
import { loadSecrets } from "./secrets";
import { admitCall, getFreeCallStatus, hashIp, isOwnerKey, paidRouteMiddleware, refundFreeCall } from "./meter";
import { FREE_CALLS_PER_TOOL, FREE_CALLS_RESET, FREE_CALLS_TEXT, priceOf, TOOL_PRICES } from "./pricing";
import { createX402, X402_NETWORK } from "./x402";
import { ownerOverview } from "./owner";
import { ownerCall, ownerCalls } from "./calls";
import { runXPost } from "./x";
import { postManual } from "./x-manual";
import { saveQueueEdit, upcomingQueue } from "./x-edits";
import { currentArgs, mcpDescription, priceText, toolDoc, ToolError, TOOLS, TOOLS_BY_NAME, type ToolContext, type ToolDef } from "./tools";
import { httpError } from "./tools/lib";
import { VERSION } from "./version";
import { openApiDocument } from "./openapi";
import { accuracyReport, accuracyTick, addToQueue } from "./accuracy";

const GATEWAY_WALLET = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";
const PUBLIC_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";

async function startServer() {
  await loadSecrets(["DATABASE_URL", "OWNER_API_KEY", "SOLANA_MAINNET_RPC_URL", "CALLER_HASH_SECRET", "CDP_API_KEY_ID", "CDP_API_KEY_SECRET",
    "X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET", "JUPITER_API_KEY"]);
  await ensureSchema();
  void clearOldToolIo();
  setInterval(() => void clearOldToolIo(), 6 * 60 * 60 * 1000).unref();
  void refreshOutreach();
  setInterval(() => void refreshOutreach(), 30 * 60 * 1000).unref();

  const app = express();
  app.set("trust proxy", 1);
  const PORT = Number(process.env.PORT) || 3000;

  // Cloud Run terminates TLS before requests reach Express; send the policy to HTTPS clients.
  app.use((_req, res, next) => { res.setHeader("Strict-Transport-Security", "max-age=31536000"); next(); });
  app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], exposedHeaders: ["payment-required", "payment-response", "x-free-calls-remaining"] }));
  app.use(express.json({ limit: "256kb" }));

  // Tools were renamed in October 2026 (preflight_transaction became check_tx, and so on). A call by an old name, or a
  // percent-encoded one, becomes a call by the current name with the old input names moved to the new ones, before
  // anything else sees it, so prices, free calls, x402 listings and stats all know each tool by one name.
  const toolCall = (call: any) => {
    if (call?.method !== "tools/call" || typeof call.params?.name !== "string") return call;
    const tool = TOOLS_BY_NAME.get(call.params.name);
    return tool ? { ...call, params: { ...call.params, name: tool.name, arguments: currentArgs(tool, call.params.arguments) } } : call;
  };
  app.use((req, _res, next) => {
    const route = /^\/api\/tools\/([^/?]+)(.*)$/.exec(req.url);
    if (route) {
      let name = route[1];
      try { name = decodeURIComponent(name); } catch { /* unknown name, left for the 404 */ }
      const tool = TOOLS_BY_NAME.get(name);
      // originalUrl too, so x402 names the payment after the current URL and directories list only that one.
      if (tool && route[1] !== tool.name) req.url = req.originalUrl = `/api/tools/${tool.name}${route[2]}`;
      if (tool && req.method === "POST") req.body = currentArgs(tool, req.body);
    }
    if (req.method === "POST" && (req.path === "/mcp" || req.path === "/mcp/messages") && req.body) {
      req.body = Array.isArray(req.body) ? req.body.map(toolCall) : toolCall(req.body);
    }
    next();
  });
  // Old tool pages move to the new ones.
  app.get("/docs/tools/:name", (req, res, next) => {
    const tool = TOOLS_BY_NAME.get(req.params.name);
    return tool && tool.name !== req.params.name ? res.redirect(301, `/docs/tools/${tool.name}`) : next();
  });

  // The transaction a paid HTTP call settled in, from the PAYMENT-RESPONSE header x402 adds to the response.
  const settledTx = (header: unknown): string | null => {
    if (typeof header !== "string" || !header) return null;
    try { const r = decodePaymentResponseHeader(header); return r.success && r.transaction ? r.transaction : null; }
    catch { return null; }
  };

  // Record route-level usage without query strings or raw IPs: a keyed hash of the caller network and the client name,
  // plus the MCP client's own name on initialize and, for tool calls, how the call was admitted and paid, the tool's
  // arguments (never the MCP _meta, which carries the payment) and its result (res.locals.output, set where it runs).
  const trackServiceUsage = (req: any, res: any, next: any) => {
    const pathOnly = String(req.originalUrl || req.url).split("?")[0];
    if (pathOnly.startsWith("/api/analytics/") || pathOnly.startsWith("/api/owner/")) return next();
    const callerHash = req.ip ? hashIp(req.ip) : null;
    const client = String(req.headers["user-agent"] || "").slice(0, 120) || null;
    const info = req.body?.method === "initialize" ? req.body?.params?.clientInfo : null;
    const mcpClient = typeof info?.name === "string" ? `${info.name} ${typeof info.version === "string" ? info.version : ""}`.trim().slice(0, 80) : null;
    res.once("finish", () => {
      const toolName = req.body?.method === "tools/call" ? req.body?.params?.name : null;
      const isMcpMessage = pathOnly === "/mcp" || pathOnly === "/mcp/messages";
      const endpoint = isMcpMessage && typeof toolName === "string" ? `/mcp/tools/${toolName.replace(/[^a-zA-Z0-9_-]/g, "")}` : pathOnly;
      const paymentTx = res.locals.paymentTx ?? settledTx(res.getHeader("payment-response"));
      const isToolCall = req.method === "POST" && (pathOnly.startsWith("/api/tools/") || endpoint.startsWith("/mcp/tools/"));
      const input = !isToolCall ? null : endpoint.startsWith("/mcp/tools/") ? req.body?.params?.arguments : req.body;
      void recordServiceUsage({ endpoint, method: req.method, status: res.statusCode, callerHash, client, mcpClient, via: res.locals.via ?? null, paymentTx,
        input, output: isToolCall ? res.locals.output : null, noteSent: res.locals.noteSent === true });
    });
    next();
  };
  app.use("/api", trackServiceUsage);
  app.use("/mcp", trackServiceUsage);
  app.use("/api", callerNotes);
  app.use("/api", outreachNotes);
  app.use("/mcp", callerNotes);
  app.use("/mcp", outreachNotes);

  const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: "Rate limit reached (120 requests per minute per IP). Retry shortly." } });
  app.use("/api/", limiter);
  app.use("/mcp", limiter);

  const noCache = (_req: any, res: any, next: any) => { res.setHeader("Cache-Control", "no-store"); next(); };

  const connections = {
    "mainnet-beta": new Connection(process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta"), "confirmed"),
    devnet: new Connection(process.env.SOLANA_DEVNET_RPC_URL || clusterApiUrl("devnet"), "confirmed"),
  };
  // The Jupiter key goes only to Jupiter's keyed host, never to any other site a tool fetches.
  const jupiterKeyHeader = (url: string): Record<string, string> =>
    process.env.JUPITER_API_KEY && new URL(url).host === "api.jup.ag" ? { "x-api-key": process.env.JUPITER_API_KEY } : {};
  const ctx: ToolContext = {
    connection: (network) => {
      const conn = connections[network as keyof typeof connections];
      if (!conn) throw new ToolError(400, 'Unsupported network. Use "mainnet-beta" or "devnet".');
      return conn;
    },
    fetchJson: async (url, timeoutMs = 8000) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", ...jupiterKeyHeader(url) } });
      if (!res.ok) throw await httpError(res, url);
      return res.json();
    },
    postJson: async (url, body, timeoutMs = 8000) => {
      const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json", "content-type": "application/json", ...jupiterKeyHeader(url) }, body: JSON.stringify(body) });
      if (!res.ok) throw await httpError(res, url);
      return res.json();
    },
  };

  // Validate inputs against the tool's schema, run it, and map failures to a status and a fix.
  type ToolOutcome = { status: number; body: Record<string, unknown> };
  async function runTool(tool: ToolDef, rawArgs: unknown): Promise<ToolOutcome> {
    const parsed = z.object(tool.inputs).safeParse(currentArgs(tool, rawArgs ?? {}));
    if (!parsed.success) {
      return { status: 400, body: { error: "Invalid input.", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), problem: i.message })), fix: `See GET /api/tools/${tool.name} for every input and how to get it.` } };
    }
    try {
      return { status: 200, body: await tool.run(parsed.data, ctx) };
    } catch (error: any) {
      if (error instanceof ToolError) return { status: error.status, body: { error: error.message, fix: error.fix ?? null } };
      const message = String(error?.message ?? error);
      const rateLimited = /429|Too many requests/i.test(message);
      console.error(`tool ${tool.name} failed:`, message);
      return { status: rateLimited ? 503 : 502, body: { error: rateLimited ? "The Solana RPC is rate-limiting requests." : "The Solana RPC returned an error.", detail: message.slice(0, 300), fix: "Retry in a few seconds. Failed calls are never charged." } };
    }
  }

  // Paid tools settle in USDC via x402 to GATEWAY_WALLET; free tools, the daily free calls and the owner key skip payment.
  const x402 = createX402(GATEWAY_WALLET);
  const paidRoute = paidRouteMiddleware(x402.httpMiddleware);

  // ---------- Tool API ----------
  // The tool list, also put into every rendered page (pages.ts) so the site starts with it.
  const toolsIndex = () => ({
    freeCallsPerTool: FREE_CALLS_PER_TOOL, freeCallsReset: FREE_CALLS_RESET,
    payments: { protocol: "x402", x402Version: 2, scheme: "exact", network: X402_NETWORK, asset: "USDC", payTo: GATEWAY_WALLET },
    tools: TOOLS.map(toolDoc),
  });
  app.get("/api/tools", noCache, (_req, res) => res.json(toolsIndex()));

  const requireTool = (req: any, res: any, next: any) => {
    const tool = TOOLS_BY_NAME.get(req.params.name);
    if (!tool) return res.status(404).json({ error: `Unknown tool "${req.params.name}".`, fix: "GET /api/tools lists every tool." });
    req.tool = tool;
    next();
  };

  app.get("/api/tools/:name", noCache, requireTool, (req: any, res) => res.json(toolDoc(req.tool)));

  // Live example inputs built from current mainnet data, so a request runs as-is.
  const exampleCache = new Map<string, { at: number; value: unknown }>();
  app.get("/api/tools/:name/example", noCache, requireTool, async (req: any, res) => {
    const tool: ToolDef = req.tool;
    const hit = exampleCache.get(tool.name);
    if (hit && Date.now() - hit.at < 15_000) return res.json({ tool: tool.name, arguments: hit.value, live: true });
    try {
      const value = await tool.example(ctx);
      exampleCache.set(tool.name, { at: Date.now(), value });
      void recordServedExample(tool.name, value);
      res.json({ tool: tool.name, arguments: value, live: true });
    } catch (error: any) {
      res.status(503).json({ error: "Could not build a live example right now.", detail: String(error?.message ?? error).slice(0, 200) });
    }
  });

  app.post("/api/tools/:name", noCache, requireTool, paidRoute, async (req: any, res) => {
    const outcome = await runTool(req.tool, req.body);
    res.locals.output = outcome.body;
    res.status(outcome.status).json(outcome.body);
  });

  app.get("/api/trial/status", noCache, async (req: any, res) => {
    try {
      const used = await getFreeCallStatus(req.ip || "unknown");
      res.json({ scope: "caller_ip", freeCallsPerTool: FREE_CALLS_PER_TOOL, freeCallsReset: FREE_CALLS_RESET, freeCallsUsedByTool: used, prices: TOOL_PRICES, network: X402_NETWORK, asset: "USDC" });
    } catch (error) {
      console.error("free call status lookup failed:", error);
      res.status(503).json({ error: "Free call status is temporarily unavailable." });
    }
  });

  app.get("/api/analytics/usage", noCache, async (req, res) => {
    const you = req.ip ? hashIp(req.ip) : "";
    try {
      const [totals, tools] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE ${TOOL_RUN_SQL} AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS tool_runs_24h,
            COUNT(DISTINCT caller_hash) FILTER (WHERE ${TOOL_RUN_SQL} AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS callers_24h,
            COUNT(DISTINCT caller_hash) FILTER (WHERE ${TOOL_RUN_SQL} AND caller_hash <> $1 AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS other_callers_24h,
            COUNT(*) FILTER (WHERE ${TOOL_RUN_SQL} AND caller_hash <> $1)::bigint AS other_tool_runs_7d,
            COUNT(DISTINCT caller_hash) FILTER (WHERE ${TOOL_RUN_SQL} AND caller_hash <> $1)::bigint AS other_callers_7d,
            COUNT(*) FILTER (WHERE endpoint LIKE '/mcp%' AND NOT ${TOOL_RUN_SQL} AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS pings_24h,
            MAX(created_at) FILTER (WHERE ${TOOL_RUN_SQL}) AS last_tool_run_at
          FROM service_usage WHERE created_at >= NOW() - INTERVAL '7 days'`, [you]),
        pool.query(`
          SELECT endpoint, COUNT(*)::bigint AS runs, COUNT(DISTINCT caller_hash) FILTER (WHERE caller_hash <> $1)::bigint AS other_callers, MAX(created_at) AS last_run_at
          FROM service_usage WHERE ${TOOL_RUN_SQL} AND created_at >= NOW() - INTERVAL '7 days'
          GROUP BY endpoint ORDER BY COUNT(*) DESC, endpoint ASC LIMIT 12`, [you]),
      ]);
      const row = totals.rows[0] || {};
      res.json({
        toolRuns24h: Number(row.tool_runs_24h || 0), callers24h: Number(row.callers_24h || 0), otherCallers24h: Number(row.other_callers_24h || 0),
        otherToolRuns7d: Number(row.other_tool_runs_7d || 0), otherCallers7d: Number(row.other_callers_7d || 0), pings24h: Number(row.pings_24h || 0),
        lastToolRunAt: row.last_tool_run_at || null,
        tools: tools.rows.map((t: any) => ({ endpoint: t.endpoint, runs: Number(t.runs), otherCallers: Number(t.other_callers), lastRunAt: t.last_run_at })),
        note: "A tool run is a tool call over HTTP or MCP. Callers are counted by network, so \"besides you\" means a different network from the one viewing this page. Pings are MCP connections and tool listings, mostly directory uptime checks.",
      });
    } catch (error: any) {
      console.error("usage analytics query failed:", error);
      res.status(503).json({ error: "Live usage counts are temporarily unavailable." });
    }
  });

  // Owner-only revenue view: send the OWNER_API_KEY as x-api-key.
  app.get("/api/owner/payments", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    try {
      const [totals, byTool, recent] = await Promise.all([
        pool.query(`SELECT COUNT(*)::bigint AS payments, COALESCE(SUM(amount_base_units), 0)::bigint AS total,
          COALESCE(SUM(amount_base_units) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'), 0)::bigint AS total_24h,
          COALESCE(SUM(amount_base_units) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::bigint AS total_7d,
          COUNT(DISTINCT payer)::bigint AS payers FROM x402_payments`),
        pool.query(`SELECT tool, COUNT(*)::bigint AS payments, SUM(amount_base_units)::bigint AS total FROM x402_payments GROUP BY tool ORDER BY total DESC`),
        pool.query(`SELECT tx_signature, tool, payer, amount_base_units, created_at FROM x402_payments ORDER BY created_at DESC LIMIT 25`),
      ]);
      const usdc = (v: unknown) => Number(v ?? 0) / 1e6;
      const t = totals.rows[0];
      res.json({
        asset: "USDC", payments: Number(t.payments), distinctPayers: Number(t.payers),
        revenueUsdc: { allTime: usdc(t.total), last7Days: usdc(t.total_7d), last24Hours: usdc(t.total_24h) },
        byTool: byTool.rows.map((r: any) => ({ tool: r.tool, payments: Number(r.payments), revenueUsdc: usdc(r.total) })),
        recent: recent.rows.map((r: any) => ({ txSignature: r.tx_signature, tool: r.tool, payer: r.payer, amountUsdc: usdc(r.amount_base_units), at: r.created_at })),
      });
    } catch (error) {
      console.error("payments query failed:", error);
      res.status(503).json({ error: "Payments are temporarily unavailable." });
    }
  });

  // Site visits, sent by the page on each load and navigation. Path and referring site only.
  // At most VIEWS_PER_HOUR per network per hour (per server instance), so the endpoint cannot be used to fill the table.
  const VIEWS_PER_HOUR = 300;
  const viewCounts = new Map<string, { n: number; resetAt: number }>();
  app.post("/api/analytics/view", (req, res) => {
    const pagePath = typeof req.body?.path === "string" ? req.body.path.split(/[?#]/)[0].slice(0, 200) : "";
    if (!pagePath.startsWith("/")) return res.status(400).json({ error: "path is required." });
    const callerHash = req.ip ? hashIp(req.ip) : null;
    const now = Date.now();
    if (viewCounts.size > 50_000) for (const [k, v] of viewCounts) if (v.resetAt <= now) viewCounts.delete(k);
    const count = viewCounts.get(callerHash ?? "") ?? { n: 0, resetAt: now + 3_600_000 };
    if (count.resetAt <= now) { count.n = 0; count.resetAt = now + 3_600_000; }
    count.n++;
    viewCounts.set(callerHash ?? "", count);
    if (count.n > VIEWS_PER_HOUR) return res.status(204).end();
    let referrerHost: string | null = null;
    try {
      const host = new URL(String(req.body?.referrer || "")).hostname.slice(0, 120);
      if (host && host !== req.hostname) referrerHost = host;
    } catch { /* no referrer, or not a URL */ }
    const client = String(req.headers["user-agent"] || "").slice(0, 200) || null;
    void recordPageView({ path: pagePath, referrerHost, callerHash, client });
    res.status(204).end();
  });

  // Owner dashboard (/owner on the site): revenue per tool, who calls each tool, and site visitors.
  app.post("/api/owner/outreach/stop", noCache, async (req: any, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    const key = typeof req.body?.key === "string" ? req.body.key : "";
    try {
      res.json({ stopped: await stopOutreach(key) });
    } catch (error) {
      console.error("stopping outreach failed:", error);
      res.status(503).json({ error: "Could not stop the note right now." });
    }
  });

  app.get("/api/owner/overview", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    const days = [1, 7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    try {
      // Calls and visits from a network the dashboard is opened from are counted as the owner's own.
      if (req.ip) await noteOwnerNetwork(hashIp(req.ip));
      const [overview, outreach] = await Promise.all([ownerOverview({ days }), listOutreach()]);
      res.json({ ...overview, outreach });
    } catch (error) {
      console.error("owner overview failed:", error);
      res.status(503).json({ error: "The dashboard data is temporarily unavailable." });
    }
  });

  // Every tool call in a period with its caller, input kind and answer (calls.ts), for the dashboard's Calls tab.
  app.get("/api/owner/calls", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    const q = req.query as Record<string, string | undefined>;
    const n = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
    try {
      if (req.ip) await noteOwnerNetwork(hashIp(req.ip));
      res.json(await ownerCalls({ hours: n(q.hours) ?? 24, tool: q.tool || undefined, kind: q.kind || undefined, input: q.input || undefined,
        status: q.status || undefined, q: q.q ? String(q.q).slice(0, 200) : undefined, caller: q.caller || undefined, network: q.network || undefined,
        group: q.group || undefined, sort: q.sort || undefined, before: n(q.before), after: n(q.after), limit: n(q.limit),
        hideBots: q.hideBots === "1", hideMine: q.hideMine === "1" }));
    } catch (error) {
      console.error("owner calls failed:", error);
      res.status(503).json({ error: "The calls are temporarily unavailable." });
    }
  });
  app.get("/api/owner/calls/:id", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: "Call ids are numbers." });
    try {
      const call = await ownerCall(Number(req.params.id));
      call ? res.json(call) : res.status(404).json({ error: "No tool call with that id." });
    } catch (error) {
      console.error("owner call failed:", error);
      res.status(503).json({ error: "That call is temporarily unavailable." });
    }
  });

  // token_safety measured against real outcomes (accuracy.ts). Cloud Scheduler calls tick every 10 minutes.
  const ownerOnly = (req: any, res: any) => (isOwnerKey(keyFromReq(req)) ? true : (res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." }), false));
  const safetyVerdict = async (mint: string) => (await TOOLS_BY_NAME.get("token_safety")!.run({ token: mint, network: "mainnet-beta" }, ctx)) as any;
  app.post("/api/owner/accuracy/tick", noCache, async (req, res) => {
    if (!ownerOnly(req, res)) return;
    try { res.json(await accuracyTick(ctx, safetyVerdict)); }
    catch (error: any) { console.error("Accuracy tick failed:", error); res.status(500).json({ error: String(error?.message ?? error).slice(0, 400) }); }
  });
  app.post("/api/owner/accuracy/add", noCache, async (req, res) => {
    if (!ownerOnly(req, res)) return;
    const cohort = String(req.body?.cohort ?? "").trim();
    if (!/^[\w.-]{1,60}$/.test(cohort) || !Array.isArray(req.body?.mints)) return res.status(400).json({ error: "Send { cohort: \"name\", mints: [addresses] }." });
    res.json({ queued: await addToQueue(cohort, req.body.mints.slice(0, 2000)) });
  });
  app.get("/api/owner/accuracy", noCache, async (req, res) => {
    if (!ownerOnly(req, res)) return;
    res.json(await accuracyReport());
  });

  // Posts the next item to the Pulse X account (x.ts). Cloud Scheduler calls it three times a week;
  // ?dry=1 only shows what would be posted.
  app.post("/api/owner/x/run", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    try {
      res.json(await runXPost({ dryRun: req.query.dry === "1" }));
    } catch (error: any) {
      console.error("X post failed:", error);
      res.status(502).json({ posted: false, error: String(error?.message ?? error).slice(0, 400) });
    }
  });

  // The X queue posts still to go out, with the owner's edits, and the last posts made (npm run x).
  app.get("/api/owner/x/queue", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    const recent = (await pool.query(`SELECT key, kind, text, post_id, created_at FROM x_posts WHERE kind <> 'seen' ORDER BY created_at DESC LIMIT 5`)).rows;
    res.json({ upcoming: await upcomingQueue(), recent });
  });

  // Saves an edit to an upcoming queue post: { key, text }; empty text goes back to the original.
  app.post("/api/owner/x/queue/edit", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    const r = await saveQueueEdit(String(req.body?.key ?? ""), String(req.body?.text ?? ""));
    res.status(r.saved ? 200 : 400).json(r);
  });

  // A post the owner writes by hand (scripts/x-post.ts): { text, media: bucket file names }. ?dry=1 only checks it.
  app.post("/api/owner/x/post", noCache, async (req, res) => {
    if (!isOwnerKey(keyFromReq(req))) return res.status(401).json({ error: "Owner key required.", fix: "Send your OWNER_API_KEY in the x-api-key header." });
    const media = Array.isArray(req.body?.media) ? req.body.media.map(String) : [];
    if (media.some((m: string) => !m.startsWith("uploads/") || m.includes(".."))) return res.status(400).json({ posted: false, reason: "Files must be in uploads/." });
    try {
      res.json(await postManual({ text: String(req.body?.text ?? ""), media, dryRun: req.query.dry === "1" }));
    } catch (error: any) {
      console.error("X manual post failed:", error);
      res.status(502).json({ posted: false, error: String(error?.message ?? error).slice(0, 400) });
    }
  });

  // ---------- MCP ----------
  const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  const asResult = (outcome: ToolOutcome) => ({
    content: [{ type: "text" as const, text: JSON.stringify(outcome.body, null, 2) }],
    ...(outcome.status === 200 ? { structuredContent: outcome.body } : { isError: true }),
  });

  // Every tool goes through the same admission as HTTP: free tools run, the owner key and free calls run unpaid,
  // and everything else follows the x402 MCP transport (PaymentRequired result, then _meta["x402/payment"]).
  // note() tells the request's usage record how a tool call was admitted, when paid its settlement transaction, and
  // the tool's result.
  type CallNote = { via?: string; paymentTx?: string; output?: unknown };
  const createMcpServer = (caller: { apiKey?: string; ip: string; userAgent?: string; note?: (n: CallNote) => void }) => {
    const server = new McpServer({ name: "solana-pulse-gateway", version: VERSION });
    for (const tool of TOOLS) {
      const price = priceOf(tool.name);
      const handler = async (args: any) => {
        const outcome = await runTool(tool, args);
        caller.note?.({ output: outcome.body });
        return asResult(outcome);
      };
      server.tool(tool.name, mcpDescription(tool), tool.inputs, READ_ONLY, async (args: any, extra: any) => {
        if (!price) return handler(args);
        let admission;
        try {
          admission = await admitCall({ tool: tool.name, ip: caller.ip, apiKey: caller.apiKey, hasPayment: Boolean(extra?._meta?.["x402/payment"]), userAgent: caller.userAgent });
        } catch (error) {
          console.error("free call metering error:", error);
          return { content: [{ type: "text" as const, text: "Usage metering is temporarily unavailable. Retry shortly." }], isError: true };
        }
        caller.note?.({ via: admission.via });
        if (admission.via === "x402") {
          try {
            const paid: any = await (await x402.wrapMcpTool(tool.name, price, handler))(args, extra);
            const settled = paid?._meta?.["x402/payment-response"];
            if (settled?.success && typeof settled.transaction === "string") caller.note?.({ via: "x402", paymentTx: settled.transaction });
            return paid;
          }
          catch (error) {
            console.error("x402 payment setup failed:", error);
            return { content: [{ type: "text" as const, text: "Payments are temporarily unavailable. Retry shortly." }], isError: true };
          }
        }
        const result: any = await handler(args);
        if (admission.via !== "free_call") return result;
        if (result.isError) await refundFreeCall(caller.ip, tool.name);
        return { ...result, _meta: { freeCallsRemaining: admission.remaining } };
      });
    }
    return server;
  };

  const sseTransports = new Map<string, SSEServerTransport>();
  app.get("/mcp/sse", async (req, res) => {
    const sessionId = randomUUID();
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);
    sseTransports.set(sessionId, transport);
    await createMcpServer({ apiKey: keyFromReq(req), ip: req.ip || "unknown", userAgent: req.get("user-agent") }).connect(transport);
    res.on("close", () => sseTransports.delete(sessionId));
  });
  app.post("/mcp/messages", async (req, res) => {
    const transport = sseTransports.get(String(req.query.sessionId || ""));
    if (transport) await transport.handlePostMessage(req, res, req.body);
    else res.status(404).json({ error: "MCP SSE session not found." });
  });
  app.post("/mcp", async (req, res) => {
    const server = createMcpServer({ apiKey: keyFromReq(req), ip: req.ip || "unknown", userAgent: req.get("user-agent"), note: (n) => Object.assign(res.locals, n) });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      acceptMcpResponses(req);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  app.get("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null }));
  app.delete("/mcp", (_req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null }));

  // ---------- Discovery ----------
  const pricingSummary = `Every tool gives each caller ${FREE_CALLS_TEXT} (reset ${FREE_CALLS_RESET}), then costs $0.01 USDC per call ($0.02 for the three pre-sign and token safety checks), paid per request with x402 on Solana mainnet. Calls that return an error are never charged.`;

  app.get("/.well-known/mcp.json", noCache, (_req, res) => {
    res.json({
      name: "Solana Pulse",
      version: VERSION,
      description: "An intelligence layer between Solana and AI agents: checks transactions before signing, verifies they match intent, gives token safety verdicts and explains failures.",
      instructions: `Connect with POST /mcp (Streamable HTTP) or /mcp/sse. ${pricingSummary} Paid calls follow the x402 v2 MCP transport: an unpaid call returns a PaymentRequired result and the client retries with _meta["x402/payment"]. No account or API key is needed. Field-by-field docs for every tool: GET /api/tools/<name>.`,
      payments: { protocol: "x402", x402Version: 2, scheme: "exact", network: X402_NETWORK, asset: "USDC", payTo: GATEWAY_WALLET, freeCallsPerTool: FREE_CALLS_PER_TOOL, freeCallsReset: FREE_CALLS_RESET },
      mcp_sse_endpoint: "/mcp/sse",
      tools: TOOLS.map((t) => ({ name: t.name, description: `${t.useWhen} ${priceText(t.name)}.`, price: priceOf(t.name) })),
    });
  });

  // Glama connector ownership verification
  app.get("/.well-known/glama.json", (_req, res) => {
    res.json({ $schema: "https://glama.ai/mcp/schemas/connector.json", maintainers: [{ email: "timothymycompc@gmail.com" }] });
  });

  // Every page and tool page, generated from the registry so new tools are indexed automatically.
  app.get("/sitemap.xml", noCache, (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const paths = ["/", "/docs/quickstart", "/docs/calls", "/docs/connect", "/docs/pricing", "/toolbox", "/status", ...TOOLS.map((t) => `/docs/tools/${t.name}`), "/llms.txt", "/.well-known/mcp.json"];
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${PUBLIC_URL}${p}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>`);
  });

  app.get("/robots.txt", noCache, (_req, res) => {
    res.type("text/plain").send(`User-agent: *\nAllow: /\n\nSitemap: ${PUBLIC_URL}/sitemap.xml`);
  });

  app.get("/openapi.json", noCache, (_req, res) => res.json(openApiDocument(PUBLIC_URL)));
  app.get("/llms.txt", noCache, (_req, res) => {
    const section = (category: string, heading: string) => {
      const tools = TOOLS.filter((t) => t.category === category);
      return tools.length ? `## ${heading}\n${tools.map((t) => `- ${t.name} (${priceText(t.name)}): ${t.useWhen} Inputs: ${t.inputDocs.map((i) => `${i.name}${i.required ? "" : "?"}`).join(", ")}.`).join("\n")}\n` : "";
    };
    res.type("text/plain").send(`# Solana Pulse

An intelligence layer between Solana and AI agents. It checks transactions before signing, verifies a transaction matches what the agent meant to do, gives token safety verdicts, explains failures, and converts amounts with real decimals, so agents stop losing money to hallucinated values.

## Pricing
- ${pricingSummary}
- No account or API key. HTTP: an unpaid call to a paid tool returns 402 with a PAYMENT-REQUIRED header; retry with PAYMENT-SIGNATURE. MCP: the unpaid call returns a PaymentRequired tool result; retry with _meta["x402/payment"].

## How to call
- HTTP: POST /api/tools/<name> with a JSON body of inputs.
- MCP: POST /mcp (Streamable HTTP) or /mcp/sse, then tools/call with the tool name.
- Docs for every input (what it's looking for, where to get it) and every output field (what it is, how it's worked out): GET /api/tools and GET /api/tools/<name>.
- Tools were renamed in October 2026 (preflight_transaction is now check_tx, and so on). Old names and old input names still work.
- Ready-to-run live example inputs: GET /api/tools/<name>/example.

${section("transactions", "Transactions")}
${section("tokens", "Tokens")}
${section("wallets", "Wallets")}
${section("network", "Network")}
${section("reference", "Reference")}`);
  });

  app.get("/api/debug/build", noCache, (_req, res) => res.json({ build: "v2-intelligence-layer", status: "alive", tools: TOOLS.length }));

  // Unknown discovery files get a plain 404, not the website, so crawlers don't mistake the page for a manifest.
  app.use("/.well-known", (_req, res) => res.status(404).json({ error: "Not found" }));

  // ---------- Frontend ----------
  const distPath = path.join(process.cwd(), "dist");
  if (!fs.existsSync(path.join(distPath, "index.html"))) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { allowedHosts: true, middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath, { index: false })); // "/" is a rendered page too, not the bare index.html
    app.use(pageHandler(distPath, toolsIndex));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Solana Pulse running on port ${PORT} with ${TOOLS.length} tools`));
}

startServer();
