// An elizaOS plugin with one action, SEND_SOL. It builds the transfer the user asked for, has Solana Pulse check it
// (check_tx must say OK, tx_matches must say MATCH), and only then signs. Dry run unless PULSE_SEND=1.
// Add it to a character: plugins: [pulseSafetyPlugin]. Settings come from the environment (WALLET_ADDRESS or
// SOLANA_PRIVATE_KEY, PULSE_SEND, optional PULSE_API_KEY).
import type { Action, ActionResult, Plugin } from "@elizaos/core";
import { describe, sendSolChecked } from "./wallet";

// "send 0.5 SOL to <address>": a simple pattern keeps the template readable; a production plugin would usually ask
// the model to extract these. Either way, the address and amount come from the user's words, never from a transaction.
export function parseRequest(text: string): { to: string; amount: string } | null {
  const to = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/)?.[0];
  const amount = text.match(/(\d+(?:\.\d+)?)\s*SOL\b/i)?.[1];
  return to && amount ? { to, amount } : null;
}

export const sendSolAction: Action = {
  name: "SEND_SOL",
  similes: ["TRANSFER_SOL", "PAY_SOL"],
  description: "Send SOL to a wallet. Solana Pulse checks the transaction before it is signed; if either check fails, nothing is signed.",
  validate: async (_runtime, message) => parseRequest(message.content.text ?? "") !== null,
  handler: async (_runtime, message, _state, _options, callback): Promise<ActionResult> => {
    const request = parseRequest(message.content.text ?? "");
    if (!request) return { success: false, text: 'Say it like "send 0.1 SOL to <address>".' };
    const result = await sendSolChecked(request.to, request.amount);
    const text = describe(result);
    await callback?.({ text, actions: ["SEND_SOL"] });
    return { success: result.allowed, text, data: { allowed: result.allowed, sent: result.sent, dryRun: result.dryRun, reasons: result.reasons, signature: result.signature } };
  },
  examples: [
    [
      { name: "{{user}}", content: { text: "send 0.001 SOL to Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU" } },
      { name: "{{agent}}", content: { text: "Both checks passed. Dry run: not signed or sent.", actions: ["SEND_SOL"] } },
    ],
  ],
};

export const pulseSafetyPlugin: Plugin = {
  name: "pulse-safety",
  description: "Checks every SOL transfer with Solana Pulse before signing (dry run by default).",
  actions: [sendSolAction],
};

export default pulseSafetyPlugin;
