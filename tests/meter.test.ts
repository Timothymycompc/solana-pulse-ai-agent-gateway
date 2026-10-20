// Free-call metering against a real Postgres (PGlite, in memory): the daily allowance, refunds and path tricks.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { admitCall, getFreeCallStatus, hashIp, paidRouteMiddleware, refundFreeCall } from "../server/meter";
import { FREE_CALLS_PER_TOOL, TOOL_PRICES } from "../server/pricing";

const db = new PGlite();
before(async () => {
  // Route the server's queries to PGlite, then create the real schema.
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
});

const ip = "203.0.113.7";
const use = (tool: string, callerIp = ip) => admitCall({ tool, ip: callerIp, hasPayment: false });

test("a tool priced null (free, no daily limit) never touches the allowance", async () => {
  // Every real tool is priced today, so check the free path with a stand-in.
  TOOL_PRICES.stand_in_free_tool = null;
  try {
    assert.deepEqual(await use("stand_in_free_tool"), { via: "free_tool" });
  } finally {
    delete TOOL_PRICES.stand_in_free_tool;
  }
});

test("each paid tool gives the daily allowance, then asks for payment", async () => {
  for (let i = 1; i <= FREE_CALLS_PER_TOOL; i++) {
    assert.deepEqual(await use("token_safety"), { via: "free_call", remaining: FREE_CALLS_PER_TOOL - i });
  }
  assert.deepEqual(await use("token_safety"), { via: "x402" });
  // Another tool and another caller have their own allowance.
  assert.equal((await use("check_tx")).via, "free_call");
  assert.equal((await use("token_safety", "198.51.100.9")).via, "free_call");
});

test("a failed call is refunded", async () => {
  await refundFreeCall(ip, "token_safety");
  assert.equal((await use("token_safety")).via, "free_call");
  assert.equal((await use("token_safety")).via, "x402");
});

test("the allowance starts again the next day", async () => {
  await db.query(`UPDATE trial_tool_usage SET last_call_at = NOW() - INTERVAL '1 day' WHERE ip_hash = $1`, [hashIp(ip)]);
  assert.deepEqual(await getFreeCallStatus(ip), { token_safety: 0, check_tx: 0 });
  assert.deepEqual(await use("token_safety"), { via: "free_call", remaining: FREE_CALLS_PER_TOOL - 1 });
});

test("a caller that attaches a payment pays and keeps its free calls", async () => {
  assert.deepEqual(await admitCall({ tool: "fee", ip, hasPayment: true }), { via: "x402" });
  assert.equal((await getFreeCallStatus(ip)).fee, undefined);
});

test("percent-encoded and old tool names share the real tool's allowance", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const payWall = (_req: any, res: any) => res.status(402).json({ paymentRequired: true });
  app.post("/api/tools/:name", paidRouteMiddleware(payWall as any), (_req, res) => res.json({ ran: true }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = async (path: string) => (await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST",
    headers: { "x-forwarded-for": "192.0.2.44", "content-type": "application/json" }, body: JSON.stringify({ name: "BONK" }) })).status;
  try {
    for (let i = 0; i < FREE_CALLS_PER_TOOL; i++) assert.equal(await call("/api/tools/find_token"), 200);
    assert.equal(await call("/api/tools/find%5Ftoken"), 402);
    assert.equal(await call("/api/tools/resolve_token"), 402, "the old name shares the allowance too");
    assert.equal(await call("/api/tools/%72esolve_token"), 402);
  } finally {
    server.close();
  }
});

