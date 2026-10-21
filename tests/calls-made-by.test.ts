// "Made by" in the owner Explorer against a real Postgres (PGlite): the owner's tests label themselves (x-pulse-test
// header, saved as test_name), older audit runs are known by their pulse-audit user agent, the owner's own calls read
// "you", and groups list the most recent first unless asked otherwise.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema, recordServiceUsage } from "../server/db";
import { hashIp } from "../server/meter";
import { ownerCalls, testOf } from "../server/calls";

const db = new PGlite();

before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
  const run = (endpoint: string, ip: string, client: string, extra: Partial<Parameters<typeof recordServiceUsage>[0]> = {}) =>
    recordServiceUsage({ endpoint, method: "POST", status: 200, callerHash: hashIp(ip), client, via: "free_call", ...extra });
  await run("/api/tools/fee", "203.0.113.70", "curl/8.5.0", { input: { tx: "AQAB" } });                              // outside
  await run("/mcp/tools/fee", "192.0.2.8", "Agent402/1.0 (+https://agent402.tools/crawler)");                         // bot
  await run("/api/tools/token_safety", "203.0.113.80", "pulse-audit/1.0", { input: { token: "So11111111111111111111111111111111111111112" } }); // old audit run
  await run("/api/tools/fee", "203.0.113.90", "node", { via: "owner", input: {} });                                   // owner key
  await run("/api/tools/convert", "203.0.113.91", "curl/8.14.1", { testName: "deploy", input: { token: "USDC", amount: "5" } }); // deploy check
});

test("each call says who made it: a test of yours, you, a bot or someone outside", async () => {
  const r = await ownerCalls({ hours: 24 });
  const by = Object.fromEntries(r.rows.map((c) => [`${c.tool}|${c.caller.userAgent}`, [c.madeBy, c.test]]));
  assert.deepEqual(by["convert|curl/8.14.1"], ["test", "deploy"]);
  assert.deepEqual(by["token_safety|pulse-audit/1.0"], ["test", "pulse-audit"]);
  assert.deepEqual(by["fee|node"], ["you", null]);
  assert.deepEqual(by["fee|Agent402/1.0 (+https://agent402.tools/crawler)"], ["bot", null]);
  assert.deepEqual(by["fee|curl/8.5.0"], ["outside", null]);
  assert.deepEqual(r.summary.byMadeBy, { test: 2, you: 1, bot: 1, outside: 1 });
  // Tests count as yours, so "Hide mine" hides them too.
  const hidden = await ownerCalls({ hours: 24, hideMine: true, hideBots: true });
  assert.deepEqual(hidden.rows.map((c) => c.madeBy), ["outside"]);
  assert.equal((await ownerCalls({ hours: 24, madeBy: "test" })).matching, 2);
});

test("a test name has to look like one", () => {
  assert.equal(testOf({ test_name: "deploy" }), "deploy");
  assert.equal(testOf({ client: "pulse-audit/2.1 (scratch)" }), "pulse-audit");
  assert.equal(testOf({ client: "curl/8.5.0" }), null);
});

test("groups list the most recent first unless asked otherwise", async () => {
  const r = await ownerCalls({ hours: 24, group: "tool" });
  assert.equal(r.groups![0].key, "convert", "the deploy check was the last call");
});
