// The public usage page (/status and the home page) splits the week's tool runs by who made them, by the owner
// explorer's own rules, so the public numbers can never claim bots, the owner or a monitor as users.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema, noteOwnerNetwork, recordServiceUsage } from "../server/db";
import { hashIp } from "../server/meter";
import { publicUsage } from "../server/calls";

const db = new PGlite();
const OWNER_IP = "198.51.100.1", DEV_IP = "203.0.113.40", MONITOR_IP = "203.0.113.77", VISITOR_IP = "203.0.113.90";
const EXAMPLE = { wallet: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9", network: "mainnet-beta" };

before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
  const run = (endpoint: string, ip: string, client: string, extra: Partial<Parameters<typeof recordServiceUsage>[0]> = {}) =>
    recordServiceUsage({ endpoint, method: "POST", status: 200, callerHash: hashIp(ip), client, ...extra });
  // A directory bot, the owner, a known monitor, a visitor running the site's example, and one caller that typed its own input.
  await run("/mcp/tools/token_safety", "192.0.2.7", "PayAI-Bazaar/1.0 (+https://docs.payai.network)", { status: 402, via: "x402" });
  await run("/api/tools/fee", OWNER_IP, "node", { via: "owner", input: { tx: "AQAB" } });
  await noteOwnerNetwork(hashIp(OWNER_IP));
  await run("/api/tools/token_safety", MONITOR_IP, "algebra-executor/2.1", { via: "free_call", input: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } });
  await db.query(`INSERT INTO served_examples (input_hash, tool) VALUES (md5($1::jsonb::text), $2) ON CONFLICT DO NOTHING`, [JSON.stringify(EXAMPLE), "balance"]);
  await run("/api/tools/balance", VISITOR_IP, "curl/8.5.0", { via: "free_call", input: EXAMPLE });
  await run("/api/tools/check_tx", DEV_IP, "curl/8.5.0", { via: "free_call", input: { tx: "AQABAgMEBQ" } });
  await run("/api/tools/tx_matches", DEV_IP, "curl/8.5.0", { via: "free_call", input: { tx: "AQABAgMEBQ", to: "x" } });
});

test("each run is counted once, under who made it; only a caller that passed every check is a possible user", async () => {
  const u = await publicUsage(168);
  assert.equal(u.calls, 6);
  assert.deepEqual({ owner: u.owner, bots: u.bots, monitors: u.monitors, examples: u.examples, possibleUsers: u.possibleUsers },
    { owner: 1, bots: 1, monitors: 1, examples: 1, possibleUsers: 2 });
  assert.equal(u.possibleUserCallers, 1, "two runs from one caller is one possible user");
  assert.equal(u.paidByOthers, 0);
});

test("nothing that identifies a caller leaves for the public page", async () => {
  const text = JSON.stringify(await publicUsage(168));
  for (const ip of [OWNER_IP, DEV_IP, MONITOR_IP, VISITOR_IP]) assert.ok(!text.includes(hashIp(ip).slice(0, 6)), "no network ids");
  assert.ok(!/curl|algebra|AQAB/.test(text), "no user agents or inputs");
});
