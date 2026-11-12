// Automatic payment: caps are enforced before anything is signed. The 402 is the live answer Pulse gave on 2026-11-12
// (test/fixtures/check_tx_402.json). A real paid call runs only with PULSE_LIVE_PAY=1 and a funded wallet
// (PULSE_PAYER_KEY=path to a keypair file), never in CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import { checkBeforeSign, checkTx, PulseBlockedError } from "../src/index";
import { choosePayment, PaymentRefusedError, recordPayment, spentTodayUsd, SOLANA_MAINNET, USDC_MINT } from "../src/pay";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const LIVE_402 = fixture("check_tx_402");
const TRANSFER: string = fixture("check_tx_transfer").input.tx;
const usdc = (amount: string) => ({ scheme: "exact", network: SOLANA_MAINNET, asset: USDC_MINT, amount, payTo: "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU" });
const KEY = Array.from(Keypair.generate().secretKey); // throwaway key, never funded

test("the live terms offer USDC on Solana mainnet at Pulse's price", () => {
  const req = choosePayment(LIVE_402.terms.accepts, "w-live", {});
  assert.equal(req.amount, "20000"); // $0.02 for check_tx
});

test("refuses a call over maxPerCallUsd", () => {
  assert.throws(() => choosePayment([usdc("20000")], "w1", { maxPerCallUsd: 0.01 }), PaymentRefusedError);
});

test("refuses terms that aren't USDC on Solana mainnet", () => {
  assert.throws(() => choosePayment([{ ...usdc("10000"), network: "eip155:8453" }], "w2", {}), /only payment this client makes/);
  assert.throws(() => choosePayment([{ ...usdc("10000"), asset: "So11111111111111111111111111111111111111112" }], "w2", {}), PaymentRefusedError);
});

test("the default daily cap is $50", () => {
  recordPayment("w4", 49_990_000n);
  assert.equal(choosePayment([usdc("10000")], "w4", {}).amount, "10000"); // reaches exactly $50
  recordPayment("w4", 10_000n);
  assert.throws(() => choosePayment([usdc("10000")], "w4", {}), /over your maxPerDayUsd of \$50/);
});

test("the daily cap counts what this wallet already paid today", () => {
  recordPayment("w3", 980_000n);
  assert.equal(spentTodayUsd("w3"), 0.98);
  assert.equal(choosePayment([usdc("20000")], "w3", { maxPerDayUsd: 1 }).amount, "20000"); // exactly $1.00 is allowed
  recordPayment("w3", 20_000n);
  assert.throws(() => choosePayment([usdc("10000")], "w3", { maxPerDayUsd: 1 }), /over your maxPerDayUsd/);
});

test("end to end: an over-cap call is refused and nothing is signed or sent", async () => {
  const seen: Record<string, string>[] = [];
  globalThis.fetch = (async (input: any, init: any) => {
    const req = input instanceof Request ? input : new Request(input, init);
    seen.push(Object.fromEntries(req.headers.entries()));
    return new Response("{}", { status: 402, headers: { "payment-required": LIVE_402.paymentRequiredHeader, "content-type": "application/json" } });
  }) as typeof fetch;
  await assert.rejects(
    checkTx(TRANSFER, { pay: { secretKey: KEY, maxPerCallUsd: 0.01 } }),
    (e: PulseBlockedError) => e.verdict === "PAYMENT_REFUSED" && /over your maxPerCallUsd/.test(e.message),
  );
  assert.ok(seen.length >= 1);
  assert.ok(seen.every((h) => !h["payment-signature"] && !h["x-payment"]), "no payment header was ever sent");
});

test("live: pays one check_tx within the caps", { skip: process.env.PULSE_LIVE_PAY !== "1" && "set PULSE_LIVE_PAY=1 and PULSE_PAYER_KEY" }, async () => {
  const secretKey = JSON.parse(readFileSync(process.env.PULSE_PAYER_KEY!, "utf8"));
  const check = await checkBeforeSign(TRANSFER, { pay: { secretKey, maxPerCallUsd: 0.05, maxPerDayUsd: 0.5 } }).catch((e) => e);
  // The transfer fixture may have expired by now; what matters is that the call was paid and answered.
  assert.ok(!(check instanceof PulseBlockedError) || !["PAYMENT_REFUSED", "PAYMENT_REQUIRED", "UNKNOWN"].includes(check.verdict), String(check?.message));
});
