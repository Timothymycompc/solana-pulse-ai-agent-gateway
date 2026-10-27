// Exact amount math, error explanations and instruction decoding. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, type TransactionInstruction as Ix } from "@solana/web3.js";
import { AuthorityType, createApproveInstruction, createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createSetAuthorityInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { formatUnits, labelFor, parseUnits, USDC_MINT } from "../server/tools/lib";
import { explainError } from "../server/tools/errors";
import { feeBreakdown, loadTransaction } from "../server/tools/decode";
import { ToolError, TOOLS_BY_NAME } from "../server/tools";

test("amounts convert exactly, without floating point", () => {
  assert.equal(parseUnits("5", 6), 5_000_000n);
  assert.equal(parseUnits("0.000001", 6), 1n);
  assert.equal(parseUnits("123456789.123456789", 9), 123_456_789_123_456_789n);
  assert.equal(formatUnits(1n, 9), "0.000000001");
  assert.equal(formatUnits(-1_500_000n, 6), "-1.5");
  assert.equal(formatUnits(parseUnits("0.1", 9) + parseUnits("0.2", 9), 9), "0.3");
});

test("amounts the token can't represent are rejected, not rounded", () => {
  for (const bad of ["1.0000001", "1e5", "-1", "1,000", ""]) {
    assert.throws(() => parseUnits(bad, 6), ToolError, `rejects "${bad}"`);
  }
});

test("Jupiter's 0x1771 is explained as a slippage limit", () => {
  const { matches } = explainError("Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 failed: custom program error: 0x1771", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
  assert.equal(matches[0]?.name, "SlippageToleranceExceeded");
});

// The address used to read JUP6…tLUJoi5…, which isn't on chain, so every real Jupiter swap was flagged as an unknown
// program (found by the benchmark's swap case, 2026-10-19). The real one is checked against mainnet in that case.
test("Jupiter's real program address is recognized", () => {
  assert.equal(labelFor("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"), "Jupiter Aggregator v6");
});

test("an unknown program's custom code is not guessed", () => {
  const { matches } = explainError({ InstructionError: [1, { Custom: 6042 }] }, Keypair.generate().publicKey.toBase58());
  assert.equal(matches[0]?.scope, "program_specific");
  assert.match(matches[0]?.meaning ?? "", /defined by each program/);
});

test("drainer-style instructions are decoded, and fees use the transaction's compute settings", async () => {
  const owner = Keypair.generate().publicKey;
  const attacker = Keypair.generate().publicKey;
  const account = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), owner);
  const message = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
      createApproveInstruction(account, attacker, owner, 1_000_000n),
      createSetAuthorityInstruction(account, owner, AuthorityType.AccountOwner, attacker),
      createCloseAccountInstruction(account, attacker, owner),
      SystemProgram.transfer({ fromPubkey: owner, toPubkey: attacker, lamports: 1_000 }),
    ],
  }).compileToV0Message();
  const base64 = Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
  // No lookup tables, so decoding never touches the RPC.
  const loaded = await loadTransaction({} as any, base64);
  assert.deepEqual(loaded.instructions.map((i) => i.type), ["set_compute_unit_limit", "set_compute_unit_price", "token_approve", "token_set_authority", "token_close_account", "sol_transfer"]);
  assert.equal(loaded.instructions[2].info.delegate, attacker.toBase58());
  assert.equal(loaded.instructions[3].info.authorityType, "AccountOwner");
  const fee = feeBreakdown(loaded);
  assert.equal(fee.priorityLamports, "200"); // ceil(10,000 micro-lamports x 20,000 units / 1,000,000)
  assert.equal(fee.totalLamports, "5200");
});

// The three shapes from the everyday test, with the fee each real transaction paid on mainnet on 2026-10-19.
async function feeOf(payer: PublicKey, instructions: Ix[]) {
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: Keypair.generate().publicKey.toBase58(), instructions }).compileToV0Message();
  return feeBreakdown(await loadTransaction({} as any, Buffer.from(new VersionedTransaction(message).serialize()).toString("base64")));
}

