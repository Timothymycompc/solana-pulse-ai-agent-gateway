// Solana Pulse for JavaScript / TypeScript: check a Solana transaction before you sign it.
//
//   import { checkBeforeSign } from "solana-pulse";
//   await checkBeforeSign(tx);   // throws PulseBlockedError unless Pulse answers OK
//   tx.sign([wallet]);
//
// No dependencies: uses fetch (Node 18+, browsers, edge runtimes). Each tool gives 25 free calls a day per caller; after
// that Pulse answers 402 with x402 payment terms. Set PULSE_API_KEY (or pass apiKey) to use a key. "OK" means none of the
// traps Pulse knows about are present; no check can promise a transaction is safe.
export const DEFAULT_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
export const VERSION = "0.1.0";

export interface PulseOptions {
  /** Pulse API key. Default: the PULSE_API_KEY environment variable (Node). */
  apiKey?: string;
  /** Pulse base URL. Default: PULSE_URL, then the public gateway. */
  baseUrl?: string;
  /** "mainnet-beta" (default) or "devnet". */
  network?: "mainnet-beta" | "devnet";
}

export type Expected =
  | { action: "swap"; sell: string; amount: string; buy: string; from?: string }
  | { action?: "transfer"; token: string; amount: string; to: string; from?: string };

/** Thrown when Pulse doesn't answer OK, the transaction doesn't match `expected`, or Pulse couldn't check. */
export class PulseBlockedError extends Error {
  constructor(
    message: string,
    /** BLOCK, REVIEW, MISMATCH, UNKNOWN (couldn't check) or PAYMENT_REQUIRED (free calls used up). */
    readonly verdict: string,
    /** Pulse's full answer, when there is one. */
    readonly check?: Record<string, any>,
    /** x402 payment terms, when verdict is PAYMENT_REQUIRED. */
    readonly x402?: unknown,
  ) {
    super(message);
    this.name = "PulseBlockedError";
  }
}

const env = (name: string) => (typeof process !== "undefined" ? process.env?.[name] : undefined);

function base64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** Base64 for a transaction given as base64 text, bytes, or a @solana/web3.js Transaction / VersionedTransaction
 *  (a legacy Transaction is serialized unsigned, so it can be checked before signing). */
export function toBase64(tx: unknown): string {
  if (typeof tx === "string") return tx;
  if (tx instanceof Uint8Array) return base64(tx);
  const t = tx as any;
  if (t && typeof t.serialize === "function") {
    return base64("version" in t ? t.serialize() : t.serialize({ requireAllSignatures: false, verifySignatures: false }));
  }
  throw new TypeError("Pass the transaction as base64, bytes, or a @solana/web3.js Transaction / VersionedTransaction.");
}

/** Calls one Pulse tool and returns its answer. Throws PulseBlockedError (UNKNOWN / PAYMENT_REQUIRED) when it can't. */
export async function callPulse(tool: string, input: Record<string, unknown>, options: PulseOptions = {}): Promise<Record<string, any>> {
  const baseUrl = (options.baseUrl || env("PULSE_URL") || DEFAULT_URL).replace(/\/$/, "");
  const key = options.apiKey || env("PULSE_API_KEY");
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/tools/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `solana-pulse-js/${VERSION}`, ...(key ? { "x-api-key": key } : {}) },
      body: JSON.stringify({ ...input, network: options.network ?? "mainnet-beta" }),
    });
  } catch (error) {
    throw new PulseBlockedError(`Couldn't reach Solana Pulse at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`, "UNKNOWN");
  }
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 402) {
    let terms: unknown = null;
    try { terms = JSON.parse(atob(res.headers.get("payment-required") ?? "")); } catch { /* no terms */ }
    throw new PulseBlockedError(`${tool}: today's 25 free calls are used up. Pay per call with x402 (USDC on Solana), set PULSE_API_KEY, or wait for the reset at 00:00 UTC. Details: ${baseUrl}/docs/connect`, "PAYMENT_REQUIRED", undefined, terms);
  }
  if (!res.ok) throw new PulseBlockedError(`${tool}: Solana Pulse answered HTTP ${res.status}: ${data?.error ?? "no details"}`, "UNKNOWN");
  return data;
}

/** Dry-runs the transaction and answers OK, REVIEW or BLOCK with each wallet's SOL and token changes. */
export const checkTx = (tx: unknown, options?: PulseOptions) => callPulse("check_tx", { tx: toBase64(tx) }, options);

/** Confirms a transfer ({ token, amount, to }) or swap ({ action: "swap", sell, amount, buy }) does exactly that. */
export const txMatches = (tx: unknown, expected: Expected, options?: PulseOptions) => callPulse("tx_matches", { tx: toBase64(tx), expected }, options);

/** SAFE, CAUTION or AVOID for a token mint, with reasons. */
export const tokenSafety = (token: string, options?: PulseOptions) => callPulse("token_safety", { token }, options);

/** Call right before signing. Returns Pulse's check when it answers OK (or REVIEW with allowReview). Throws
 *  PulseBlockedError on BLOCK, on REVIEW unless allowed, when `expected` doesn't match, and when Pulse couldn't check:
 *  "couldn't check" is never treated as safe. */
export async function checkBeforeSign(tx: unknown, options: PulseOptions & { expected?: Expected; allowReview?: boolean } = {}): Promise<Record<string, any>> {
  const b64 = toBase64(tx);
  const check = await callPulse("check_tx", { tx: b64 }, options);
  const verdict = String(check.verdict ?? "UNKNOWN");
  if (!(verdict === "OK" || (verdict === "REVIEW" && options.allowReview))) {
    throw new PulseBlockedError(String(check.summary ?? `Pulse answered ${verdict}.`), verdict, check);
  }
  if (!options.expected) return check;
  const match = await callPulse("tx_matches", { tx: b64, expected: options.expected }, options);
  if (match.verdict !== "MATCH") throw new PulseBlockedError(String(match.summary ?? "The transaction doesn't match what was asked for."), String(match.verdict ?? "MISMATCH"), match);
  return { ...check, tx_matches: match };
}
