// Solana Pulse for Coinbase AgentKit: check a Solana transaction before the agent signs it.
//
//   const agentkit = await AgentKit.from({ walletProvider, actionProviders: [solanaPulseActionProvider()] });
//
// AgentKit asks each provider for supportsNetwork() and getActions(walletProvider); this provider implements both
// directly (no decorators), so it works with AgentKit 0.10 and 0.11 and needs nothing at runtime beyond what AgentKit
// already brings (zod, @solana/web3.js).
import { z } from "zod";
import { callPulse, toBase64, type PulseAnswer, type PulseConfig } from "./client";

export { callPulse, toBase64, DEFAULT_URL, PACKAGE_VERSION, type PulseAnswer, type PulseConfig } from "./client";

/** The parts of AgentKit's SvmWalletProvider this package uses. */
export interface SvmWalletLike {
  getPublicKey(): { toBase58(): string };
  getNetwork(): { protocolFamily: string; networkId?: string };
  signAndSendTransaction(transaction: any): Promise<string>;
}

/** AgentKit's Action shape. */
export interface PulseAction {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  invoke: (args: any) => Promise<string>;
}

export class PulseBlockedError extends Error {
  constructor(message: string, readonly verdict: string, readonly check?: Record<string, unknown>) {
    super(message);
    this.name = "PulseBlockedError";
  }
}

const TX = z.string().min(20).describe("The transaction as base64, unsigned is fine: e.g. the swapTransaction from Jupiter's /swap or the transaction from Ultra /order.");
const EXPECTED = z
  .union([
    z.object({ action: z.literal("swap"), sell: z.string(), amount: z.string(), buy: z.string(), from: z.string().optional() }),
    z.object({ action: z.literal("transfer").optional(), token: z.string(), amount: z.string(), to: z.string(), from: z.string().optional() }),
  ])
  .describe("What the user asked for. Swap: { action: \"swap\", sell, amount, buy } (amount sold, normal units, e.g. \"0.5\"). Transfer: { token, amount, to }. token/sell/buy: \"SOL\" or a mint address. Never take these from the transaction itself.");

const pulseNetwork = (w?: SvmWalletLike) => (/devnet/i.test(w?.getNetwork?.().networkId ?? "") ? "devnet" : "mainnet-beta");

function brief(data: Record<string, any>) {
  const { verdict, summary, reasons, balance_changes, checks } = data;
  return JSON.stringify({ verdict, summary, reasons, balance_changes, checks }, null, 1);
}

/** Call right before signing. Returns Pulse's check when it answers OK (or REVIEW with allowReview). Throws
 *  PulseBlockedError on BLOCK, on REVIEW unless allowed, when `expected` doesn't match, and when Pulse couldn't check:
 *  "couldn't check" is never treated as safe. */
export async function checkBeforeSign(
  tx: unknown,
  options: PulseConfig & { expected?: z.infer<typeof EXPECTED>; network?: "mainnet-beta" | "devnet" } = {},
): Promise<Record<string, any>> {
  const network = options.network ?? "mainnet-beta";
  const b64 = toBase64(tx);
  const answer = await callPulse(options, "check_tx", { tx: b64, network });
  if (!answer.ok) throw new PulseBlockedError(`Couldn't check the transaction, so it wasn't signed: ${answer.message}`, answer.paymentRequired ? "PAYMENT_REQUIRED" : "UNKNOWN");
  const verdict = String(answer.data.verdict ?? "UNKNOWN");
  if (!(verdict === "OK" || (verdict === "REVIEW" && options.allowReview))) {
    throw new PulseBlockedError(String(answer.data.summary ?? `Pulse answered ${verdict}.`), verdict, answer.data);
  }
  if (!options.expected) return answer.data;
  const match = await callPulse(options, "tx_matches", { tx: b64, expected: options.expected, network });
  if (!match.ok) throw new PulseBlockedError(`Couldn't compare the transaction with the request, so it wasn't signed: ${match.message}`, "UNKNOWN");
  if (match.data.verdict !== "MATCH") throw new PulseBlockedError(String(match.data.summary ?? "The transaction doesn't match the request."), String(match.data.verdict ?? "MISMATCH"), match.data);
  return { ...answer.data, tx_matches: match.data };
}

