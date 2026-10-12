// Records the safety scenarios against live mainnet into tests/fixtures/. Run with `npm run test:record`
// (uses SOLANA_MAINNET_RPC_URL when set, otherwise the public RPC). Nothing is signed or sent: every call is a read or a simulation.
import { clusterApiUrl, ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { z } from "zod";
import "dotenv/config";
import { checkTransactionIntent, exampleTransaction, preflightTransaction } from "../server/tools/transactions";
import { tokenVerdict } from "../server/tools/tokens";
import { EXAMPLE_RECIPIENT, EXAMPLE_WALLET, USDC_MINT } from "../server/tools/lib";
import type { ToolDef } from "../server/tools";
import { recordingContext, saveFixture } from "./helpers/replay";

const RPC = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta");
const payer = new PublicKey(EXAMPLE_WALLET);
const recipient = new PublicKey(EXAMPLE_RECIPIENT);
const usdc = new PublicKey(USDC_MINT);
// A fresh address standing in for an attacker; it is fixed into each recorded transaction.
const stranger = Keypair.generate().publicKey;
const fromUsdc = getAssociatedTokenAddressSync(usdc, payer, true);
const toUsdc = getAssociatedTokenAddressSync(usdc, recipient, true);
const strangerUsdc = getAssociatedTokenAddressSync(usdc, stranger, true);

async function build(conn: Connection, instructions: TransactionInstruction[]) {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString("base64");
}
const sendSol = (lamports: number) => SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports });
const sendUsdc = (to: PublicKey, owner: PublicKey, baseUnits: bigint) => [
  createAssociatedTokenAccountIdempotentInstruction(payer, to, owner, usdc),
  createTransferCheckedInstruction(fromUsdc, usdc, to, payer, baseUnits, 6),
];
const intent = (token: string, amount: string) => ({ action: "transfer", token, amount, recipient: EXAMPLE_RECIPIENT });

const SCENARIOS: { name: string; tool: ToolDef; args: (conn: Connection) => Promise<Record<string, unknown>> }[] = [
  { name: "preflight-drainer-approval", tool: preflightTransaction, args: async (c) => ({ transaction: await exampleTransaction(c, "drainer_approve") }) },
  { name: "preflight-sol-transfer", tool: preflightTransaction, args: async (c) => ({ transaction: await exampleTransaction(c, "sol_transfer") }) },
  { name: "intent-sol-match", tool: checkTransactionIntent, args: async (c) => ({ transaction: await build(c, [sendSol(10_000_000)]), intent: intent("SOL", "0.01") }) },
  {
    name: "intent-hidden-outflow", tool: checkTransactionIntent,
    args: async (c) => ({
      transaction: await build(c, [sendSol(10_000_000), SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: stranger, lamports: 5_000_000_000, space: 0, programId: SystemProgram.programId })]),
      intent: intent("SOL", "0.01"),
    }),
  },
  {
    name: "intent-usdc-new-account", tool: checkTransactionIntent,
    args: async (c) => ({
      transaction: await build(c, [ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }), ...sendUsdc(toUsdc, recipient, 1_000_000n)]),
      intent: intent(USDC_MINT, "1"),
    }),
  },
  { name: "intent-usdc-wrong-amount", tool: checkTransactionIntent, args: async (c) => ({ transaction: await build(c, sendUsdc(toUsdc, recipient, 10_000_000n)), intent: intent(USDC_MINT, "1") }) },
  {
    name: "intent-usdc-extra-transfer", tool: checkTransactionIntent,
    args: async (c) => ({ transaction: await build(c, [...sendUsdc(toUsdc, recipient, 1_000_000n), ...sendUsdc(strangerUsdc, stranger, 5_000_000n)]), intent: intent(USDC_MINT, "1") }),
  },
  { name: "token-verdict-usdc", tool: tokenVerdict, args: async () => ({ mint: USDC_MINT }) },
];

for (const scenario of SCENARIOS) {
  const { ctx, connection, recording } = recordingContext(RPC);
  const args = await scenario.args(connection);
  const result = await scenario.tool.run(z.object(scenario.tool.inputs).parse(args), ctx);
  saveFixture({ name: scenario.name, recordedAt: new Date().toISOString(), args, recording });
  console.log(`${scenario.name}: ${String(result.verdict ?? "recorded")}`);
}
