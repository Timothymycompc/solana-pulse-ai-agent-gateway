// What did each coin's creator do with the supply right after launch? Reads the creator's token account history for
// that coin from the start, and lists every wallet the creator sent coins to in the first minutes: when, how much.
// Usage: SOLANA_MAINNET_RPC_URL=... npx tsx benchmark/creator-split/probe.ts <mint>:<creator> ...  (writes out/<mint>.json)
import fs from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const conn = new Connection(process.env.SOLANA_MAINNET_RPC_URL!, "confirmed");
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probe(mint: string, creator: string) {
  const info = await conn.getAccountInfo(new PublicKey(mint));
  const program = info!.owner;
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(creator), true, program);
  let sigs: any[] = [], before: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await conn.getSignaturesForAddress(ata, { limit: 1000, before });
    sigs.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  sigs = sigs.filter((s) => !s.err).reverse(); // oldest first
  const first = sigs.slice(0, 150);
  const txs: any[] = [];
  for (let i = 0; i < first.length; i += 10) {
    const got = await Promise.all(first.slice(i, i + 10).map((s) => conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null)));
    txs.push(...got); await pause(150);
  }
  const launch = first[0]?.blockTime ?? null;
  const sends: { t: number; to: string; amount: string; sig: string }[] = [];
  for (const [i, tx] of txs.entries()) {
    if (!tx?.meta) continue;
    const bal = (arr: any[]) => new Map<string, bigint>(arr.filter((b) => b.mint === mint).map((b) => [b.owner as string, BigInt(b.uiTokenAmount.amount)]));
    const pre = bal(tx.meta.preTokenBalances ?? []), post = bal(tx.meta.postTokenBalances ?? []);
    const creatorDown = (pre.get(creator) ?? 0n) - (post.get(creator) ?? 0n);
    if (creatorDown <= 0n) continue;
    for (const [owner, after] of post) {
      if (owner === creator) continue;
      const up = after - (pre.get(owner) ?? 0n);
      if (up > 0n) sends.push({ t: (tx.blockTime ?? 0) - (launch ?? 0), to: owner, amount: up.toString(), sig: first[i].signature });
    }
  }
  const out = { mint, creator, program: program.toBase58(), creator_token_account: ata.toBase58(), txs_on_account: sigs.length, launch_unix: launch, read: first.length, sends };
  fs.mkdirSync("benchmark/creator-split/out", { recursive: true });
  fs.writeFileSync(`benchmark/creator-split/out/${mint}.json`, JSON.stringify(out, null, 1));
  const amounts = new Map<string, number>(); for (const s of sends) amounts.set(s.amount, (amounts.get(s.amount) ?? 0) + 1);
  const top = [...amounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const span = sends.length ? `${sends[0].t}s..${sends[sends.length - 1].t}s after launch` : "-";
  console.log(`${mint.slice(0, 4)} creator ${creator.slice(0, 6)}: ${sigs.length} txs on its token account; first ${first.length} read; ${sends.length} sends to ${new Set(sends.map((s) => s.to)).size} wallets (${span}); most common amounts: ${top.map(([a, n]) => `${a} x${n}`).join(", ")}`);
}
for (const arg of process.argv.slice(2)) { const [m, c] = arg.split(":"); try { await probe(m, c); } catch (e: any) { console.log(`${m.slice(0, 4)}: ${e.message}`); } }
