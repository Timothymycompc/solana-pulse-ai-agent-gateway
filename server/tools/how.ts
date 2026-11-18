// How a wallet lost control, for trace's "how it happened". The sweep flags in trace.ts say THAT money left; these say
// what gave someone else the power to take it, from the wallet's own signed history and the chain's state now.
// Built 2026-11-17 after Drain Check (Pulse trace) got its first real users and Tim asked "does it say how they got
// drained?". Each rule matches a documented Solana drain (SolPhishHunter's "account authority transfer" category; the
// SlowMist Dec 2025 owner-permission case, $3M+; delegate-approval drainer kits) and is narrowed by what ordinary
// transactions do, measured on real mainnet blocks the same day:
//  - Approvals: swaps and launchpads approve a program-controlled address (off the ed25519 curve) all the time and often
//    revoke it in the same transaction (51 approvals to non-signers in 25 blocks; in 60 more blocks, 21,412
//    transactions, none to an on-curve wallet left open).
//    Only an approval to an address ON the curve (a wallet someone holds the key to) that wasn't revoked in the same
//    transaction is a warning; to a program-controlled address it is noted.
//  - Owner changes: launchpads hand freshly created token accounts to their programs in the same transaction (4 in 25
//    blocks, all created in that transaction; 0 on accounts that held tokens in the next 60 blocks). Only an account
//    that already held tokens before the transaction counts.
//  - Reassignment: a normal wallet is owned by the System Program; a signed Assign moves it to another program, which
//    wallet previews don't show ("the scam a wallet simulator cannot see"). Checked in history and in the state now.
// Measured 2026-11-18 (tests/measure-how.ts): 30 active wallets from a live block, traced live: no attack method on
// any of them; 1 got the neutral "signed with this wallet's own key" (a big send, already shown before this), 1 had an
// approval to a program-controlled address, noted only. 0 failed, 0 with an unreadable part.
import { PublicKey, type Connection, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { formatUnits, SYSTEM_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./lib";

export type Grant = {
  name: "approval_given" | "owner_changed" | "wallet_reassigned";
  level: "warn" | "info"; tx_id: string; time: string | null;
  account: string; to: string; to_kind: "wallet" | "program-controlled address" | "program"; mint: string | null; amount: string | null;
};
export type OpenApproval = { account: string; mint: string; delegate: string; delegate_kind: "wallet" | "program-controlled address"; amount: string; level: "warn" | "info" };
export type NowState = { wallet_owner: string | null; open_approvals: OpenApproval[] | null };

const onCurve = (a: string) => { try { return PublicKey.isOnCurve(new PublicKey(a).toBytes()); } catch { return false; } };
const kindOf = (a: string): "wallet" | "program-controlled address" => (onCurve(a) ? "wallet" : "program-controlled address");

// Every instruction in the transaction, the wallet's own and the ones programs made on its behalf.
const allInstructions = (tx: ParsedTransactionWithMeta) => [
  ...tx.transaction.message.instructions,
  ...(tx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions),
] as any[];

export function grantsIn(wallet: string, tx: ParsedTransactionWithMeta, time: string | null): Grant[] {
  if (!tx.meta || tx.meta.err) return [];
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const signed = tx.transaction.message.accountKeys.some((k) => k.signer && k.pubkey.toBase58() === wallet);
  if (!signed) return [];
  const tx_id = tx.transaction.signatures[0];
  const ixs = allInstructions(tx);
  const pre = new Map((tx.meta.preTokenBalances ?? []).map((b) => [keys[b.accountIndex], b]));
  const revoked = new Set(ixs.filter((ix) => ix.parsed?.type === "revoke").map((ix) => ix.parsed.info.source));
  const out: Grant[] = [];
  for (const ix of ixs) {
    const p = ix.parsed;
    if (!p || typeof p !== "object") continue;
    const i = p.info ?? {};
    if ((p.type === "approve" || p.type === "approveChecked") && i.owner === wallet && i.delegate !== wallet && !revoked.has(i.source)) {
      const raw = String(i.amount ?? i.tokenAmount?.amount ?? "0");
      if (BigInt(raw) === 0n) continue;
      const b = pre.get(i.source);
      const decimals = i.tokenAmount?.decimals ?? b?.uiTokenAmount.decimals;
      out.push({ name: "approval_given", level: onCurve(i.delegate) ? "warn" : "info", tx_id, time, account: i.source, to: i.delegate,
        to_kind: kindOf(i.delegate), mint: i.mint ?? b?.mint ?? null, amount: decimals === undefined ? raw : formatUnits(BigInt(raw), decimals) });
    }
    if (p.type === "setAuthority" && i.authorityType === "accountOwner" && i.authority === wallet && i.newAuthority && i.newAuthority !== wallet) {
      const b = pre.get(i.account);
      if (!b || BigInt(b.uiTokenAmount.amount) === 0n) continue; // new or empty accounts: what launchpads do
      out.push({ name: "owner_changed", level: "warn", tx_id, time, account: i.account, to: i.newAuthority, to_kind: kindOf(i.newAuthority),
        mint: b.mint, amount: b.uiTokenAmount.uiAmountString ?? formatUnits(BigInt(b.uiTokenAmount.amount), b.uiTokenAmount.decimals) });
    }
    if (ix.program === "system" && p.type === "assign" && i.account === wallet && i.owner !== SYSTEM_PROGRAM) {
      out.push({ name: "wallet_reassigned", level: "warn", tx_id, time, account: wallet, to: i.owner, to_kind: "program", mint: null, amount: null });
    }
  }
  return out;
}

// The state now: who owns the wallet account, and every token account with an approval still open. Two or three reads;
// any that fails leaves its part null (unknown), never "none".
export async function stateNow(conn: Connection, wallet: string): Promise<NowState> {
  const key = new PublicKey(wallet);
  const [info, ...lists] = await Promise.all([
    conn.getAccountInfo(key, "confirmed").catch(() => undefined),
    ...[TOKEN_PROGRAM, TOKEN_2022_PROGRAM].map((p) => conn.getParsedTokenAccountsByOwner(key, { programId: new PublicKey(p) }, "confirmed").catch(() => null)),
  ]);
  const wallet_owner = info === undefined ? null : info === null ? SYSTEM_PROGRAM : info.owner.toBase58();
  const open_approvals = lists.some((l) => l === null) ? null : lists.flatMap((l) => l!.value).flatMap((a) => {
    const t = (a.account.data as any).parsed?.info;
    if (!t?.delegate || !t.delegatedAmount || BigInt(t.delegatedAmount.amount) === 0n) return [];
    const kind = kindOf(t.delegate);
    return [{ account: a.pubkey.toBase58(), mint: t.mint, delegate: t.delegate, delegate_kind: kind, amount: t.delegatedAmount.uiAmountString ?? t.delegatedAmount.amount, level: kind === "wallet" ? "warn" as const : "info" as const }];
  });
  return { wallet_owner, open_approvals };
}

export type Method = { name: string; title: string; what_happened: string; tx_ids: string[]; fix: string };

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const sym = (mint: string | null, symbols: Map<string, string | null>) => (mint ? symbols.get(mint) ?? short(mint) : "tokens");

// The answer to "how did they get in?", strongest evidence first. Only what the transactions and state show; when
// nothing does, it says so and names the usual causes the chain can't see.
export function howItHappened(o: {
  grants: Grant[]; now: NowState; flags: { name: string; level: string; tx_ids: string[] }[]; symbols: Map<string, string | null>;
  bigSignedByOwner: { tx_id: string } | null; drain: boolean;
}) {
  const methods: Method[] = [];
  const has = (n: string) => o.flags.some((f) => f.name === n);
  const reassigned = o.grants.filter((g) => g.name === "wallet_reassigned");
  if (reassigned.length || (o.now.wallet_owner && o.now.wallet_owner !== SYSTEM_PROGRAM)) {
    methods.push({ name: "wallet_reassigned", title: "Wallet handed to a program",
      what_happened: reassigned.length
        ? `This wallet signed an Assign that made program ${reassigned[0].to} its owner. After that, the program decides what the wallet can do, not the key. Wallet previews don't show this step.`
        : `This wallet's account is owned by ${o.now.wallet_owner} now, not the System Program that owns every normal wallet. Whoever controls that program controls the wallet.`,
      tx_ids: reassigned.map((g) => g.tx_id),
      fix: "The wallet can't be fixed: stop using it, and never send anything to it again. Use a new wallet with a new seed phrase." });
  }
  const owners = o.grants.filter((g) => g.name === "owner_changed");
  if (owners.length) {
    methods.push({ name: "owner_changed", title: "Token accounts handed over",
      what_happened: `This wallet signed ${owners.length === 1 ? "a transaction" : `${new Set(owners.map((g) => g.tx_id)).size} transaction(s)`} making ${[...new Set(owners.map((g) => short(g.to)))].join(", ")} the owner of token accounts that held ${owners.map((g) => `${g.amount} ${sym(g.mint, o.symbols)}`).join(", ")}. The new owner can move those tokens any time without this wallet's key, and the moves don't show in this wallet's history. Fake airdrop, mint and claim sites ask for this signature with a preview that shows no change.`,
      tx_ids: [...new Set(owners.map((g) => g.tx_id))],
      fix: "Those token accounts belong to the new owner now; they can't be taken back from this wallet. Move everything else to a new wallet with a new seed phrase, and report the transaction (ic3.gov in the US)." });
  }
  const approvals = o.grants.filter((g) => g.name === "approval_given" && g.level === "warn");
  const openWarn = (o.now.open_approvals ?? []).filter((a) => a.level === "warn");
  if (approvals.length || openWarn.length) {
    const lines = [
      ...approvals.map((g) => `signed an approval letting ${short(g.to)} (a wallet) move up to ${g.amount} ${sym(g.mint, o.symbols)}`),
      ...openWarn.filter((a) => !approvals.some((g) => g.account === a.account && g.to === a.delegate)).map((a) => `has an open approval letting ${short(a.delegate)} (a wallet) move up to ${a.amount} ${sym(a.mint, o.symbols)}`),
    ];
    methods.push({ name: "approval_given", title: "Spending approval given to another wallet",
      what_happened: `This wallet ${lines.join("; and ")}. An approved wallet can take those tokens later without this wallet signing again, and those moves don't show in this wallet's history.${openWarn.length ? ` ${openWarn.length} approval${openWarn.length === 1 ? " is" : "s are"} still open right now.` : ""}`,
      tx_ids: [...new Set(approvals.map((g) => g.tx_id))],
      fix: openWarn.length ? "Revoke the open approval now (a Revoke transaction from your wallet app or a revoke tool you trust), and don't receive more of that token in this wallet until it's revoked." : "That approval is closed now, but whatever it allowed may already be gone. If you didn't mean to give it, move what's left to a new wallet." });
  }
  if (has("sent_to_lookalike")) {
    const f = o.flags.find((x) => x.name === "sent_to_lookalike")!;
    methods.push({ name: "sent_to_lookalike", title: "Sent to a lookalike address (address poisoning)",
      what_happened: "This wallet sent money to an address that only looks like one it used before; the lookalike had sent it dust first so it would show up in the history. Nobody needed the key: the money was sent to the wrong address.",
      tx_ids: f.tx_ids,
      fix: "The wallet itself is fine. Always check the whole address against one you saved yourself; never copy one from your history." });
  }
  if (o.drain && (has("fee_paid_by_other_wallet") || has("passed_straight_through"))) {
    const ids = o.flags.filter((x) => ["fee_paid_by_other_wallet", "passed_straight_through"].includes(x.name)).flatMap((x) => x.tx_ids);
    methods.push({ name: "stolen_key", title: "Seed phrase or private key stolen",
      what_happened: has("fee_paid_by_other_wallet")
        ? "Money was moved out with this wallet's own signature while another wallet paid the fees, and the wallet was left empty. That takes the key: a sweeper bot holds it and empties anything that arrives."
        : "Money was forwarded within seconds of arriving and the wallet was left empty, signed with this wallet's key: what sweeper bots that hold a stolen key do.",
      // Found 2026-11-18 re-checking Drain Check's 8 looked-up wallets: Tim's own payer and payout wallets (moving test
      // money between each other, fees paid by the x402 facilitator) match this exactly. The fix line says so.
      tx_ids: [...new Set(ids)],
      fix: "If you didn't move this money yourself, the key is known to someone else for good: move anything left to a new wallet with a new seed phrase. The usual leaks: typing the phrase into a site or 'support' chat, a fake wallet app or extension, or a screenshot or note synced online. If you did move it (to your own wallet, an exchange, or through an app that pays fees for you), this is your own move, not a theft: the chain can't tell them apart." });
  }
  if (!methods.length && o.bigSignedByOwner) {
    methods.push({ name: "signed_by_this_wallet", title: "Signed with this wallet's own key",
      what_happened: "The big send was signed with this wallet's key and paid its own fee. Either the owner sent it, or someone who has the key did, or a site got the owner to sign it as something else. The chain looks the same in all three cases.",
      tx_ids: [o.bigSignedByOwner.tx_id],
      fix: "If you didn't mean to send it, treat the wallet as compromised: move what's left to a new wallet with a new seed phrase." });
  }
  const noted = [
    ...o.grants.filter((g) => g.name === "approval_given" && g.level === "info").map((g) => `approval to program-controlled address ${short(g.to)} (${g.amount} ${sym(g.mint, o.symbols)}), the kind swaps and apps use`),
    ...(o.now.open_approvals ?? []).filter((a) => a.level === "info").map((a) => `open approval to program-controlled address ${short(a.delegate)} (${a.amount} ${sym(a.mint, o.symbols)})`),
  ];
  const unknownParts = [o.now.wallet_owner === null ? "who owns the wallet account" : null, o.now.open_approvals === null ? "open approvals" : null].filter(Boolean);
  return {
    found: methods.length > 0,
    methods,
    noted,
    unknown: unknownParts.length ? `Couldn't read ${unknownParts.join(" or ")} right now; that part is unknown, not clear.` : null,
    summary: methods.length ? methods.map((m) => m.title).join("; ")
      : "These transactions don't show how. The usual ways the chain can't see: a seed phrase typed into a fake site, app or 'support' chat; a fake wallet extension; or a transaction signed further back (trace further back to check).",
  };
}
