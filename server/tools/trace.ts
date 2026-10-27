// trace: follows a wallet's money through its recent transactions in one call, for "where did my funds go?" and
// "is this wallet being drained?". Built from Tim's real drain investigations (2026-10-26/27): a sweeper moved a
// victim's SOL out 7 seconds after it arrived with another wallet paying the fee, and a ~45-call Claude trace that
// needed explain_tx on every transaction just to see direction and size. Every flag comes from on-chain data and
// lists the transactions it rests on; nothing here says who someone is.
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { z } from "zod";
import { assertAddress, EXAMPLE_WALLET, formatUnits, isoTime, labelFor, lamportsToSol, NETWORK_DOC, SYSTEM_PROGRAM } from "./lib";
import { parsedTransaction, symbolsFor } from "./transactions";
import { ToolError, type ToolDef } from "./types";

// Money "passed through" when most of it (PASS_THROUGH_SHARE) left again within PASS_THROUGH_SECONDS of arriving.
// Timing alone flagged 14 of 40 ordinary active wallets on 2026-10-27; drains forward nearly all of it (Kunal: 2.032
// SOL in, 2.032 SOL out, 7 seconds).
const PASS_THROUGH_SECONDS = 120;
const PASS_THROUGH_SHARE = 90n; // percent
// Address-poisoning dust: tiny transfers from a lookalike of an address the wallet really paid.
const DUST_LAMPORTS = 1_000_000n; // 0.001 SOL
// Same first 3 and last 3 characters: the 5Gu1…rSH / 5Guz…rSH pair in Tim's 2026-10-27 trace matched on exactly 3. A random
// address matches a given one this way about once in 38 billion.
const LOOKALIKE_CHARS = 3;
// Left with less than this after money went out = emptied.
const EMPTY_LAMPORTS = 1_000_000n;

type TokenMove = { token: string; symbol: string | null; change: string; raw_change: string; decimals: number };
export type Flow = {
  tx_id: string; time: string | null; result: "success" | "failed"; direction: "in" | "out" | "both" | "none";
  sol_change: string; raw_sol_change: string; token_changes: TokenMove[]; counterparty: string | null;
  fee_payer: string; wallet_signed: boolean; programs: string[]; memo: string | null;
};
type Flag = { name: string; level: "warn" | "info"; detail: string; tx_ids: string[] };

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const lookalike = (a: string, b: string) =>
  a !== b && a.slice(0, LOOKALIKE_CHARS) === b.slice(0, LOOKALIKE_CHARS) && a.slice(-LOOKALIKE_CHARS) === b.slice(-LOOKALIKE_CHARS);