test("Coinbase's Bazaar checker and indexer, and the pay tool, are asked to pay, not given a free call", async () => {
  const app = express();
  app.set("trust proxy", true);
  const payWall = (_req: any, res: any) => res.status(402).json({ x402Version: 2 });
  app.post("/api/tools/:name", paidRouteMiddleware(payWall as any), (_req, res) => res.json({ ran: true }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = async (ua: string) => (await fetch(`http://127.0.0.1:${port}/api/tools/fee`, { method: "POST", headers: { "x-forwarded-for": "192.0.2.55", "user-agent": ua } })).status;
  try {
    assert.equal(await call("Go-http-client/1.1"), 402);
    assert.equal(await call("Go-http-client/2.0"), 402);
    assert.equal(await call("CoinbaseBazaarDiscovery/1.0 (+/x402)"), 402);
    assert.equal(await call("my-agent/1.0 Go-http-client/1.1"), 200, "a Go app that names itself still gets free calls");
    assert.equal(await call("pay/cli/0.29.0"), 402, "the Solana Foundation's pay tool, whose registry only lists tools that answer 402");
    assert.equal(await call("pay/mcp/1.0.26"), 402);
    assert.equal(await call("paycheck-bot/1.0"), 200);
  } finally {
    server.close();
  }
});

test("a note from the developer reaches only the caller it's meant for", async () => {
  const { callerNotes } = await import("../server/notes");
  const app = express();
  app.use("/api", callerNotes);
  app.post("/api/tools/:name", (_req, res) => res.json({ ran: true }));
  app.post("/api/paid/:name", (_req, res) => res.status(402).json({ x402Version: 2 }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = async (path: string, ua: string) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "user-agent": ua } });
    return { header: r.headers.get("x-note-from-the-developer"), body: await r.json() };
  };
  try {
    const them = await call("/api/tools/token_safety", "algebra-executor/1");
    assert.equal(them.body.ran, true, "the real answer is untouched");
    assert.match(them.body.note_from_the_developer, /timothymycompc@gmail\.com/);
    assert.match(them.header ?? "", /^Hi from the developer/);
    assert.match((await call("/api/paid/fee", "algebra-executor/1")).body.note_from_the_developer, /Solana Pulse/, "402 answers carry it too");
    const others = await call("/api/tools/token_safety", "curl/8.5.0");
    assert.equal(others.header, null);
    assert.equal(others.body.note_from_the_developer, undefined);
  } finally {
    server.close();
  }
});

test("a free pass lets its caller run paid tools free until it ends, without using daily free calls", async () => {
  const { freePassFor, FREE_PASSES } = await import("../server/meter");
  const until = Date.parse(FREE_PASSES[0].until);
  assert.ok(freePassFor("algebra-executor/1", until - 1000));
  assert.equal(freePassFor("algebra-executor/1", until + 1000), null, "it ends on time");
  assert.equal(freePassFor("someone-else/1", until - 1000), null);
  const { trialKeyFor } = await import("../server/meter");
  const keySha256 = (await import("crypto")).createHash("sha256").update("pulse_trial_example").digest("hex");
  const keys = [{ name: "a builder", keySha256, until: "2026-12-01T00:00:00Z", why: "test" }];
  assert.ok(trialKeyFor("pulse_trial_example", Date.parse("2026-11-01"), keys), "a trial key runs free");
  assert.equal(trialKeyFor("pulse_trial_example", Date.parse("2026-12-02"), keys), null, "and stops on time");
  assert.equal(trialKeyFor("pulse_trial_other", Date.parse("2026-11-01"), keys), null, "only that exact key");
  if (Date.now() < until) {
    for (let i = 0; i < 30; i++) assert.deepEqual(await admitCall({ tool: "token_safety", ip: "192.0.2.77", hasPayment: false, userAgent: "algebra-executor/1" }), { via: "free_pass" });
    assert.equal((await getFreeCallStatus("192.0.2.77")).token_safety, undefined, "daily free calls untouched");
  }
});

test("an empty body is a payment probe only for tools that need inputs; fee and blockhash keep their free calls", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const payWall = (_req: any, res: any) => res.status(402).json({ x402Version: 2 });
  app.post("/api/tools/:name", paidRouteMiddleware(payWall as any), (_req, res) => res.json({ ran: true }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = async (tool: string, body?: unknown) => (await fetch(`http://127.0.0.1:${port}/api/tools/${tool}`, { method: "POST",
    headers: { "x-forwarded-for": "192.0.2.66", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body) })).status;
  try {
    assert.equal(await call("token_safety"), 402, "no body: probe");
    assert.equal(await call("token_safety", {}), 402, "empty JSON: probe");
    assert.equal((await getFreeCallStatus("192.0.2.66")).token_safety, undefined, "a probe uses no free call");
    assert.equal(await call("token_safety", { mint: "x" }), 200, "a real call still gets a free call");
    assert.equal(await call("fee", {}), 200, "fee runs with no inputs, so it is a real call");
    assert.equal(await call("blockhash"), 200, "so does blockhash");
  } finally {
    server.close();
  }
});
