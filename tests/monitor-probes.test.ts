// Monitors and x402 directories must see 402 on an empty body, even for fee and blockhash (which run with no inputs).
// vet402's observatory marked fee and blockhash "fail: no_402" and tx_version "unverified" on 2026-11-22.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { getFreeCallStatus, paidRouteMiddleware } from "../server/meter";

const db = new PGlite();
before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
});

// User agents copied from Pulse's usage log (2026-11-08 to 11-22): each sent empty bodies to fee or blockhash.
const MONITORS = [
  "vet402-observatory-l1/1.0 (+https://vet402.com/observatory/methodology)",
  "x402station/0.1 (+https://x402station.io) uptime-probe",
  "CarbonMonitor/0.1",
  "PayAI-Bazaar/1.0",
  "AgentRankProbe/0.1",
  "lumiere-paycheck-prober/1.0",
  "CanaryBot/0.1",
  "tolls-catalog-probe",
  "x402-observer/1.0",
  "agents-trust-probe/1",
  "mcpbeat/0.1 (+https://mcpbeat.com/bot/; liveness check)",
];

test("monitors and directories are always asked to pay first; real callers keep free calls, even on an empty fee", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  const payWall = (_req: any, res: any) => res.status(402).json({ x402Version: 2 });
  app.post("/api/tools/:name", paidRouteMiddleware(payWall as any), (_req, res) => res.json({ ran: true }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = async (tool: string, ua: string, body?: unknown) => (await fetch(`http://127.0.0.1:${port}/api/tools/${tool}`, {
    method: "POST",
    headers: { "x-forwarded-for": "192.0.2.88", "user-agent": ua, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })).status;
  try {
    for (const ua of MONITORS) {
      assert.equal(await call("fee", ua, {}), 402, ua);
      assert.equal(await call("blockhash", ua), 402, ua);
      assert.equal(await call("tx_version", ua, {}), 402, ua);
    }
    assert.equal((await getFreeCallStatus("192.0.2.88")).fee, undefined, "monitor probes use no free calls");
    assert.equal(await call("tx_version", "node", {}), 402, "tx_version needs tx_id or tx, so empty is a probe for anyone (was a 400)");
    assert.equal((await getFreeCallStatus("192.0.2.88")).tx_version, undefined, "that probe uses no free call");
    assert.equal(await call("tx_version", "node", { tx_id: "x".repeat(88) }), 200, "with an input it is a real free call");
    assert.equal(await call("fee", "node", {}), 200, "a real caller still gets fee free");
    assert.equal(await call("blockhash", "python-httpx/0.27.0"), 200);
    assert.equal(await call("fee", "paycheck-bot/1.0", {}), 200, "a bot that is not a monitor keeps free calls");
    assert.equal(await call("fee", "CarbonMonitor/0.1", { network: "mainnet-beta" }), 402, "a monitor with real inputs is asked to pay too");
    assert.equal(await call("token_safety", "vet402-observatory-l1/1.0", { mint: "x" }), 402, "on every tool");
    assert.equal((await getFreeCallStatus("192.0.2.88")).token_safety, undefined, "and uses no free calls");
  } finally {
    server.close();
  }
});