// One transaction, seen from the wallet: its own SOL and token changes, and the address on the other side (the one
// whose change mirrors the wallet's biggest move).
export function flowOf(wallet: string, tx: ParsedTransactionWithMeta, memo: string | null, symbols: Map<string, string | null>): Flow {
  const meta = tx.meta!;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const signers = tx.transaction.message.accountKeys.filter((k) => k.signer).map((k) => k.pubkey.toBase58());
  const i = keys.indexOf(wallet);
  const solDelta = i >= 0 ? BigInt(meta.postBalances[i]) - BigInt(meta.preBalances[i]) : 0n;
  const byOwner = new Map<string, { owner: string; mint: string; decimals: number; delta: bigint }>();
  const add = (b: any, sign: 1n | -1n) => {
    const owner = b.owner ?? keys[b.accountIndex];
    const k = `${owner}|${b.mint}`;
    const e = byOwner.get(k) ?? { owner, mint: b.mint, decimals: b.uiTokenAmount.decimals, delta: 0n };
    e.delta += sign * BigInt(b.uiTokenAmount.amount);
    byOwner.set(k, e);
  };
  (meta.preTokenBalances ?? []).forEach((b) => add(b, -1n));
  (meta.postTokenBalances ?? []).forEach((b) => add(b, 1n));
  const mine = [...byOwner.values()].filter((t) => t.owner === wallet && t.delta !== 0n);
  const tokenChanges = mine.map((t) => ({ token: t.mint, symbol: symbols.get(t.mint) ?? null, change: formatUnits(t.delta, t.decimals), raw_change: t.delta.toString(), decimals: t.decimals }));

  // The other side: for the wallet's largest token move, the owner with the opposite change in that token; otherwise
  // the account with the largest opposite SOL change (leaving out the fee payer's fee).
  let counterparty: string | null = null;
  const biggest = [...mine].sort((a, b) => (b.delta < 0n ? -b.delta : b.delta) > (a.delta < 0n ? -a.delta : a.delta) ? 1 : -1)[0];
  if (biggest) {
    const other = [...byOwner.values()].filter((t) => t.mint === biggest.mint && t.owner !== wallet && (t.delta > 0n) !== (biggest.delta > 0n) && t.delta !== 0n)
      .sort((a, b) => ((b.delta < 0n ? -b.delta : b.delta) > (a.delta < 0n ? -a.delta : a.delta) ? 1 : -1))[0];
    counterparty = other?.owner ?? null;
  }
  if (!counterparty && solDelta !== 0n) {
    const others = keys.map((account, j) => ({ account, delta: BigInt(meta.postBalances[j]) - BigInt(meta.preBalances[j]) + (j === 0 ? BigInt(meta.fee) : 0n) }))
      .filter((c) => c.account !== wallet && c.delta !== 0n && (c.delta > 0n) !== (solDelta > 0n))
      .sort((a, b) => ((b.delta < 0n ? -b.delta : b.delta) > (a.delta < 0n ? -a.delta : a.delta) ? 1 : -1));
    counterparty = others[0]?.account ?? null;
  }
  // The fee alone isn't money moving: a wallet that only paid its fee has direction "none".
  const feeOnly = keys[0] === wallet && solDelta === -BigInt(meta.fee);
  const ins = (!feeOnly && solDelta > 0n) || mine.some((t) => t.delta > 0n);
  const outs = (!feeOnly && solDelta < 0n) || mine.some((t) => t.delta < 0n);
  const programs = [...new Set(tx.transaction.message.instructions.map((ix) => ix.programId.toBase58()))].map((p) => labelFor(p) ?? p);
  return {
    tx_id: tx.transaction.signatures[0], time: isoTime(tx.blockTime), result: meta.err ? "failed" : "success",
    direction: ins && outs ? "both" : ins ? "in" : outs ? "out" : "none",
    sol_change: lamportsToSol(solDelta), raw_sol_change: solDelta.toString(), token_changes: tokenChanges, counterparty,
    fee_payer: keys[0], wallet_signed: signers.includes(wallet), programs, memo,
  };
}