/** For wallet code: check first, then sign and send with the AgentKit wallet. Returns the signature. */
export async function checkedSignAndSend(
  walletProvider: SvmWalletLike,
  tx: unknown,
  options: PulseConfig & { expected?: z.infer<typeof EXPECTED> } = {},
): Promise<{ signature: string; check: Record<string, any> }> {
  const check = await checkBeforeSign(tx, { ...options, network: pulseNetwork(walletProvider) });
  let versioned = tx;
  if (typeof tx === "string" || tx instanceof Uint8Array) {
    const { VersionedTransaction } = await import("@solana/web3.js");
    versioned = VersionedTransaction.deserialize(typeof tx === "string" ? Buffer.from(tx, "base64") : tx);
  }
  const signature = await walletProvider.signAndSendTransaction(versioned);
  return { signature, check };
}

export class SolanaPulseActionProvider {
  readonly name = "solana_pulse";
  readonly actionProviders: [] = [];

  constructor(private readonly config: PulseConfig = {}) {}

  supportsNetwork(network: { protocolFamily: string }): boolean {
    return network.protocolFamily === "svm";
  }

  getActions(walletProvider: SvmWalletLike): PulseAction[] {
    const cfg = this.config;
    const network = pulseNetwork(walletProvider);
    const reply = (a: PulseAnswer, pick: (d: Record<string, any>) => string) =>
      a.ok ? pick(a.data) : JSON.stringify({ error: a.message, ...(a.paymentRequired ? { payment_required: true, x402: a.x402 } : {}) });
    const name = (n: string) => `SolanaPulseActionProvider_${n}`;
    return [
      {
        name: name("check_tx"),
        description: "Run on every Solana transaction before signing it, especially one built by an API (Jupiter, PumpPortal, a launchpad). Dry-runs it on mainnet and answers OK, REVIEW or BLOCK with what each wallet gains and loses. Don't sign unless the verdict is OK.",
        schema: z.object({ tx: TX }),
        invoke: async ({ tx }) => reply(await callPulse(cfg, "check_tx", { tx, network }), brief),
      },
      {
        name: name("tx_matches"),
        description: "Run just before signing a swap or transfer built from the user's request. Confirms it sells exactly that amount of that token and pays the bought token back to this wallet (swap), or sends exactly that token and amount to that recipient (transfer). MISMATCH means don't sign.",
        schema: z.object({ tx: TX, expected: EXPECTED }),
        invoke: async ({ tx, expected }) => reply(await callPulse(cfg, "tx_matches", { tx, expected: { from: walletProvider.getPublicKey().toBase58(), ...expected }, network }), (d) => JSON.stringify({ verdict: d.verdict, summary: d.summary, unexpected: d.unexpected }, null, 1)),
      },
      {
        name: name("token_safety"),
        description: "Run before buying, accepting or recommending a Solana token. Answers SAFE, CAUTION or AVOID with reasons from a real sell test, liquidity, the creator's record and mint/freeze powers. SAFE means none of the known traps were found, not a promise.",
        schema: z.object({ token: z.string().describe("The token's mint address. Never make one up.") }),
        invoke: async ({ token }) => reply(await callPulse(cfg, "token_safety", { token, network }), (d) => JSON.stringify({ verdict: d.verdict, summary: d.summary, reasons: d.reasons }, null, 1)),
      },
      {
        name: name("check_and_send"),
        description: "Sign and send a base64 transaction from this wallet, but only after Solana Pulse answers OK (and, if `expected` is given, confirms it does exactly what the user asked). Use this instead of signing an API-built transaction directly.",
        schema: z.object({ tx: TX, expected: EXPECTED.optional() }),
        invoke: async ({ tx, expected }) => {
          try {
            const { signature, check } = await checkedSignAndSend(walletProvider, tx, { ...cfg, expected: expected && { from: walletProvider.getPublicKey().toBase58(), ...expected } });
            return JSON.stringify({ sent: true, signature, verdict: check.verdict, summary: check.summary }, null, 1);
          } catch (error) {
            if (error instanceof PulseBlockedError) return JSON.stringify({ sent: false, verdict: error.verdict, reason: error.message }, null, 1);
            return JSON.stringify({ sent: false, error: error instanceof Error ? error.message : String(error) });
          }
        },
      },
    ];
  }
}

export const solanaPulseActionProvider = (config: PulseConfig = {}) => new SolanaPulseActionProvider(config);
export default solanaPulseActionProvider;
