import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { VersionedTransaction } from "@solana/web3.js";
import { buildTransaction } from "../server/tools/build";
import { loadFixture, replayContext } from "./helpers/replay";

// Recorded on mainnet 2026-10-29 (tests/record-fixtures.ts). Nothing is signed or sent: build_tx only builds and dry-runs.
const run = async (name: string) => {
  const fx = loadFixture(name);
  return (await buildTransaction.run(z.object(buildTransaction.inputs).parse(fx.args), replayContext(fx))) as any;
};

for (const name of ["build-sol-transfer", "build-usdt-transfer", "build-swap-bonk"]) {
  test(`${name}: built exactly as asked, check_tx OK and tx_matches MATCH, so ready to sign`, async () => {
    const out = await run(name);
    assert.equal(out.checks.check_tx.verdict, "OK", out.checks.check_tx.summary);
    assert.equal(out.checks.tx_matches.verdict, "MATCH", out.checks.tx_matches.summary);
    assert.equal(out.ready_to_sign, true);
    assert.deepEqual(out.reasons, []);
    const tx = VersionedTransaction.deserialize(Buffer.from(out.tx, "base64"));
    assert.equal(tx.signatures.every((s) => s.every((b) => b === 0)), true, "never signed");
  });
}

test("a swap's quote is returned, and the bought token is checked first", async () => {
  const out = await run("build-swap-bonk");
  assert.ok(Number(out.quote.out_amount) > 0);
  assert.equal(out.quote.slippage_bps, 50);
  // Live token data moves (BONK was SAFE in one run and CAUTION in the recording); only AVOID stops a swap.
  assert.ok(["SAFE", "CAUTION"].includes(out.checks.token_safety.verdict));
  assert.equal(out.ready_to_sign, true, "CAUTION is shown, not blocked");
});

test("a swap into a known rug token is built but not ready, with the reasons", async () => {
  const out = await run("build-swap-rugger");
  assert.equal(out.ready_to_sign, false);
  assert.equal(out.checks.token_safety.verdict, "AVOID");
  assert.ok(out.reasons.some((r: string) => /token_safety says AVOID/.test(r)));
  assert.match(out.summary, /Not ready/);
});

test("inputs: slippage over 3% and odd amounts are rejected before anything is built", () => {
  const schema = z.object(buildTransaction.inputs);
  const base = { action: "swap", from: "x", amount: "1", buy: "SOL" };
  assert.equal(schema.safeParse({ ...base, slippage_bps: 301 }).success, false);
  assert.equal(schema.safeParse({ ...base, amount: "1e9" }).success, false);
  assert.equal(schema.safeParse({ ...base, amount: "-1" }).success, false);
  assert.equal(schema.safeParse(base).success, true);
});

test("a transfer to the sender itself is refused", async () => {
  const fx = loadFixture("build-sol-transfer");
  await assert.rejects(
    buildTransaction.run(z.object(buildTransaction.inputs).parse({ ...fx.args, to: fx.args.from }), replayContext(fx)),
    /same wallet/,
  );
});