test("with no compute limit set, built-in program steps get 3,000 units and others 200,000, as real fees show", async () => {
  const [from, to] = [Keypair.generate().publicKey, Keypair.generate().publicKey];
  // Like 4bS1AMZe39: a priced SOL send. Real fee 7,700 (2 built-in steps = 6,000 units); the old rule said 95,000.
  const send = await feeOf(from, [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 450_000 }), SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: 1 })]);
  assert.equal(send.computeUnitLimit, 6_000);
  assert.equal(send.totalLamports, "7700");
  // Like 6VqjM58ADG: price, open the recipient's account, send USDC. Real fee 9,030 (3,000 + 200,000 + 200,000 units).
  const usdc = new PublicKey(USDC_MINT);
  const toAccount = getAssociatedTokenAddressSync(usdc, to);
  const token = await feeOf(from, [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
    createAssociatedTokenAccountIdempotentInstruction(from, toAccount, to, usdc),
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(usdc, from), usdc, toAccount, from, 1n, 6),
  ]);
  assert.equal(token.totalLamports, "9030");
});

test("each signature a built-in signature check verifies costs the base fee, like a signer's", async () => {
  // Like 3Vhqf6VRAy: a compute limit, no priority price, and an Ed25519 check of 1 signature. Real fee 10,000.
  const fee = await feeOf(Keypair.generate().publicKey, [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 53_529 }),
    new TransactionInstruction({ programId: new PublicKey("Ed25519SigVerify111111111111111111111111111"), keys: [], data: Buffer.from([1, 0]) }),
  ]);
  assert.equal(fee.totalLamports, "10000");
});

test("whats_this: an address with no SOL says whether it holds tokens and was used before, and says unknown when it can't tell", async () => {
  const tool = TOOLS_BY_NAME.get("whats_this")!;
  const wallet = "HGKYVGfQGvWdd9Y7uEm7NyHHPjmf5KMFAkfeYMvk5nVV";
  const ctxWith = (tokens: number[] | null, signatures: number | null = 0) => ({
    connection: () => ({
      getParsedAccountInfo: async () => ({ value: null }),
      getTokenAccountsByOwner: async () => { if (!tokens) throw new Error("RPC down"); return { value: tokens.splice(0, 1).flatMap((n) => Array(n).fill({})) }; },
      getSignaturesForAddress: async () => { if (signatures === null) throw new Error("RPC down"); return Array(signatures).fill({}); },
    }) as any,
    fetchJson: async () => ({}),
  });
  const holds: any = await tool.run({ address: wallet, network: "mainnet-beta" }, ctxWith([1, 0]));
  assert.equal(holds.kind, "wallet");
  assert.equal(holds.details.token_accounts, 1);
  assert.match(holds.summary, /no SOL that holds 1 token account/);
  const empty: any = await tool.run({ address: wallet, network: "mainnet-beta" }, ctxWith([0, 0]));
  assert.equal(empty.kind, "not_found");
  assert.equal(empty.details.has_history, false);
  assert.match(empty.summary, /Nothing has ever happened here/);
  // 2026-10-27: an address that got dust and was emptied was called "never received anything".
  const emptied: any = await tool.run({ address: wallet, network: "mainnet-beta" }, ctxWith([0, 0], 1));
  assert.equal(emptied.details.has_history, true);
  assert.match(emptied.summary, /Empty now, but used before/);
  const historyUnknown: any = await tool.run({ address: wallet, network: "mainnet-beta" }, ctxWith([0, 0], null));
  assert.equal(historyUnknown.details.has_history, null);
  assert.match(historyUnknown.summary, /Whether it was used before couldn't be checked/);
  const unknown: any = await tool.run({ address: wallet, network: "mainnet-beta" }, ctxWith(null));
  assert.equal(unknown.details.token_accounts, null);
  assert.match(unknown.summary, /couldn't be checked/);
});
