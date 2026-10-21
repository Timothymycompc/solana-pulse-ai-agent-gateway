// The owner dashboard's Calls tab against a real Postgres (PGlite, in memory): every tool call with its caller, whether
// the input was the site's example, the caller's own or empty, filters, search, paging and a call's full answer.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema, noteOwnerNetwork, recordServedExample, recordServiceUsage } from "../server/db";
import { hashIp } from "../server/meter";
import { ownerCall, ownerCalls } from "../server/calls";

const db = new PGlite();
const OWNER_IP = "198.51.100.1", DEV_IP = "203.0.113.40", CRAWLER_IP = "203.0.113.50";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WALLET = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
  const run = (endpoint: string, ip: string, client: string, extra: Partial<Parameters<typeof recordServiceUsage>[0]> = {}) =>
    recordServiceUsage({ endpoint, method: "POST", status: 200, callerHash: hashIp(ip), client, ...extra });

  // The site handed out this example; a developer ran it as-is (keys in another order), then typed their own token.
  await recordServedExample("balance", { wallet: WALLET, network: "mainnet-beta" });
  await run("/api/tools/balance", DEV_IP, "curl/8.5.0", { via: "free_call", input: { network: "mainnet-beta", wallet: WALLET }, output: { sol: "1.5" } });
  await run("/api/tools/token_safety", DEV_IP, "curl/8.5.0", { via: "free_call", input: { token: "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump" },
    output: { verdict: "AVOID", summary: "Mint authority is still on.", checks: [] } });
  await run("/api/tools/check_tx", DEV_IP, "curl/8.5.0", { status: 400, via: "free_call", input: { tx: "invalid" }, output: { error: "tx is not valid base64." } });
  // A crawler on one network claiming to be Chrome on Windows and Safari on a Mac, sending empty inputs.
  await run("/api/tools/fee", CRAWLER_IP, WIN, { via: "free_call", input: {} });
  await run("/api/tools/check_tx", CRAWLER_IP, MAC, { status: 402, via: "x402" });
  // A directory bot, and the owner with the owner key from their own network.
  await run("/mcp/tools/token_safety", "192.0.2.7", "PayAI-Bazaar/1.0 (+https://docs.payai.network)", { status: 402, via: "x402" });
  await run("/api/tools/fee", OWNER_IP, "node", { via: "owner", input: { tx: "AQAB" } });
  await noteOwnerNetwork(hashIp(OWNER_IP));
});

test("every call in the period, newest first, with what kind of input it was", async () => {
  const r = await ownerCalls({ hours: 24 });
  assert.equal(r.summary.calls, 7);
  assert.equal(r.rows[0].tool, "fee");
  const balance = r.rows.find((c) => c.tool === "balance")!;
  assert.equal(balance.inputKind, "example", "the served example matches even with its keys in another order");
  assert.equal(r.rows.find((c) => c.tool === "token_safety" && c.caller.name === "curl")!.inputKind, "own");
  assert.deepEqual(r.summary.byInput, { own: 3, example: 1, empty: 3 });
  const verdict = r.rows.find((c) => c.verdict === "AVOID")!;
  assert.equal(verdict.headline, "AVOID: Mint authority is still on.");
  assert.equal(r.rows.find((c) => c.tool === "check_tx" && c.status === 400)!.headline, "tx is not valid base64.");
});

test("callers: the owner, bots, and one network pretending to be several browsers", async () => {
  const r = await ownerCalls({ hours: 24 });
  assert.equal(r.rows.find((c) => c.caller.userAgent === "node")!.caller.kind, "you");
  assert.equal(r.rows.find((c) => c.transport === "mcp")!.caller.kind, "bot");
  const crawler = r.rows.filter((c) => c.caller.userAgent === WIN || c.caller.userAgent === MAC);
  assert.equal(crawler.length, 2);
  assert.ok(crawler.every((c) => c.caller.rotatesBrowsers));
  assert.equal(r.summary.rotatingNetworks, 1);
  assert.ok(!r.rows.find((c) => c.caller.name === "curl")!.caller.rotatesBrowsers);
});

test("filters, search and paging", async () => {
  assert.equal((await ownerCalls({ hours: 24, input: "own" })).matching, 3);
  assert.equal((await ownerCalls({ hours: 24, status: "payment" })).matching, 2);
  assert.equal((await ownerCalls({ hours: 24, status: "error" })).matching, 1);
  assert.equal((await ownerCalls({ hours: 24, kind: "bot" })).matching, 1);
  assert.equal((await ownerCalls({ hours: 24, tool: "fee" })).matching, 2);
  const searched = await ownerCalls({ hours: 24, q: "FeR8VB" });
  assert.equal(searched.matching, 1);
  assert.equal(searched.summary.calls, 1, "the chip counts follow the search");
  assert.equal((await ownerCalls({ hours: 24, q: "100%_" })).matching, 0, "search treats % and _ as plain text");

  const first = await ownerCalls({ hours: 24, limit: 4 });
  assert.equal(first.rows.length, 4);
  assert.ok(first.nextBefore);
  const second = await ownerCalls({ hours: 24, limit: 4, before: first.nextBefore! });
  assert.equal(second.rows.length, 3);
  assert.equal(second.nextBefore, null);
  assert.ok(second.rows.every((c) => c.id < first.nextBefore!));
  // Live updates ask only for calls newer than the newest one shown.
  const newest = first.rows[0].id;
  assert.equal((await ownerCalls({ hours: 24, after: newest })).rows.length, 0);
  assert.equal((await ownerCalls({ hours: 24, after: newest - 2 })).rows.length, 2);
});

test("grouped by network, caller or tool, sorted any way, and each group opens its own calls", async () => {
  const byNet = await ownerCalls({ hours: 24, group: "network", sort: "calls" });
  assert.equal(byNet.group, "network");
  const dev = byNet.groups!.find((g) => g.names.includes("curl"))!;
  assert.equal(dev.calls, 3);
  assert.equal(dev.own, 2);
  assert.equal(dev.examples, 1);
  assert.equal(dev.errors, 1);
  assert.deepEqual(dev.tools.map((t: any) => t.tool).sort(), ["balance", "check_tx", "token_safety"]);
  const crawler = byNet.groups!.find((g) => g.rotatesBrowsers)!;
  assert.equal(crawler.calls, 2);
  assert.deepEqual(byNet.groups!.find((g) => g.key.startsWith("(no network"))!.filter, { kind: "bot" });
  // Opening a group passes its filter back.
  assert.equal((await ownerCalls({ hours: 24, ...dev.filter })).matching, 3);

  const byCaller = await ownerCalls({ hours: 24, group: "caller", sort: "own" });
  assert.equal(byCaller.groups![0].label, "curl", "sorted by most own inputs");
  assert.equal((await ownerCalls({ hours: 24, ...byCaller.groups![0].filter })).matching, 3);

  const byTool = await ownerCalls({ hours: 24, group: "tool", sort: "recent" });
  assert.equal(byTool.groups![0].key, "fee", "the most recently called tool first");
  assert.equal((await ownerCalls({ hours: 24, group: "nonsense" })).groups, null);
});

test("one call's full input and output", async () => {
  const r = await ownerCalls({ hours: 24, q: "FeR8VB" });
  const call = await ownerCall(r.rows[0].id);
  assert.deepEqual(call!.input, { token: "FeR8VBqNRSUD5NtXAj2n3j1dAHkZHfyDktKuLXD4pump" });
  assert.equal((call!.output as any).verdict, "AVOID");
  assert.equal(await ownerCall(999_999), null);
});
