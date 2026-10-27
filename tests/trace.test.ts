import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { flagsFor, lookalike, type Flow } from "../server/tools/trace";
import { traceWallet } from "../server/tools/trace";
import { loadFixture, replayContext } from "./helpers/replay";

const W = "AvLELvhjDEs9jG54EV3PQ8QGptYyWceEduGQb1gDpmAj";
const flow = (over: Partial<Flow>): Flow => ({
  tx_id: Math.random().toString(36).slice(2), time: "2026-10-18T03:06:56.000Z", result: "success", direction: "in",
  sol_change: "0", raw_sol_change: "0", token_changes: [], counterparty: null, fee_payer: W, wallet_signed: true,
  programs: ["System Program"], memo: null, ...over,
});
const names = (flags: { name: string }[]) => flags.map((f) => f.name).sort();

test("lookalike: same first 3 and last 3 characters, different address (the 5Gu1…rSH / 5Guz…rSH pair, 2026-10-27)", () => {
  assert.equal(lookalike("5Gu1BNAeHFNDZCdn2XV45jidAo4bbqNSrvQdx2mHArSH", "5GuzhMZDWAHoEZiJZiqtiJ7op7KmFE7VqW6f9irJKrSH"), true);
  assert.equal(lookalike("5Gu1BNAeHFNDZCdn2XV45jidAo4bbqNSrvQdx2mHArSH", "5Gu1BNAeHFNDZCdn2XV45jidAo4bbqNSrvQdx2mHArSH"), false, "the same address isn't a lookalike");
  assert.equal(lookalike("5Gu1BNAeHFNDZCdn2XV45jidAo4bbqNSrvQdx2mHArSH", "6tckHFBpiJ8YgYN8FUskvtvTpXQZ55g5LHeo1kvELoDQ"), false);
});

test("a Kunal-style sweep: in, then out 7 seconds later with another wallet paying the fee, leaving nothing", () => {
  const flows = [
    flow({ time: "2026-10-18T03:07:03.000Z", direction: "out", raw_sol_change: "-2032462589", counterparty: "6tckHFBpiJ8YgYN8FUskvtvTpXQZ55g5LHeo1kvELoDQ", fee_payer: "9WL2A89zPU6ns1xD2Y3KXjCwN1Wb3iEm3pD8bq1tYHx6" }),
    flow({ time: "2026-10-18T03:06:56.000Z", direction: "in", raw_sol_change: "2032462589", counterparty: "C7SkBhEZ", fee_payer: "C7SkBhEZ", wallet_signed: false }),
  ];
  const flags = flagsFor(W, flows, 0n);
  assert.deepEqual(names(flags), ["emptied", "fee_paid_by_other_wallet", "passed_straight_through"]);
  assert.match(flags.find((f) => f.name === "fee_paid_by_other_wallet")!.detail, /fee sponsors/, "names the innocent explanation too");
  assert.ok(flags.every((f) => f.level === "warn"), "emptied + swept is the drain pattern: all warnings");
});

test("address poisoning: dust from a lookalike of an address the wallet paid", () => {
  const real = "HLbeDoFFsebf3WQVRXNLSa3CMECDDaAYtxAtKbB2FYE5", fake = "HLbeHhyKZMQQg6eBVa6FnYnSC6ibimzkvPtHev5uGYE5";
  const flags = flagsFor(W, [
    flow({ direction: "in", raw_sol_change: "1", counterparty: fake, fee_payer: fake, wallet_signed: false }),
    flow({ time: "2026-10-17T00:00:00.000Z", direction: "out", raw_sol_change: "-2300019279", counterparty: real }),
  ], 5_000_000_000n);
  assert.deepEqual(names(flags), ["lookalike_dust"]);
  assert.match(flags[0].detail, new RegExp(`${fake} imitates ${real}`));
});

test("no flags for ordinary use: money in, then out a day later, own fee, balance left", () => {
  const flags = flagsFor(W, [
    flow({ time: "2026-10-19T03:00:00.000Z", direction: "out", raw_sol_change: "-100000000", counterparty: "6tckHFBpiJ8YgYN8FUskvtvTpXQZ55g5LHeo1kvELoDQ" }),
    flow({ time: "2026-10-18T03:00:00.000Z", direction: "in", raw_sol_change: "500000000", counterparty: "C7SkBhEZ", wallet_signed: false, fee_payer: "C7SkBhEZ" }),
  ], 400_000_000n);
  assert.deepEqual(flags, []);
});

test("pass-through: timing alone doesn't count (5 in, 1 out), and forwarding without emptying is only noted", () => {
  const forwarded = flagsFor(W, [
    flow({ time: "2026-10-18T03:07:00.000Z", direction: "out", raw_sol_change: "-1950000000", counterparty: "HotWallet" }),
    flow({ time: "2026-10-18T03:06:56.000Z", direction: "in", raw_sol_change: "2000000000", counterparty: "Customer", wallet_signed: false, fee_payer: "Customer" }),
  ], 3_000_000_000n);
  assert.deepEqual(forwarded.map((f) => [f.name, f.level]), [["passed_straight_through", "info"]], "an exchange deposit address looks like this");
  const flags = flagsFor(W, [
    flow({ time: "2026-10-18T03:07:56.000Z", direction: "out", raw_sol_change: "-1000000000", counterparty: "6tckHFBpiJ8YgYN8FUskvtvTpXQZ55g5LHeo1kvELoDQ" }),
    flow({ time: "2026-10-18T03:06:56.000Z", direction: "in", raw_sol_change: "5000000000", counterparty: "C7SkBhEZ", wallet_signed: false, fee_payer: "C7SkBhEZ" }),
  ], 4_000_000_000n);
  assert.deepEqual(flags, []);
});

