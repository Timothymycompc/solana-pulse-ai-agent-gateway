import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { rpcFetch, RPC_COOLDOWN_MS, withTrail } from "../server/trail";

// Two local stand-ins: the main RPC (answers with whatever status `mainStatus` says) and the backup.
async function rpcPair() {
  const hits = { main: 0, backup: 0 };
  let mainStatus = 429;
  let mainMessage = "max usage reached";
  let inFlight = 0, maxInFlight = 0, mainDelayMs = 0;
  const start = (name: "main" | "backup") => new Promise<Server>((resolve) => {
    const s = createServer(async (_req, res) => {
      hits[name]++;
      if (name === "main") { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); }
      if (name === "main" && mainDelayMs) await new Promise((r) => setTimeout(r, mainDelayMs));
      if (name === "main") inFlight--;
      const status = name === "main" ? mainStatus : 200;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(status === 200 ? JSON.stringify({ jsonrpc: "2.0", id: 1, result: name }) : JSON.stringify({ jsonrpc: "2.0", error: { code: 429, message: mainMessage } }));
    }).listen(0, "127.0.0.1", () => resolve(s));
  });
  const [main, backup] = await Promise.all([start("main"), start("backup")]);
  const url = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}/`;
  return { hits, mainUrl: url(main), backupUrl: url(backup), setMain: (s: number) => { mainStatus = s; },
    setMessage: (m: string) => { mainMessage = m; }, setDelay: (ms: number) => { mainDelayMs = ms; }, maxInFlight: () => maxInFlight, close: () => { main.close(); backup.close(); } };
}

const body = { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash" }) };

test("main RPC out of credits (429 max usage): the same request goes to the backup, and the trail names the backup", async () => {
  const p = await rpcPair();
  try {
    const f = rpcFetch("Solana RPC", p.backupUrl);
    const { result, steps } = await withTrail(async () => (await f(p.mainUrl, body)).json());
    assert.equal(result.result, "backup");
    assert.deepEqual(steps.map((s) => [s.to, s.what, s.ok]), [["Solana RPC", "getLatestBlockhash", false], ["Solana RPC (backup)", "getLatestBlockhash", true]]);
  } finally { p.close(); }
});

test("after a credits-used-up 429 the main RPC is skipped for the cooldown, then tried again", async () => {
  const p = await rpcPair();
  try {
    let clock = 1_000;
    const f = rpcFetch("Solana RPC", p.backupUrl, () => clock);
    await f(p.mainUrl, body);
    assert.deepEqual(p.hits, { main: 1, backup: 1 });
    clock += RPC_COOLDOWN_MS - 1;
    await f(p.mainUrl, body);
    assert.deepEqual(p.hits, { main: 1, backup: 2 }, "main skipped during cooldown");
    p.setMain(200);
    clock += 2;
    assert.equal((await (await f(p.mainUrl, body)).json()).result, "main");
    assert.deepEqual(p.hits, { main: 2, backup: 2 }, "main back after cooldown");
  } finally { p.close(); }
});

test("main RPC fine or other errors: the backup is never called", async () => {
  const p = await rpcPair();
  try {
    const f = rpcFetch("Solana RPC", p.backupUrl);
    p.setMain(200);
    assert.equal((await (await f(p.mainUrl, body)).json()).result, "main");
    p.setMain(500);
    assert.equal((await f(p.mainUrl, body)).status, 500);
    assert.equal(p.hits.backup, 0);
  } finally { p.close(); }
});

test("no backup URL: behaves as before (429 passed through)", async () => {
  const p = await rpcPair();
  try {
    assert.equal((await rpcFetch("Solana RPC")(p.mainUrl, body)).status, 429);
    assert.equal(p.hits.backup, 0);
  } finally { p.close(); }
});

// 2026-11-26: a burst from token_traders got a per-second 429 from Helius, and the old code then sent ALL traffic to the
// public RPC for 2 minutes, which rate-limited too ("Connection rate limits exceeded"), so tools failed in bursts.
test("per-second 429: waits, asks the main RPC again, and does not switch everything to the backup", async () => {
  const p = await rpcPair();
  try {
    p.setMessage("Too many requests for a specific RPC call");
    const slept: number[] = [];
    const f = rpcFetch("Solana RPC", p.backupUrl, Date.now, { sleep: async (ms) => { slept.push(ms); } });
    assert.equal((await (await f(p.mainUrl, body)).json()).result, "backup", "still 429 after the retry: this one request uses the backup");
    assert.deepEqual(p.hits, { main: 2, backup: 1 });
    assert.equal(slept.length, 1);
    p.setMain(200);
    assert.equal((await (await f(p.mainUrl, body)).json()).result, "main", "next request goes straight to the main RPC, no cooldown");
    assert.deepEqual(p.hits, { main: 3, backup: 1 });
  } finally { p.close(); }
});

test("per-second 429 that clears on the retry: answered by the main RPC, backup never called", async () => {
  const p = await rpcPair();
  try {
    p.setMessage("Connection rate limits exceeded");
    const f = rpcFetch("Solana RPC", p.backupUrl, Date.now, { sleep: async () => { p.setMain(200); } });
    const { result, steps } = await withTrail(async () => (await f(p.mainUrl, body)).json());
    assert.equal(result.result, "main");
    assert.equal(p.hits.backup, 0);
    assert.deepEqual(steps.map((s) => [s.to, s.ok]), [["Solana RPC", false], ["Solana RPC", true]]);
  } finally { p.close(); }
});

test("at most maxInFlight requests wait on the main RPC at once; the rest queue and all get answered", async () => {
  const p = await rpcPair();
  try {
    p.setMain(200);
    p.setDelay(30);
    const f = rpcFetch("Solana RPC", p.backupUrl, Date.now, { maxInFlight: 3 });
    const answers = await Promise.all(Array.from({ length: 10 }, async () => (await (await f(p.mainUrl, body)).json()).result));
    assert.deepEqual(answers, Array(10).fill("main"));
    assert.equal(p.maxInFlight(), 3);
  } finally { p.close(); }
});