// The patterns, each one a fact about these transactions with the transactions listed. Flows are newest first.
export function flagsFor(wallet: string, flows: Flow[], balanceNow: bigint | null): Flag[] {
  const flags: Flag[] = [];
  const ok = flows.filter((f) => f.result === "success");
  const outs = ok.filter((f) => f.direction === "out" || f.direction === "both");

  // Plain transfers out only: gasless swap services pay fees for swaps all the time (6 of 40 ordinary wallets when swaps
  // counted, 2026-10-27). A warning only as part of the drain pattern, set at the end.
  const sponsored = ok.filter((f) => f.direction === "out" && f.wallet_signed && f.fee_payer !== wallet);
  if (sponsored.length) {
    const payers = [...new Set(sponsored.map((f) => f.fee_payer))];
    flags.push({ name: "fee_paid_by_other_wallet", level: "info", tx_ids: sponsored.map((f) => f.tx_id),
      detail: `${sponsored.length} transaction${sponsored.length === 1 ? "" : "s"} moved money out of this wallet with its signature while ${payers.map(short).join(", ")} paid the fee. Sweeper bots that hold a stolen key do this so the wallet never needs SOL for fees; fee sponsors (paymasters, some wallets' gasless sends) do it too. If the owner doesn't use one, treat the key as compromised.` });
  }

  const chrono = [...ok].reverse();
  const quick: string[] = [];
  // How much of what arrived in `f` the outflow `g` sends on: SOL, or the same token.
  const forwards = (f: Flow, g: Flow) => {
    const inSol = BigInt(f.raw_sol_change), outSol = -BigInt(g.raw_sol_change);
    if (inSol > 0n && outSol * 100n >= inSol * PASS_THROUGH_SHARE) return true;
    return f.token_changes.some((t) => BigInt(t.raw_change) > 0n && g.token_changes.some((u) => u.token === t.token && -BigInt(u.raw_change) * 100n >= BigInt(t.raw_change) * PASS_THROUGH_SHARE));
  };
  for (let k = 0; k < chrono.length; k++) {
    const f = chrono[k];
    if (f.direction !== "in" || !f.time) continue;
    const next = chrono.slice(k + 1).find((g) => g.direction === "out" || g.direction === "both");
    if (next?.time && (Date.parse(next.time) - Date.parse(f.time)) / 1000 <= PASS_THROUGH_SECONDS && forwards(f, next)) quick.push(f.tx_id, next.tx_id);
  }
  if (quick.length) {
    const ids = [...new Set(quick)];
    flags.push({ name: "passed_straight_through", level: "info", tx_ids: ids,
      detail: `At least ${PASS_THROUGH_SHARE}% of money that arrived left again within ${PASS_THROUGH_SECONDS} seconds (${ids.length} transactions). Sweepers on a stolen key do this; so do exchange deposit addresses, bridges and bots, by design.` });
  }

  const paidTo = new Set(outs.map((f) => f.counterparty).filter((c): c is string => !!c));
  const poison = ok.filter((f) => f.direction === "in" && f.counterparty && BigInt(f.raw_sol_change) <= DUST_LAMPORTS
    && [...paidTo].some((p) => lookalike(f.counterparty!, p)));
  if (poison.length) {
    const pairs = [...new Set(poison.map((f) => { const real = [...paidTo].find((p) => lookalike(f.counterparty!, p))!; return `${f.counterparty} imitates ${real}`; }))];
    flags.push({ name: "lookalike_dust", level: "warn", tx_ids: poison.map((f) => f.tx_id),
      detail: `Address poisoning: tiny transfers came from addresses that start and end like ones this wallet has paid (${pairs.join("; ")}). Copying the address from history would send money to the imitation.` });
  }

  const lastOut = outs[0];
  if (lastOut && balanceNow !== null && balanceNow < EMPTY_LAMPORTS && flows[0]?.tx_id === lastOut.tx_id) {
    flags.push({ name: "emptied", level: "info", tx_ids: [lastOut.tx_id],
      detail: `The latest transaction moved money out and the wallet holds ${lamportsToSol(balanceNow)} SOL now.` });
  }
  // Alone, each sign has innocent causes (on 45 ordinary active wallets, 2026-10-27: pass-through 8, another wallet's
  // fee 7, emptied 3). Together, an emptied wallet that was swept is the drain pattern (Kunal, Adilak); that combination
  // was 1 of the 45. Only then are they warnings.
  const has = (name: string) => flags.some((f) => f.name === name);
  if (has("emptied") && (has("passed_straight_through") || has("fee_paid_by_other_wallet"))) {
    for (const f of flags) if (["emptied", "passed_straight_through", "fee_paid_by_other_wallet"].includes(f.name)) f.level = "warn";
  }
  return flags;
}

