// Did the creator split the supply across many wallets right after launch? On Nov 1 2026 three new tokens a trader
// bought (AODF 4AWL…pump, AODF pfQB…pump, XTO VWmj…pump) all started the same way: 3 to 10 minutes after launch the
// creator sent exactly 396,550 tokens each to about 445 wallets within 2 to 27 seconds, so no wallet looked big (top 10
// holders 0.5-0.6%). All three were dumped 99% hours later, in one minute each. The 5 tokens the same trader bought that
// weren't dumped: their creators sent to 1 wallet each in the first 30 minutes (one older token, GATO, sent round
// amounts to 13 wallets, spread over 62 days). Data: benchmark/creator-split (probe.ts and its out/ files).
//
// Two levels, so a creator who varies the amounts is still caught:
//   fail: SPLIT_WALLETS or more wallets got the exact same amount from the creator within SPLIT_WINDOW_S seconds, in the
//         first SPLIT_AFTER_LAUNCH_S seconds after launch.
//   warn: SPLIT_WALLETS or more wallets got tokens from the creator within that window, in different amounts.
// Limits: it reads the creator's own token account; a scammer who buys and splits from another wallet isn't caught here
// (RugCheck's insider networks may still see it). Set from 8 tokens, so it is measured on every token the Trade Desk sees.
import { PublicKey, type Connection, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { formatUnits } from "./lib";
import { parsedTransaction } from "./transactions";

export const SPLIT_WALLETS = 10;
export const SPLIT_WINDOW_S = 60;
export const SPLIT_AFTER_LAUNCH_S = 30 * 60;
const MAX_PAGES = 3; // 3,000 transactions on the creator's token account; past that, launch can't be reached: unknown
const READ_TXS = 40; // the first transactions after launch; each split transaction sends to ~3 wallets

export type Send = { t: number; to: string; amount: string }; // t: seconds after launch; amount: raw units
// capped: the first READ_TXS transactions were read and there were more, so wallet counts are "at least".
export type SplitRead = { sends: Send[]; readToLaunch: boolean; capped?: boolean };

// The creator's sends of this token in the first 30 minutes, from its token account's history. null: couldn't read.
export async function creatorSends(conn: Connection, mint: string, creator: string, program: PublicKey, launchUnix: number | null): Promise<SplitRead | null> {
  try {
    const account = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(creator), true, program);
    let sigs: { signature: string; blockTime?: number | null; err: unknown }[] = [];
    let before: string | undefined, readToLaunch = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const got = await conn.getSignaturesForAddress(account, { limit: 1000, before }, "confirmed");
      sigs.push(...got);
      if (got.length < 1000) { readToLaunch = true; break; }
      before = got[got.length - 1].signature;
    }
    if (!readToLaunch) return { sends: [], readToLaunch };
    sigs = sigs.filter((s) => !s.err && typeof s.blockTime === "number").reverse();
    if (!sigs.length) return { sends: [], readToLaunch };
    const launch = launchUnix ?? sigs[0].blockTime!;
    const early = sigs.filter((s) => s.blockTime! - launch <= SPLIT_AFTER_LAUNCH_S).slice(0, READ_TXS);
    if (!early.length) return { sends: [], readToLaunch };
    // One read per transaction, 10 at a time, each allowed to fail on its own. A batched getParsedTransactions throws
    // for the whole batch when one entry fails (a version 1 transaction, or an RPC plan without batch requests), which
    // left live XTO "unknown" on Nov 2 2026 while the per-transaction probe read all 445 sends.
    const txs: (ParsedTransactionWithMeta | null)[] = [];
    for (let i = 0; i < early.length; i += 10) {
      txs.push(...(await Promise.all(early.slice(i, i + 10).map((s) => parsedTransaction(conn, s.signature).catch(() => null)))));
    }
    if (!txs.some(Boolean)) return null; // none could be read: unknown, not "no sends"
    const sends: Send[] = [];
    for (const tx of txs) {
      if (!tx?.meta) continue;
      const bal = (arr: any[] | null | undefined) => new Map<string, bigint>((arr ?? []).filter((b) => b.mint === mint && b.owner).map((b) => [b.owner as string, BigInt(b.uiTokenAmount.amount)]));
      const pre = bal(tx.meta.preTokenBalances), post = bal(tx.meta.postTokenBalances);
      if ((pre.get(creator) ?? 0n) - (post.get(creator) ?? 0n) <= 0n) continue;
      for (const [owner, after] of post) {
        const up = after - (pre.get(owner) ?? 0n);
        if (owner !== creator && up > 0n) sends.push({ t: (tx.blockTime ?? launch) - launch, to: owner, amount: up.toString() });
      }
    }
    return { sends, readToLaunch, capped: sigs.filter((s) => s.blockTime! - launch <= SPLIT_AFTER_LAUNCH_S).length > READ_TXS };
  } catch {
    return null;
  }
}

export function creatorSplitCheck(read: SplitRead | null, decimals: number) {
  if (!read || !read.readToLaunch) return { result: "info" as const, detail: "Unknown whether the creator split the supply after launch: its token account's history couldn't be read back to launch." };
  const early = read.sends.filter((s) => s.t <= SPLIT_AFTER_LAUNCH_S).sort((a, b) => a.t - b.t);
  // The 60-second window with the most different wallets.
  let best: Send[] = [];
  for (let i = 0, j = 0; i < early.length; i++) {
    while (early[i].t - early[j].t > SPLIT_WINDOW_S) j++;
    const win = early.slice(j, i + 1);
    if (new Set(win.map((s) => s.to)).size > new Set(best.map((s) => s.to)).size) best = win;
  }
  const wallets = new Set(best.map((s) => s.to)).size;
  if (!wallets) return { result: "pass" as const, detail: "The creator didn't send this token to other wallets in the first 30 minutes after launch." };
  if (wallets < SPLIT_WALLETS) return { result: "pass" as const, detail: `The creator didn't split the supply across many wallets after launch (at most ${wallets} wallet${wallets === 1 ? "" : "s"} in any minute of the first 30).` };
  const byAmount = new Map<string, Set<string>>();
  for (const s of best) (byAmount.get(s.amount) ?? byAmount.set(s.amount, new Set()).get(s.amount)!).add(s.to);
  const [amount, same] = [...byAmount.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  const secs = Math.max(1, best[best.length - 1].t - best[0].t), mins = Math.max(0, Math.round(best[0].t / 60));
  const when = `within ${secs} second${secs === 1 ? "" : "s"}, ${mins} minute${mins === 1 ? "" : "s"} after launch`;
  const atLeast = read.capped ? "at least " : "";
  if (same.size >= SPLIT_WALLETS) return { result: "fail" as const, detail: `The creator sent exactly ${Number(formatUnits(BigInt(amount), decimals)).toLocaleString("en-US", { maximumFractionDigits: decimals })} tokens each to ${atLeast}${same.size} wallets ${when}. Splitting the supply into equal parts hides how much one person holds; three tokens that started this way were dumped 99% the same day (AODF, XTO, Nov 2026).` };
  return { result: "warn" as const, detail: `The creator sent tokens to ${atLeast}${wallets} different wallets ${when}, in different amounts. That can hide how much one person holds.` };
}