test("another wallet paying the fee: not for swaps (gasless swaps), info alone, warn when the wallet was emptied", () => {
  assert.deepEqual(flagsFor(W, [flow({ direction: "both", raw_sol_change: "-100", fee_payer: "GaslessRelayer" })], 1_000_000_000n), []);
  const alone = flagsFor(W, [flow({ direction: "out", raw_sol_change: "-100000000", counterparty: "SomeoneElse", fee_payer: "Sponsor" })], 1_000_000_000n);
  assert.deepEqual(alone.map((f) => [f.name, f.level]), [["fee_paid_by_other_wallet", "info"]]);
  const swept = flagsFor(W, [flow({ direction: "out", raw_sol_change: "-100000000", counterparty: "SomeoneElse", fee_payer: "Sponsor" })], 0n);
  assert.equal(swept.find((f) => f.name === "fee_paid_by_other_wallet")!.level, "warn", "emptied makes it a warning");
});

test("failed transactions and fee-only transactions don't count as money moving", () => {
  const flags = flagsFor(W, [
    flow({ result: "failed", direction: "out", raw_sol_change: "-5000", fee_payer: "OtherPayer" }),
    flow({ direction: "none", raw_sol_change: "-5000" }),
  ], 0n);
  assert.deepEqual(flags, []);
});

test("trace replays Kunal's real sweep (recorded from mainnet 2026-10-27)", async () => {
  const fixture = loadFixture("trace-kunal-sweep");
  const r: any = await traceWallet.run(z.object(traceWallet.inputs).parse(fixture.args), replayContext(fixture));
  assert.equal(r.flows.length, 2);
  assert.deepEqual(names(r.flags), ["emptied", "fee_paid_by_other_wallet", "passed_straight_through"]);
  assert.equal(r.top_destinations[0].address, "6tckHFBpiJ8YgYN8FUskvtvTpXQZ55g5LHeo1kvELoDQ");
  assert.equal(r.top_destinations[0].kind, "program-controlled address");
  assert.equal(r.top_destinations[0].sol_out, "2.032462589");
  assert.match(r.summary, /exchange deposit addresses and short-lived bot wallets look the same/, "the drain warning says what else matches it");
  assert.equal(r.next_before, null);
});

test("trace replays Adilak's real drain (recorded 2026-10-27): the stolen tokens and where they went", async () => {
  const fixture = loadFixture("trace-adilak-drain");
  const r: any = await traceWallet.run(z.object(traceWallet.inputs).parse(fixture.args), replayContext(fixture));
  const top = r.top_destinations[0];
  assert.equal(top.address, "7LhtmP8q9WLWoGN2WbLDjqQbFhdDr2hY3a17EnqaXGCX", "the attacker he named");
  assert.equal(top.kind, "wallet");
  const out = Object.fromEntries(top.tokens_out.map((t: any) => [t.symbol, t.amount]));
  assert.equal(out.JTO, "2176.25925134");
  assert.equal(out.RAY, "5375.8201");
  assert.match(out.PUMP, /^1446074\./);
  assert.ok(r.flags.some((f: any) => f.name === "emptied" && f.level === "warn"), "emptied and swept: the drain pattern");
  assert.match(r.summary, /Warning signs:/);
});

test("dust_received: 1 lamport from a stranger is noted (the probe before poisoning); not from someone the wallet paid", () => {
  const flags = flagsFor(W, [
    flow({ direction: "in", raw_sol_change: "1", counterparty: "BjkFstrangerYEmn", fee_payer: "BjkFstrangerYEmn", wallet_signed: false }),
    flow({ time: "2026-10-17T00:00:00.000Z", direction: "out", raw_sol_change: "-100000000", counterparty: "FriendWallet" }),
  ], 2_000_000_000n);
  assert.deepEqual(flags.map((f) => [f.name, f.level]), [["dust_received", "info"]]);
  assert.match(flags[0].detail, /never copy an address/);
  const fromFriend = flagsFor(W, [
    flow({ direction: "in", raw_sol_change: "1", counterparty: "FriendWallet", fee_payer: "FriendWallet", wallet_signed: false }),
    flow({ time: "2026-10-17T00:00:00.000Z", direction: "out", raw_sol_change: "-100000000", counterparty: "FriendWallet" }),
  ], 2_000_000_000n);
  assert.deepEqual(fromFriend, []);
});

test("emptied by the owner: says every move out was signed by the wallet and paid its own fee", () => {
  const flags = flagsFor(W, [flow({ direction: "out", raw_sol_change: "-100000000", counterparty: "MyOtherWallet" })], 0n);
  assert.deepEqual(flags.map((f) => [f.name, f.level]), [["emptied", "info"]]);
  assert.match(flags[0].detail, /signed by this wallet and paid its own fee/);
});
