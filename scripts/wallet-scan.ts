// Wallet scan for the trading desk (2026-11-09): runs Solana Pulse's token_traders reading (server/tools/traders.ts) on many
// coins and saves every wallet's result per coin, so we can ask: are there wallets that make money on new coins again and
// again, and do they keep doing it on LATER coins (skill), or only on the coins we picked them from (luck)?
// Input: coins.json [{ mint, pool, at, period }]. Output: <out>/wallets-<n>.jsonl, one line per coin (checkpointed).
// Env: SOLANA_MAINNET_RPC_URL, RPS (default 8), HOURS (default 2), MAX_TX (default 1500). Read-only: nothing is signed.
// Run: npx tsx scripts/wallet-scan.ts coins.json out
import fs from "fs";
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import { parsedTransaction } from "../server/tools/transactions";
import { tradeOf, walletsFrom, type Trade } from "../server/tools/traders";

const [coinsFile, outDir] = process.argv.slice(2);
const RPS = Number(process.env.RPS ?? 8), HOURS = Number(process.env.HOURS ?? 2), MAX_TX = Number(process.env.MAX_TX ?? 1500);
const conn = new Connection(process.env.SOLANA_MAINNET_RPC_URL!, { commitment: "confirmed", disableRetryOnRateLimit: false });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One RPC call at a time slot: RPS calls a second at most, shared by everything below.
let next = 0;
async function paced<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now(), at = Math.max(now, next); next = at + 1000 / RPS;
  if (at > now) await sleep(at - now);
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e: any) {
      if (i >= 4 || !/429|503|502|timeout|ECONNRESET|fetch failed/i.test(String(e?.message ?? e))) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

async function scan(c: { mint: string; pool: string; at: number; period: string }) {
  const sigs: any[] = []; let before: string | undefined, startReached = false;
  for (let p = 0; p < 40; p++) {
    const page = await paced(() => conn.getSignaturesForAddress(new PublicKey(c.pool), { limit: 1000, ...(before ? { before } : {}) }, "confirmed"));
    sigs.push(...page);
    if (page.length < 1000) { startReached = true; break; }
    before = page[page.length - 1].signature;
  }
  sigs.reverse();
  if (!sigs.length) return { ...c, error: "no transactions" };
  const first = sigs[0], launch = first.blockTime ?? null, end = launch !== null ? launch + HOURS * 3600 : Infinity;
  const inWindow = sigs.filter((s) => !s.err && (s.blockTime ?? 0) <= end), toRead = inWindow.slice(0, MAX_TX);
  const trades: Trade[] = []; let unread = 0, creator: string | null = null;
  const firstTx = await paced(() => parsedTransaction(conn, first.signature)).catch(() => null);
  creator = firstTx?.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58() ?? null;
  await Promise.all(toRead.map(async (s) => {
    const tx = await paced(() => parsedTransaction(conn, s.signature)).catch(() => null);
    if (!tx) { unread++; return; }
    const t = tradeOf(tx, c.mint, s.signature); if (t) trades.push(t);
  }));
  trades.sort((a, b) => a.slot - b.slot);
  const wallets = walletsFrom(trades, { slot: first.slot, time: launch, creator });
  const lastPrice = (() => { const t = [...trades].reverse().find((x) => x.tokens > 0); return t ? Math.abs(t.sol) / t.tokens : null; })();
  return { ...c, launch, start_reached: startReached, window_cut: inWindow.length > toRead.length, read: toRead.length, unread, trades: trades.length,
    window_end: toRead.length ? toRead[toRead.length - 1].blockTime : null, last_price_sol: lastPrice, creator, wallets };
}

async function main() {
  const coins = JSON.parse(fs.readFileSync(coinsFile, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `wallets-${path.basename(coinsFile, ".json")}.jsonl`);
  const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).mint) : []);
  const started = Date.now(); let n = 0;
  for (const c of coins) {
    if (done.has(c.mint)) continue;
    let row: any;
    try { row = await scan(c); } catch (e: any) { row = { ...c, error: String(e?.message ?? e).slice(0, 200) }; }
    fs.appendFileSync(file, JSON.stringify(row) + "\n"); n++;
    console.log(`${done.size + n}/${coins.length} ${c.mint.slice(0, 6)} read ${row.read ?? 0} trades ${row.trades ?? 0} wallets ${row.wallets?.length ?? 0}${row.error ? ` ERROR ${row.error}` : ""} (${((Date.now() - started) / 60000).toFixed(1)} min)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
