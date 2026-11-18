// "How it happened" (server/tools/how.ts): what gave someone else the power to take a wallet's money.
// Real ordinary transactions (launchpads, swaps; recorded 2026-11-17) must stay quiet. The attack shapes are built from
// the instructions the documented drains use (approve to a wallet, owner change of a funded token account, Assign of
// the wallet), since no real victim transaction was found in 21,412 scanned transactions; a real one goes in
// tests/fixtures when found (LATER.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { grantsIn, howItHappened, type NowState } from "../server/tools/how";
import { flagsFor, traceWallet, type Flow } from "../server/tools/trace";
import { parsedTransaction } from "../server/tools/transactions";
import { SYSTEM_PROGRAM } from "../server/tools/lib";
import { loadFixture, replayContext } from "./helpers/replay";
import { ORDINARY } from "./record-how";
import { z } from "zod";

const W = "AvLELvhjDEs9jG54EV3PQ8QGptYyWceEduGQb1gDpmAj"; // the victim in these cases
const THIEF = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU"; // on the curve: a wallet someone holds the key to
const ACCOUNT = "FZ9H9bMWiPjrGCESt2LJcqUEJBNaB4vu4fFt8Ys1bHtZ"; // a token account (program-derived, off the curve)
const POOL = "5n81yPwLuv1q97NZ7Pt43JxmtLQpvjFuAW22QygcqAAQ"; // another program-derived address
const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const ix = (program: string, type: string, info: Record<string, unknown>) => ({ program, programId: new PublicKey(program === "system" ? SYSTEM_PROGRAM : "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), parsed: { type, info } });
const tx = (o: { signers: string[]; ixs: any[]; held?: string; err?: boolean }) => ({
  transaction: { signatures: ["SIG1"], message: {
    accountKeys: [...o.signers.map((s) => ({ pubkey: new PublicKey(s), signer: true })), { pubkey: new PublicKey(ACCOUNT), signer: false }],
    instructions: o.ixs } },
  meta: { err: o.err ? { InstructionError: [0, "x"] } : null, innerInstructions: [],
    preTokenBalances: o.held === undefined ? [] : [{ accountIndex: o.signers.length, mint: BONK, owner: W, uiTokenAmount: { amount: o.held, decimals: 5, uiAmountString: (Number(o.held) / 1e5).toString() } }] },
}) as any;
const none: NowState = { wallet_owner: SYSTEM_PROGRAM, open_approvals: [] };
const how = (over: Partial<Parameters<typeof howItHappened>[0]>) =>
  howItHappened({ grants: [], now: none, flags: [], symbols: new Map([[BONK, "Bonk"]]), bigSignedByOwner: null, drain: false, ...over });

test("the test addresses are what they claim: a wallet on the curve, program-derived accounts off it", () => {
  assert.equal(PublicKey.isOnCurve(new PublicKey(THIEF).toBytes()), true);
  assert.equal(PublicKey.isOnCurve(new PublicKey(ACCOUNT).toBytes()), false);
  assert.equal(PublicKey.isOnCurve(new PublicKey(POOL).toBytes()), false);
});

test("real ordinary transactions (token launch, launchpad buy, swaps with approvals; recorded 2026-11-17) give no grants", async () => {
  const conn = replayContext(loadFixture("how-ordinary")).connection("mainnet-beta");
  for (const o of ORDINARY) {
    const t = await parsedTransaction(conn, o.tx);
    assert.ok(t, `${o.tx} replays`);
    assert.deepEqual(grantsIn(o.wallet, t!, null), [], o.tx);
  }
});

test("approval to a wallet, signed by this wallet and left open: a warning with the amount", () => {
  const g = grantsIn(W, tx({ signers: [W], held: "500000000", ixs: [ix("spl-token", "approve", { source: ACCOUNT, delegate: THIEF, owner: W, amount: "500000000" })] }), "2026-11-17T00:00:00.000Z");
  assert.deepEqual(g.map((x) => [x.name, x.level, x.to_kind, x.amount, x.mint]), [["approval_given", "warn", "wallet", "5000", BONK]]);
});

test("approvals that aren't attacks: revoked in the same transaction, to a program-controlled address (noted only), zero, not signed, failed", () => {
  const approve = ix("spl-token", "approve", { source: ACCOUNT, delegate: THIEF, owner: W, amount: "1" });
  assert.deepEqual(grantsIn(W, tx({ signers: [W], ixs: [approve, ix("spl-token", "revoke", { source: ACCOUNT, owner: W })] }), null), []);
  assert.deepEqual(grantsIn(W, tx({ signers: [W], ixs: [ix("spl-token", "approve", { source: ACCOUNT, delegate: POOL, owner: W, amount: "1" })] }), null).map((x) => x.level), ["info"]);
  assert.deepEqual(grantsIn(W, tx({ signers: [W], ixs: [ix("spl-token", "approve", { source: ACCOUNT, delegate: THIEF, owner: W, amount: "0" })] }), null), []);
  assert.deepEqual(grantsIn(W, tx({ signers: [THIEF], ixs: [approve] }), null), [], "this wallet didn't sign it");
  assert.deepEqual(grantsIn(W, tx({ signers: [W], ixs: [approve], err: true }), null), [], "a failed transaction changed nothing");
});

test("owner change: only a token account that already held tokens (the attack), not a new empty one (launchpads)", () => {
  const set = ix("spl-token", "setAuthority", { account: ACCOUNT, authority: W, authorityType: "accountOwner", newAuthority: THIEF });
  assert.deepEqual(grantsIn(W, tx({ signers: [W], held: "123400000", ixs: [set] }), null).map((x) => [x.name, x.level, x.amount]), [["owner_changed", "warn", "1234"]]);
  assert.deepEqual(grantsIn(W, tx({ signers: [W], held: "0", ixs: [set] }), null), []);
  assert.deepEqual(grantsIn(W, tx({ signers: [W], ixs: [set] }), null), [], "created in this transaction: no balance before");
  const close = ix("spl-token", "setAuthority", { account: ACCOUNT, authority: W, authorityType: "closeAccount", newAuthority: THIEF });
  assert.deepEqual(grantsIn(W, tx({ signers: [W], held: "1", ixs: [close] }), null), [], "close authority isn't ownership");
});

test("Assign of the wallet to a program: a warning; assigning a new account the wallet created is not", () => {
  const evil = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
  assert.deepEqual(grantsIn(W, tx({ signers: [W], ixs: [ix("system", "assign", { account: W, owner: evil })] }), null).map((x) => [x.name, x.to]), [["wallet_reassigned", evil]]);
  assert.deepEqual(grantsIn(W, tx({ signers: [W], ixs: [ix("system", "assign", { account: ACCOUNT, owner: evil })] }), null), []);
});

test("how_it_happened: strongest first, each with what happened, the transaction and the fix", () => {
  const grants = [
    ...grantsIn(W, tx({ signers: [W], held: "100000", ixs: [ix("spl-token", "setAuthority", { account: ACCOUNT, authority: W, authorityType: "accountOwner", newAuthority: THIEF })] }), null),
    ...grantsIn(W, tx({ signers: [W], ixs: [ix("system", "assign", { account: W, owner: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj" })] }), null),
  ];
  const h = how({ grants });
  assert.equal(h.found, true);
  assert.deepEqual(h.methods.map((m) => m.name), ["wallet_reassigned", "owner_changed"]);
  assert.match(h.methods[1].what_happened, /1 Bonk/);
  assert.match(h.methods[1].what_happened, /don't show in this wallet's history/);
  assert.deepEqual(h.methods[1].tx_ids, ["SIG1"]);
});

test("state now: a wallet owned by another program, and an approval still open, show even with nothing in the history", () => {
  const h = how({ now: { wallet_owner: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj",
    open_approvals: [{ account: ACCOUNT, mint: BONK, delegate: THIEF, delegate_kind: "wallet", amount: "50", level: "warn" }] } });
  assert.deepEqual(h.methods.map((m) => m.name), ["wallet_reassigned", "approval_given"]);
  assert.match(h.methods[1].what_happened, /still open right now/);
  assert.match(h.methods[1].fix, /Revoke/);
  const pool = how({ now: { wallet_owner: SYSTEM_PROGRAM, open_approvals: [{ account: ACCOUNT, mint: BONK, delegate: POOL, delegate_kind: "program-controlled address", amount: "5", level: "info" }] } });
  assert.equal(pool.found, false, "an open approval to a program-controlled address is noted, not called an attack");
  assert.equal(pool.noted.length, 1);
});

test("nothing found: says the transactions don't show how, names the usual unseen causes; unreadable state is unknown, not clear", () => {
  const h = how({ now: { wallet_owner: null, open_approvals: null } });
  assert.equal(h.found, false);
  assert.match(h.summary, /don't show how/);
  assert.match(h.unknown!, /who owns the wallet account or open approvals/);
  assert.equal(how({}).unknown, null);
});

const flow = (over: Partial<Flow>): Flow => ({
  tx_id: Math.random().toString(36).slice(2), time: "2026-10-18T03:06:56.000Z", result: "success", direction: "in",
  sol_change: "0", raw_sol_change: "0", sol_before: "1", raw_sol_before: "1000000000", token_changes: [], counterparty: null, fee_payer: W, wallet_signed: true,
  programs: ["System Program"], memo: null, ...over,
});

test("sent_to_lookalike: the wallet paid the imitation after it sent dust (poisoning worked), not just received dust", () => {
  const real = "HLbeDoFFsebf3WQVRXNLSa3CMECDDaAYtxAtKbB2FYE5", fake = "HLbeHhyKZMQQg6eBVa6FnYnSC6ibimzkvPtHev5uGYE5";
  const flows = [ // newest first
    flow({ time: "2026-10-19T00:00:00.000Z", direction: "out", raw_sol_change: "-2000000000", counterparty: fake }),
    flow({ time: "2026-10-18T00:00:00.000Z", direction: "in", raw_sol_change: "1", counterparty: fake, fee_payer: fake, wallet_signed: false }),
    flow({ time: "2026-10-17T00:00:00.000Z", direction: "out", raw_sol_change: "-2300019279", counterparty: real }),
  ];
  const flags = flagsFor(W, flows, 5_000_000_000n);
  assert.ok(flags.some((f) => f.name === "sent_to_lookalike" && f.level === "warn" && f.tx_ids[0] === flows[0].tx_id));
  assert.deepEqual(how({ flags }).methods.map((m) => m.name), ["sent_to_lookalike"]);
  // Only the dust, no payment to the imitation: the attempt, not the loss.
  assert.ok(!flagsFor(W, flows.slice(1), 5_000_000_000n).some((f) => f.name === "sent_to_lookalike"));
});

test("trace replays Kunal's real sweep (2026-10-27): how it happened = stolen key, with the transactions", async () => {
  const fx = loadFixture("trace-kunal-sweep");
  const out: any = await traceWallet.run(z.object(traceWallet.inputs).parse(fx.args), replayContext(fx));
  const h = out.report.how_it_happened;
  assert.equal(h.methods[0].name, "stolen_key");
  assert.ok(h.methods[0].tx_ids.length && h.methods[0].solscan[0].startsWith("https://solscan.io/tx/"));
  assert.match(out.summary, /How: Seed phrase or private key stolen/);
});
