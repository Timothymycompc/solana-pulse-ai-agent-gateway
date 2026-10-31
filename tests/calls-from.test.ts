// The explorer says where every call came from (this site's toolbox, another web page, MCP, Telegram, the HTTP API),
// why it got its "Made by" word, a one-line input, and finds calls by anything shown on the row or in its drop-down.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pool, ensureSchema, noteOwnerNetwork, recordServiceUsage } from "../server/db";
import { hashIp } from "../server/meter";
import { fromOf, ownerCalls } from "../server/calls";

const db = new PGlite();
const OWNER_IP = "198.51.100.1", DEV_IP = "203.0.113.40";
const WALLET = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

before(async () => {
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params as any[]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  await ensureSchema();
  const run = (endpoint: string, ip: string, client: string, extra: Partial<Parameters<typeof recordServiceUsage>[0]> = {}) =>
    recordServiceUsage({ endpoint, method: "POST", status: 200, callerHash: hashIp(ip), client, ...extra });
  await run("/api/tools/balance", DEV_IP, "curl/8.5.0", { via: "free_call", input: { wallet: WALLET, network: "mainnet-beta" }, output: { sol: "1.5" }, cameFrom: "site" });
  await run("/api/tools/fee", DEV_IP, "curl/8.5.0", { via: "free_call", input: { tx: "AQAB" }, cameFrom: "glama.ai" });
  await run("/mcp/tools/token_safety", "192.0.2.7", "PayAI-Bazaar/1.0 (+https://docs.payai.network)", { status: 402, via: "x402" });
  await run("/api/tools/fee", OWNER_IP, "node", { via: "owner", input: { tx: "AQAB" } });
  await noteOwnerNetwork(hashIp(OWNER_IP));
});

test("every call names where it came from", async () => {
  const r = await ownerCalls({ hours: 24 });
  const by = (tool: string, ua: string) => r.rows.find((c) => c.tool === tool && c.caller.userAgent === ua)!;
  assert.deepEqual(by("balance", "curl/8.5.0").from, { channel: "site", label: "This site's toolbox", page: null });
  assert.equal(by("fee", "curl/8.5.0").from.label, "Web page on glama.ai");
  assert.equal(by("fee", "node").from.channel, "api");
  assert.equal(r.rows.find((c) => c.transport === "mcp")!.from.channel, "mcp");
  assert.equal(fromOf("telegram", null, "x", null).label, "Telegram bot");
});

test("why each call got its Made by word, and its input in one line", async () => {
  const r = await ownerCalls({ hours: 24 });
  assert.match(r.rows.find((c) => c.caller.userAgent === "node")!.madeByWhy, /owner key/);
  assert.match(r.rows.find((c) => c.madeBy === "bot")!.madeByWhy, /known directory/);
  assert.match(r.rows.find((c) => c.madeBy === "outside")!.madeByWhy, /does not prove a person/);
  assert.equal(r.rows.find((c) => c.tool === "balance")!.inputPreview, "5tzFki…uAi9 · mainnet-beta");
});

test("search finds calls by anything on the row: where from, who, result, input", async () => {
  assert.equal((await ownerCalls({ hours: 24, q: "glama" })).matching, 1);
  assert.equal((await ownerCalls({ hours: 24, q: "toolbox" })).matching, 1);
  assert.equal((await ownerCalls({ hours: 24, q: "asked to pay" })).matching, 1);
  assert.equal((await ownerCalls({ hours: 24, q: "owner key" })).matching, 1);
  assert.equal((await ownerCalls({ hours: 24, q: WALLET.slice(0, 10) })).matching, 1, "the full input is searched in the database");
});
