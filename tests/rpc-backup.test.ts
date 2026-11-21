import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { rpcFetch, RPC_COOLDOWN_MS, withTrail } from "../server/trail";

// Two local stand-ins: the main RPC (answers with whatever status `mainStatus` says) and the backup.
async function rpcPair() {
  const hits = { main: 0, backup: 0 };
  let mainStatus = 429;
  const start = (name: "main" | "backup") => new Promise<Server>((resolve) => {
    const s = createServer((_req, res) => {
      hits[name]++;
      const status = name === "main" ? mainStatus : 200;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(status === 200 ? JSON.stringify({ jsonrpc: "2.0", id: 1, result: name }) : JSON.stringify({ jsonrpc: "2.0", error: { code: 429, message: "max usage reached" } }));
    }).listen(0, "127.0.0.1", () => resolve(s));
  });
  const [main, backup] = await Promise.all([start("main"), start("backup")]);
  const url = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}/`;
  return { hits, mainUrl: url(main), backupUrl: url(backup), setMain: (s: number) => { mainStatus = s; }, close: () => { main.close(); backup.close(); } };
}

const body = { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash" }) };

test("main RPC answers 429: the same request goes to the backup, and the trail names the backup", async () => {
  const p = await rpcPair();
  try {
    const f = rpcFetch("Solana RPC", p.backupUrl);
    const { result, steps } = await withTrail(async () => (await f(p.mainUrl, body)).json());
    assert.equal(result.result, "backup");
    assert.deepEqual(steps.map((s) => [s.to, s.what, s.ok]), [["Solana RPC", "getLatestBlockhash", false], ["Solana RPC (backup)", "getLatestBlockhash", true]]);
  } finally { p.close(); }
});

test("after a 429 the main RPC is skipped for the cooldown, then tried again", async () => {
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
