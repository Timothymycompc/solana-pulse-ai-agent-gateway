// Measures "how it happened" on ordinary active wallets: fee payers from a recent mainnet block, traced live. Most of
// these weren't drained, so every method found is either a real finding or a false alarm to look at by hand.
// Run: SOLANA_MAINNET_RPC_URL=... npx tsx tests/measure-how.ts [wallets=30]   Read-only.
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { traceWallet } from "../server/tools/trace";
import { recordingContext } from "./helpers/replay";

const RPC = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta");
const want = Number(process.argv[2] || 30);
const conn = new Connection(RPC, "confirmed");
const slot = await conn.getSlot("confirmed");
const wallets = new Set<string>();
for (let s = slot - 100; wallets.size < want * 3 && s > slot - 130; s--) {
  const b: any = await (conn as any)._rpcRequest("getBlock", [s, { encoding: "json", maxSupportedTransactionVersion: 1, transactionDetails: "accounts", rewards: false, commitment: "confirmed" }]).catch(() => null);
  for (const t of b?.result?.transactions ?? []) {
    const payer = t.transaction.accountKeys?.[0]?.pubkey ?? t.transaction.accountKeys?.[0];
    if (typeof payer === "string" && PublicKey.isOnCurve(new PublicKey(payer).toBytes())) wallets.add(payer);
  }
}
// Every third, so one busy bot doesn't fill the sample.
const sample = [...wallets].filter((_, k) => k % 3 === 0).slice(0, want);
const tally: Record<string, number> = {};
let found = 0, done = 0, failed = 0, unknown = 0, noted = 0;
for (const w of sample) {
  try {
    const { ctx } = recordingContext(RPC);
    const out: any = await traceWallet.run(z.object(traceWallet.inputs).parse({ wallet: w, how_many: 25 }), ctx);
    const h = out.report.how_it_happened;
    done++;
    if (h.found) found++;
    if (h.unknown) unknown++;
    if (h.noted.length) noted++;
    for (const m of h.methods) tally[m.name] = (tally[m.name] ?? 0) + 1;
    console.log(`${w}  ${h.found ? h.methods.map((m: any) => `${m.name}[${m.tx_ids.slice(0, 2).map((t: string) => t.slice(0, 10)).join(",")}]`).join(" ") : "-"}${h.noted.length ? `  noted:${h.noted.length}` : ""}${h.unknown ? "  UNKNOWN-PART" : ""}`);
  } catch (e: any) { failed++; console.log(`${w}  ERROR ${String(e?.message ?? e).slice(0, 80)}`); }
}
console.log(JSON.stringify({ measured: new Date().toISOString(), wallets: done, failed, found, methods: tally, with_unknown_part: unknown, with_noted: noted }));
