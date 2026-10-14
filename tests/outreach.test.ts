// Personal notes go only to callers that use the tools like a real developer or AI app, never to directory bots.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema } from "../server/db";
import { hashIp } from "../server/meter";
import { noteText, outreachNotes, pickCandidates, refreshOutreach, listOutreach, type CallerActivity } from "../server/outreach";

const row = (o: Partial<CallerActivity>): CallerActivity => ({ client: "my-agent/1.0", callerHash: "h1", mcpClient: null, runs: 0, hours: 0, tools: {}, owner: false, ...o });

test("a program using a few tools steadily qualifies; one burst does not", () => {
  assert.equal(pickCandidates([row({ runs: 40, hours: 6, tools: { token_safety: 40 } })]).length, 1);
  assert.equal(pickCandidates([row({ runs: 40, hours: 1, tools: { token_safety: 40 } })]).length, 0, "all in one hour");
  assert.equal(pickCandidates([row({ runs: 6, hours: 4, tools: { token_safety: 6 } })]).length, 0, "too few calls");
});

test("directory bots and sweeps are skipped, the owner too", () => {
  const everyTool = Object.fromEntries(["balance", "tokens", "history", "fee", "wallet", "convert", "check_tx", "tx_matches", "find_token"].map((t) => [t, 2]));
  assert.equal(pickCandidates([row({ client: "x402lens-indexer/1.0", runs: 50, hours: 10, tools: { fee: 50 } })]).length, 0, "calls itself an indexer");
  assert.equal(pickCandidates([row({ runs: 18, hours: 5, tools: everyTool })]).length, 0, "one or two of every tool");
  assert.equal(pickCandidates([row({ runs: 40, hours: 6, tools: { fee: 40 }, owner: true })]).length, 0);
});

test("AI apps qualify sooner, and a generic user agent is matched by network", () => {
  const ai = pickCandidates([row({ client: "node", mcpClient: "claude-ai 1.0", runs: 3, hours: 1, tools: { check_tx: 3 } })]);
  assert.equal(ai.length, 1);
  assert.equal(ai[0].matchHash, "h1", "'node' is shared by many people, so the network is part of the match");
  const named = pickCandidates([row({ callerHash: "a", runs: 6, hours: 3, tools: { fee: 6 } }), row({ callerHash: "b", runs: 6, hours: 3, tools: { fee: 6 } })]);
  assert.equal(named.length, 1, "one named program across two networks adds up");
  assert.equal(named[0].matchHash, null);
});

test("the note names the tools they actually use", () => {
  const text = noteText({ tools: [["token_safety", 30], ["check_tx", 5]], runs: 35 });
  assert.match(text, /token_safety and check_tx \(35 calls this week\)/);
  assert.match(text, /timothymycompc@gmail\.com/);
});

const db = new PGlite();
before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
});

test("from the usage log to a note in their answers", async () => {
  const caller = hashIp("203.0.113.50");
  for (let h = 0; h < 12; h++) {
    await pool.query(`INSERT INTO service_usage (endpoint, method, status, caller_hash, client, created_at) VALUES ('/api/tools/token_safety', 'POST', 200, $1, 'dex-sniper/2.1', NOW() - make_interval(hours => $2::int))`, [caller, h]);
  }
  await refreshOutreach();
  const list = await listOutreach();
  assert.equal(list.length, 1);
  assert.equal(list[0].userAgent, "dex-sniper/2.1");

  const app = express();
  app.set("trust proxy", true);
  app.use("/api", outreachNotes);
  app.post("/api/tools/:name", (_req, res) => res.json({ verdict: "SAFE" }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = async (ua: string) => (await fetch(`http://127.0.0.1:${port}/api/tools/token_safety`, { method: "POST", headers: { "user-agent": ua, "x-forwarded-for": "198.51.100.9" } })).json();
  try {
    const theirs: any = await call("dex-sniper/2.1");
    assert.equal(theirs.verdict, "SAFE");
    assert.match(theirs.note_from_the_developer, /token_safety \(12 calls this week\)/);
    assert.equal(((await call("someone-else/1")) as any).note_from_the_developer, undefined);
  } finally {
    server.close();
  }
  await refreshOutreach();
  assert.equal((await listOutreach()).length, 1, "a caller is greeted once, not every refresh");
});
