// The actions the agent can choose. Each takes its input from the handler's options (when called from code) or finds
// it in the user's message by its exact shape. If it isn't there, the action asks for it and calls nothing.
import { callPulse } from "./client";
import { findAddress, findError, findSignature, findTicker, findTx } from "./extract";
import { replyText } from "./format";
import type { Action, ActionExample } from "./types";

interface Spec {
  name: string;
  tool: string;
  field: string;
  find: (text: string) => string | undefined;
  missing: string;
  similes: string[];
  description: string;
  example: [string, string];
}

const SPECS: Spec[] = [
  {
    name: "PULSE_CHECK_TX",
    tool: "check_tx",
    field: "tx",
    find: findTx,
    missing: "Send the transaction as base64, before signing, and I'll check it.",
    similes: ["CHECK_TRANSACTION", "SAFE_TO_SIGN", "PRE_SIGN_CHECK", "SIMULATE_TRANSACTION"],
    description:
      "Check a Solana transaction before signing it: dry-runs it on mainnet and answers OK, REVIEW or BLOCK, with each wallet's SOL and token changes. Catches drainer approvals, ownership changes, failures and expired blockhashes. Needs the transaction as base64.",
    example: ["Is this safe to sign? AQAB...base64...", "BLOCK: Dry run failed: the token account is frozen by the token's freeze authority."],
  },
  {
    name: "PULSE_TOKEN_SAFETY",
    tool: "token_safety",
    field: "token",
    find: findAddress,
    missing: "Send the token's address (its mint), and I'll check it. If you only have the ticker, ask me to find the token first.",
    similes: ["CHECK_TOKEN", "IS_TOKEN_SAFE", "RUG_CHECK", "TOKEN_RISK"],
    description:
      "Check whether a Solana token is safe to buy: answers SAFE, CAUTION or AVOID with reasons, from a real sell test, whether liquidity can be pulled, the creator's record and insider wallets. Needs the token's mint address.",
    example: ["Is JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN safe to buy?", "No red flags found: the liquidity can't be pulled and the creator has no rug record."],
  },
  {
    name: "PULSE_WHATS_THIS",
    tool: "whats_this",
    field: "address",
    find: findAddress,
    missing: "Send the Solana address, and I'll say what it is.",
    similes: ["WHAT_IS_ADDRESS", "IDENTIFY_ADDRESS", "CHECK_ADDRESS"],
    description:
      "Say what a Solana address is before sending to it: a wallet, a token mint, a program or a token account. Warns when money sent there can't be recovered.",
    example: ["What is EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v?", "A token's own address (its mint). Never send money to it; it can't be recovered."],
  },
  {
    name: "PULSE_EXPLAIN_TX",
    tool: "explain_tx",
    field: "tx_id",
    find: findSignature,
    missing: "Send the transaction's signature, and I'll explain what it did.",
    similes: ["EXPLAIN_TRANSACTION", "WHAT_HAPPENED", "DECODE_TRANSACTION"],
    description: "Explain in plain words what a sent Solana transaction did: whether it succeeded, who paid, and each wallet's balance changes. Needs the transaction signature.",
    example: ["What did 4nh2hRWKbWLdzJijZWgZv3Fgmh1bMrBUho5fWJFGJYAZkv7d9x3Yz2qMhAG5o2i6Qfd9AeRakKC88aqwtvg5Mr8H do?", "Succeeded (System Program). The fee payer paid 0.000005 SOL in fees."],
  },
  {
    name: "PULSE_WHY_FAILED",
    tool: "why_failed",
    field: "error",
    find: findError,
    missing: "Send the error exactly as you got it, like \"custom program error: 0x1771\", and I'll explain it.",
    similes: ["EXPLAIN_ERROR", "TRANSACTION_FAILED", "DECODE_ERROR"],
    description: "Explain why a Solana transaction failed, from the error as the wallet or RPC showed it, with the likely cause and the fix.",
    example: ["My swap failed with custom program error: 0x1771", "Custom program error 6001: program-defined, so the meaning depends on which program failed."],
  },
  {
    name: "PULSE_FIND_TOKEN",
    tool: "find_token",
    field: "name",
    find: findTicker,
    missing: "Send the ticker with a $ in front, like $BONK, and I'll find the real token.",
    similes: ["FIND_MINT", "TICKER_TO_ADDRESS", "LOOKUP_TOKEN"],
    description: "Find the real token behind a ticker or name, and warn about copycats that use the same name. Returns the mint address to use.",
    example: ["What's the address for $BONK?", "Bonk (Bonk): DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263. Confidence: high. 2 other tokens use a similar name."],
  },
];

function examplesOf(spec: Spec): ActionExample[][] {
  return [[
    { name: "{{user1}}", content: { text: spec.example[0] } },
    { name: "{{agentName}}", content: { text: spec.example[1], actions: [spec.name] } },
  ]];
}

function actionOf(spec: Spec): Action {
  return {
    name: spec.name,
    similes: spec.similes,
    description: spec.description,
    examples: examplesOf(spec),
    async validate(_runtime, message) {
      return Boolean(spec.find(message?.content?.text ?? ""));
    },
    async handler(runtime, message, _state, options, callback) {
      const given = options?.[spec.field] ?? (options?.parameters as Record<string, unknown> | undefined)?.[spec.field];
      const input = given ?? spec.find(message?.content?.text ?? "");
      const source = message?.content?.source;
      if (!input) {
        await callback?.({ text: spec.missing, actions: [spec.name], source });
        return { success: false, text: spec.missing, error: "missing input" };
      }
      const answer = await callPulse(runtime, spec.tool, { [spec.field]: input });
      if (!answer.ok) {
        const text = [answer.message, answer.fix].filter(Boolean).join("\n");
        await callback?.({ text, actions: [spec.name], source });
        return { success: false, text, error: answer.message, data: { paymentRequired: Boolean(answer.paymentRequired), x402: answer.x402 } };
      }
      const text = replyText(spec.tool, answer.data);
      await callback?.({ text, actions: [spec.name], source });
      return { success: true, text, data: answer.data, values: typeof answer.data.verdict === "string" ? { pulseVerdict: answer.data.verdict } : {} };
    },
  };
}

export const ACTIONS: Action[] = SPECS.map(actionOf);
export const ACTION_NAMES = SPECS.map((s) => s.name);
