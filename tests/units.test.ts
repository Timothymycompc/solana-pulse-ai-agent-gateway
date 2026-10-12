// Exact amount math, error explanations and instruction decoding. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { AuthorityType, createApproveInstruction, createCloseAccountInstruction, createSetAuthorityInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { formatUnits, parseUnits, USDC_MINT } from "../server/tools/lib";
import { explainError } from "../server/tools/errors";
import { feeBreakdown, loadTransaction } from "../server/tools/decode";
import { ToolError } from "../server/tools";

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
  const { matches } = explainError("Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUJoi5QNyVTaV4 failed: custom program error: 0x1771", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUJoi5QNyVTaV4");
  assert.equal(matches[0]?.name, "SlippageToleranceExceeded");
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
