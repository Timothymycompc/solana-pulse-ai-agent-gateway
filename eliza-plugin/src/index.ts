// Solana Pulse for elizaOS: safety checks the agent can choose in chat, plus a guard for wallet code to call before
// it signs. Use the default export for every action, or createPulsePlugin({ actions }) for some.
import { ACTIONS, ACTION_NAMES } from "./actions";
import { callPulse, type Settings } from "./client";
import type { Plugin, RuntimeLike } from "./types";

export { ACTIONS, ACTION_NAMES } from "./actions";
export { callPulse, settingsFrom, toBase64, DEFAULT_URL, PLUGIN_VERSION, type PulseAnswer, type Settings } from "./client";
export { findAddress, findError, findSignature, findTicker, findTx } from "./extract";
export { replyText } from "./format";
export type { Action, ActionResult, Plugin } from "./types";

export function createPulsePlugin(options: { actions?: string[] } = {}): Plugin {
  const wanted = options.actions ?? ACTION_NAMES;
  return {
    name: "solana-pulse",
    description: "Solana safety checks from live mainnet data: check a transaction before signing, token safety, what an address is, why a transaction failed, and the real token behind a ticker.",
    actions: ACTIONS.filter((a) => wanted.includes(a.name)),
  };
}

export const pulsePlugin = createPulsePlugin();
export default pulsePlugin;

export class PulseBlockedError extends Error {
  constructor(message: string, readonly verdict: string, readonly check?: Record<string, unknown>) {
    super(message);
    this.name = "PulseBlockedError";
  }
}

// For wallet code: call before signing. Returns Pulse's full check when the verdict is OK (or REVIEW with allowReview).
// Throws on BLOCK, on REVIEW unless allowed, and when Pulse couldn't check at all: "couldn't check" is never treated as
// safe unless onUnknown is "allow".
export async function assertSafeToSign(
  source: RuntimeLike | Settings | undefined,
  tx: unknown,
  options: { allowReview?: boolean; onUnknown?: "throw" | "allow" } = {},
): Promise<Record<string, any> | null> {
  const answer = await callPulse(source, "check_tx", { tx });
  if (!answer.ok) {
    if (options.onUnknown === "allow") return null;
    throw new PulseBlockedError(`Couldn't check the transaction, so it wasn't treated as safe: ${answer.message}`, "UNKNOWN");
  }
  const verdict = String(answer.data.verdict ?? "UNKNOWN");
  if (verdict === "OK" || (verdict === "REVIEW" && options.allowReview)) return answer.data;
  throw new PulseBlockedError(String(answer.data.summary ?? `Pulse answered ${verdict}.`), verdict, answer.data);
}

// For a transfer or swap built from what the user asked: confirms the transaction does exactly that.
export async function txMatches(source: RuntimeLike | Settings | undefined, tx: unknown, expected: Record<string, unknown>) {
  return callPulse(source, "tx_matches", { tx, expected });
}
