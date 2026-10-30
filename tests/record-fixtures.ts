// Records the safety scenarios against live mainnet into tests/fixtures/. Run with `npm run test:record`
// (uses SOLANA_MAINNET_RPC_URL when set, otherwise the public RPC). Nothing is signed or sent: every call is a read or a simulation.
import { clusterApiUrl, ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { z } from "zod";
import "dotenv/config";
import { getCompiledTransactionMessageEncoder, getTransactionEncoder } from "@solana/kit";
import { checkTransactionIntent, exampleTransaction, explainTransaction, feeAdvice, preflightTransaction } from "../server/tools/transactions";
import { txVersion } from "../server/tools/version";
import { tokenVerdict } from "../server/tools/tokens";
import { buildTransaction } from "../server/tools/build";
import { EXAMPLE_RECIPIENT, EXAMPLE_WALLET, NATIVE_MINT, USDC_MINT } from "../server/tools/lib";
import { jupiterSwap } from "../benchmark/cases";
import type { ToolDef } from "../server/tools";
import { recordingContext, saveFixture } from "./helpers/replay";

const RPC = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl("mainnet-beta");
const payer = new PublicKey(EXAMPLE_WALLET);
const recipient = new PublicKey(EXAMPLE_RECIPIENT);
const usdc = new PublicKey(USDC_MINT);
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
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
// A version 1 transaction: 0.01 SOL, with its compute limit and priority fee in the config. Neither web3.js nor kit
// 6.10 builds v1 yet, so the compiled message is written out field by field (the layout kit decodes v1 with).
async function buildV1(conn: Connection) {
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const data = Buffer.alloc(12);
  data.writeUInt32LE(2, 0);
  data.writeBigUInt64LE(10_000_000n, 4);
  const message = {
    version: 1, header: { numSignerAccounts: 1, numReadonlySignerAccounts: 0, numReadonlyNonSignerAccounts: 1 },
    // Priority fee, compute limit and loaded-data limit, as real v1 transactions set them (without a data limit the
    // network rejects it: MaxLoadedAccountsDataSizeExceeded).
    configMask: 3 | 4 | 8, configValues: [{ kind: "u64", value: 1000n }, { kind: "u32", value: 450 }, { kind: "u32", value: 65_536 }],
    lifetimeToken: blockhash, numInstructions: 1, numStaticAccounts: 3,
    staticAccounts: [EXAMPLE_WALLET, EXAMPLE_RECIPIENT, SystemProgram.programId.toBase58()],
    instructionHeaders: [{ programAccountIndex: 2, numInstructionAccounts: 2, numInstructionDataBytes: 12 }],
    instructionPayloads: [{ instructionAccountIndices: [0, 1], instructionData: new Uint8Array(data) }],
  };
  const messageBytes = getCompiledTransactionMessageEncoder().encode(message as any);
  return Buffer.from(getTransactionEncoder().encode({ messageBytes, signatures: { [EXAMPLE_WALLET]: null } } as any)).toString("base64");
}
// A real v1 SOL transfer that landed on mainnet on 2026-10-19.
const V1_SIGNATURE = "4nh2hRWKbWLdzJijZWgZv3Fgmh1bMrBUho5fWJFGJYAZkv7d9x3Yz2qMhAG5o2i6Qfd9AeRakKC88aqwtvg5Mr8H";
const intent = (token: string, amount: string) => ({ token, amount, to: EXAMPLE_RECIPIENT });

const SCENARIOS: { name: string; tool: ToolDef; args: (conn: Connection) => Promise<Record<string, unknown>> }[] = [
  { name: "preflight-drainer-approval", tool: preflightTransaction, args: async (c) => ({ tx: await exampleTransaction(c, "drainer_approve") }) },
  { name: "preflight-sol-transfer", tool: preflightTransaction, args: async (c) => ({ tx: await exampleTransaction(c, "sol_transfer") }) },
  { name: "intent-sol-match", tool: checkTransactionIntent, args: async (c) => ({ tx: await build(c, [sendSol(10_000_000)]), expected: intent("SOL", "0.01") }) },
  {
    name: "intent-hidden-outflow", tool: checkTransactionIntent,
    args: async (c) => ({
      tx: await build(c, [sendSol(10_000_000), SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: stranger, lamports: 5_000_000_000, space: 0, programId: SystemProgram.programId })]),
      expected: intent("SOL", "0.01"),
    }),
  },
  {
    name: "intent-usdc-new-account", tool: checkTransactionIntent,
    args: async (c) => ({
      tx: await build(c, [ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 }), ...sendUsdc(toUsdc, recipient, 1_000_000n)]),
      expected: intent(USDC_MINT, "1"),
    }),
  },
  { name: "intent-usdc-wrong-amount", tool: checkTransactionIntent, args: async (c) => ({ tx: await build(c, sendUsdc(toUsdc, recipient, 10_000_000n)), expected: intent(USDC_MINT, "1") }) },
  {
    name: "intent-usdc-extra-transfer", tool: checkTransactionIntent,
    args: async (c) => ({ tx: await build(c, [...sendUsdc(toUsdc, recipient, 1_000_000n), ...sendUsdc(strangerUsdc, stranger, 5_000_000n)]), expected: intent(USDC_MINT, "1") }),
  },
  // Real Jupiter swaps that do what was asked: the bought token comes back to the wallet. Selling SOL wraps and
  // unwraps it, so the SOL path is checked too.
  {
    name: "intent-swap-usdc-jup-match", tool: checkTransactionIntent,
    args: async (c) => ({ tx: await jupiterSwap(c, { sell: USDC_MINT, buy: JUP, amount: 1_000_000n }), expected: { action: "swap", sell: USDC_MINT, amount: "1", buy: JUP, from: EXAMPLE_WALLET } }),
  },
  {
    name: "intent-swap-sol-usdc-match", tool: checkTransactionIntent,
    args: async (c) => ({ tx: await jupiterSwap(c, { sell: NATIVE_MINT, buy: USDC_MINT, amount: 10_000_000n }), expected: { action: "swap", sell: "SOL", amount: "0.01", buy: USDC_MINT, from: EXAMPLE_WALLET } }),
  },
  { name: "preflight-v1-sol-transfer", tool: preflightTransaction, args: async (c) => ({ tx: await buildV1(c) }) },
  { name: "intent-v1-sol-match", tool: checkTransactionIntent, args: async (c) => ({ tx: await buildV1(c), expected: intent("SOL", "0.01") }) },
  { name: "fee-v1", tool: feeAdvice, args: async (c) => ({ tx: await buildV1(c) }) },
  { name: "explain-v1", tool: explainTransaction, args: async () => ({ tx_id: V1_SIGNATURE }) },
  { name: "version-v1", tool: txVersion, args: async () => ({ tx_id: V1_SIGNATURE }) },
  { name: "token-verdict-usdc", tool: tokenVerdict, args: async () => ({ token: USDC_MINT }) },
  // An established token that should pass every check, sell test included.
  { name: "token-verdict-jup", tool: tokenVerdict, args: async () => ({ token: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" }) },
  // A brand-new pump.fun token whose creator has rugged before (RugCheck, 2026-10-14).
  { name: "token-verdict-rugger", tool: tokenVerdict, args: async () => ({ token: "G2YQ1fjjKTXqcDDQNAnCuWp3K2pdjtmhWWG4FTFDpump" }) },
  // A verified liquid staking token whose top holders own most of the supply (Jupiter's JupSOL, 2026-10-16 audit).
  { name: "token-verdict-lst", tool: tokenVerdict, args: async () => ({ token: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v" }) },
  // A tokenized stock whose permanent delegate is its issuer, xStocks (Tesla xStock, 2026-10-16 audit).
  { name: "token-verdict-xstock", tool: tokenVerdict, args: async () => ({ token: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB" }) },
  // A 2023 memecoin with no market left: Jupiter has no liquidity for it and its router answers TOKEN_NOT_TRADABLE.
  { name: "token-verdict-dead", tool: tokenVerdict, args: async () => ({ token: "EfJ2sLufzUZS7jA82N4VGF1syeFncjP7VpRtzaGyZrk2" }) },
  // build_tx (2026-10-29): what it builds must pass check_tx and tx_matches; a swap into a rug token must be refused.
  { name: "build-sol-transfer", tool: buildTransaction, args: async () => ({ action: "transfer", from: EXAMPLE_WALLET, to: EXAMPLE_RECIPIENT, token: "SOL", amount: "0.01" }) },
  { name: "build-usdt-transfer", tool: buildTransaction, args: async () => ({ action: "transfer", from: EXAMPLE_WALLET, to: EXAMPLE_RECIPIENT, token: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", amount: "1" }) },
  { name: "build-swap-bonk", tool: buildTransaction, args: async () => ({ action: "swap", from: EXAMPLE_WALLET, token: "SOL", amount: "0.01", buy: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" }) },
  { name: "build-swap-rugger", tool: buildTransaction, args: async () => ({ action: "swap", from: EXAMPLE_WALLET, token: "SOL", amount: "0.01", buy: "G2YQ1fjjKTXqcDDQNAnCuWp3K2pdjtmhWWG4FTFDpump" }) },
];

// Name scenarios to record only those (`npm run test:record -- token-verdict-jup`); with none, all are recorded.
const only = process.argv.slice(2);
for (const scenario of SCENARIOS.filter((s) => !only.length || only.includes(s.name))) {
  const { ctx, connection, recording } = recordingContext(RPC);
  const args = await scenario.args(connection);
  const result = await scenario.tool.run(z.object(scenario.tool.inputs).parse(args), ctx);
  saveFixture({ name: scenario.name, recordedAt: new Date().toISOString(), args, recording });
  console.log(`${scenario.name}: ${String(result.verdict ?? "recorded")}`);
}