export const traceWallet: ToolDef = {
  name: "trace",
  title: "Where did the money go?",
  category: "wallets",
  benefit: { kind: "accuracy", text: "Shows each transaction's direction, amount and other side in one call, plus the drain patterns (sweeper fee payers, pass-through, address poisoning) with the transactions that show them, instead of a guess from a list of IDs." },
  useWhen: "Run when a wallet was drained or money went missing, or before trusting an address someone gave you: follows the money and flags sweeper, pass-through and lookalike-address patterns.",
  usage: '{"wallet": "<address>", "how_many": 25}',
  description: "Follows a wallet's money through its recent transactions: net SOL and token change and the other side of each, where most money went, and drain patterns with evidence.",
  inputs: { wallet: z.string(), how_many: z.number().int().min(1).max(50).optional().default(25), before: z.string().min(64).max(100).optional(), network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta") },
  inputDocs: [
    { name: "wallet", type: "string (base58 address)", required: true, lookingFor: "The wallet to follow.", whereToGet: "The user's wallet, or an address from their report. Never make one up." },
    { name: "how_many", type: "number", required: false, lookingFor: "How many recent transactions to read, newest first (1-50, default 25).", whereToGet: "More covers a longer stretch of time." },
    { name: "before", type: "string (signature)", required: false, lookingFor: "Start below this transaction, to page further back.", whereToGet: "next_before from the previous answer." },
    NETWORK_DOC,
  ],
  outputs: [
    { field: "wallet", type: "string", is: "The wallet that was followed.", howWorkedOut: "Your input, cleaned up." },
    { field: "summary", type: "string", is: "What happened, in plain words, with the flags.", howWorkedOut: "Built from the fields below." },
    { field: "period", type: "{ from, to }", is: "The time span the transactions cover (UTC).", howWorkedOut: "Oldest and newest block times." },
    { field: "sol_now", type: "string | null", is: "SOL the wallet holds now. null if it couldn't be read.", howWorkedOut: "getBalance." },
    { field: "flows[]", type: "array", is: "One entry per transaction, newest first: tx_id, time, result, direction (in / out / both / none), sol_change, token_changes (token, symbol, change, decimals), counterparty, fee_payer, wallet_signed, programs, memo.", howWorkedOut: "The wallet's own balance changes from each transaction's before/after balances; counterparty is the address whose change mirrors the wallet's biggest move; a fee-only change is direction none." },
    { field: "top_destinations[]", type: "array", is: "Where most money went (up to 3, tokens first): address, transactions, sol_out, tokens_out (token, symbol, amount), and kind (wallet that can sign, program-controlled address, program, token account, or unknown).", howWorkedOut: "Outgoing flows grouped by counterparty; kind from the account's owner and whether the address is on the ed25519 curve." },
    { field: "flags[]", type: "array", is: "Patterns found, each with name, level (warn / info), detail and the tx_ids that show it: fee_paid_by_other_wallet, passed_straight_through, lookalike_dust, emptied.", howWorkedOut: "Fixed rules on the flows (see each detail). None says who anyone is." },
    { field: "unread", type: "number", is: "Transactions listed for the wallet that couldn't be loaded; they're left out, never guessed.", howWorkedOut: "Signatures minus loaded transactions." },
    { field: "next_before", type: "string | null", is: "Pass as before to read the next, older page.", howWorkedOut: "The oldest transaction returned; null when there are no more." },
  ],
  notes: [
    "Facts, not accusations: each flag says what the transactions show and what else can cause it.",
    "No exchange or entity labels: Pulse has no verified source for them, so a destination is described only by what the chain says it is.",
  ],
  example: async () => ({ wallet: EXAMPLE_WALLET, how_many: 10 }),
  run: async ({ wallet, how_many, before, network }, ctx) => {
    const address = assertAddress(wallet, "wallet");
    const conn = ctx.connection(network);
    const key = new PublicKey(address);
    const [sigs, balance] = await Promise.all([
      conn.getSignaturesForAddress(key, { limit: how_many, ...(before ? { before } : {}) }, "confirmed"),
      conn.getBalance(key, "confirmed").then((b) => BigInt(b)).catch(() => null),
    ]);
    const txs: (ParsedTransactionWithMeta | null)[] = [];
    // Three at a time: more trips RPC rate limits (429s in the first test run).
    for (let k = 0; k < sigs.length; k += 3) txs.push(...await Promise.all(sigs.slice(k, k + 3).map((s) => parsedTransaction(conn, s.signature).catch(() => null))));
    // Matched by the transaction's own signature, not by position, so answers that arrive out of order can't be mixed up.
    const bySig = new Map(txs.filter((tx): tx is ParsedTransactionWithMeta => !!tx?.meta).map((tx) => [tx.transaction.signatures[0], tx]));
    const loaded = sigs.map((s) => ({ s, tx: bySig.get(s.signature) })).filter((x): x is { s: typeof sigs[number]; tx: ParsedTransactionWithMeta } => !!x.tx);
    if (sigs.length && !loaded.length) throw new ToolError(503, "Couldn't read this wallet's transactions right now.", "Retry in a moment.");
    const mints = [...new Set(loaded.flatMap((x) => [...(x.tx.meta!.preTokenBalances ?? []), ...(x.tx.meta!.postTokenBalances ?? [])].filter((b) => b.owner === address).map((b) => b.mint)))];
    const symbols = mints.length ? await symbolsFor(ctx)(mints) : new Map<string, string | null>();
    const flows = loaded.map((x) => flowOf(address, x.tx, x.s.memo ?? null, symbols));
    const unread = sigs.length - loaded.length;

    const dest = new Map<string, { address: string; transactions: number; sol_out: bigint; tokens: Map<string, { symbol: string | null; raw: bigint; decimals: number }> }>();
    for (const f of flows.filter((f) => f.result === "success" && f.counterparty && (f.direction === "out" || f.direction === "both"))) {
      const d = dest.get(f.counterparty!) ?? { address: f.counterparty!, transactions: 0, sol_out: 0n, tokens: new Map() };
      d.transactions++;
      if (BigInt(f.raw_sol_change) < 0n) d.sol_out += -BigInt(f.raw_sol_change);
      for (const t of f.token_changes.filter((t) => BigInt(t.raw_change) < 0n)) {
        const e = d.tokens.get(t.token) ?? { symbol: t.symbol, raw: 0n, decimals: t.decimals };
        e.raw += -BigInt(t.raw_change);
        d.tokens.set(t.token, e);
      }
      dest.set(f.counterparty!, d);
    }
    // Only addresses that actually received something from the wallet (a swap pool's own accounts can show up as the
    // other side with nothing sent to them).
    const top = [...dest.values()].filter((d) => d.sol_out > 0n || d.tokens.size)
      .sort((a, b) => (b.tokens.size - a.tokens.size) || (b.sol_out > a.sol_out ? 1 : b.sol_out < a.sol_out ? -1 : b.transactions - a.transactions)).slice(0, 3);
    const infos = await conn.getMultipleAccountsInfo(top.map((d) => new PublicKey(d.address)), "confirmed").catch(() => top.map(() => undefined));
    const kindOf = (addr: string, info: any) => {
      if (info === undefined) return "unknown";
      const onCurve = PublicKey.isOnCurve(new PublicKey(addr).toBytes());
      if (info === null) return onCurve ? "wallet (empty now)" : "program-controlled address (empty now)";
      if (info.executable) return "program";
      const owner = info.owner.toBase58();
      if (owner === SYSTEM_PROGRAM) return onCurve ? "wallet" : "program-controlled address";
      return labelFor(owner) ? `account owned by ${labelFor(owner)}` : "program-controlled account";
    };
    const topDestinations = top.map((d, k) => ({ address: d.address, transactions: d.transactions, sol_out: lamportsToSol(d.sol_out),
      tokens_out: [...d.tokens.entries()].map(([token, e]) => ({ token, symbol: e.symbol, amount: formatUnits(e.raw, e.decimals) })), kind: kindOf(d.address, infos[k]) }));
    const flags = flagsFor(address, flows, balance);

    const inSol = flows.filter((f) => f.result === "success").reduce((s, f) => s + (BigInt(f.raw_sol_change) > 0n ? BigInt(f.raw_sol_change) : 0n), 0n);
    const outSol = flows.filter((f) => f.result === "success").reduce((s, f) => s + (BigInt(f.raw_sol_change) < 0n ? -BigInt(f.raw_sol_change) : 0n), 0n);
    const times = flows.map((f) => f.time).filter((t): t is string => !!t);
    const summary = !flows.length ? "No transactions found for this wallet."
      : `${flows.length} transaction${flows.length === 1 ? "" : "s"}${times.length ? ` from ${times[times.length - 1]} to ${times[0]}` : ""}: ${lamportsToSol(inSol)} SOL in, ${lamportsToSol(outSol)} SOL out (fees included).`
        + (topDestinations[0] ? ` Most went to ${short(topDestinations[0].address)} (${topDestinations[0].kind}: ${[
          ...(topDestinations[0].sol_out !== "0" ? [`${topDestinations[0].sol_out} SOL`] : []),
          ...topDestinations[0].tokens_out.slice(0, 3).map((t) => `${t.amount} ${t.symbol ?? short(t.token)}`)].join(", ")}).` : "")
        + (flags.some((f) => f.level === "warn") ? ` Warning signs: ${flags.filter((f) => f.level === "warn").map((f) => f.name.replace(/_/g, " ")).join(", ")}.` : " None of the drain patterns Pulse checks for were found.")
        + (flags.some((f) => f.level === "info") ? ` Noted: ${flags.filter((f) => f.level === "info").map((f) => f.name.replace(/_/g, " ")).join(", ")}.` : "")
        + (unread ? ` ${unread} transaction${unread === 1 ? "" : "s"} couldn't be read and ${unread === 1 ? "is" : "are"} left out.` : "");
    return {
      wallet: address, network, summary, period: { from: times[times.length - 1] ?? null, to: times[0] ?? null },
      sol_now: balance === null ? null : lamportsToSol(balance), flows, top_destinations: topDestinations, flags,
      unread, next_before: sigs.length === how_many ? sigs[sigs.length - 1].signature : null,
    };
  },
};
