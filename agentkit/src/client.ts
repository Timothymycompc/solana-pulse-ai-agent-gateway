// Calls one Solana Pulse tool over HTTPS. Settings come from the provider's config or the environment (PULSE_API_KEY,
// PULSE_URL). Without a key each tool gives 25 free calls a day; past that Pulse answers 402 and this returns the x402
// payment terms instead of throwing.
export const DEFAULT_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
export const PACKAGE_VERSION = "0.1.0";

export interface PulseConfig {
  /** Pulse API key. Default: the PULSE_API_KEY environment variable. */
  apiKey?: string;
  /** Pulse base URL. Default: PULSE_URL, then the public gateway. */
  baseUrl?: string;
  /** Let check_and_send sign when Pulse answers REVIEW. Default false: only OK is signed. */
  allowReview?: boolean;
}

export type PulseAnswer =
  | { ok: true; data: Record<string, any> }
  | { ok: false; message: string; paymentRequired?: boolean; x402?: unknown };

const env = (name: string) => (typeof process !== "undefined" ? process.env[name] : undefined);

// Pulse takes base64. A versioned transaction serializes as is; a legacy one serializes unsigned so it can be checked
// before signing.
export function toBase64(tx: unknown): string {
  if (typeof tx === "string") return tx;
  if (tx instanceof Uint8Array) return Buffer.from(tx).toString("base64");
  const t = tx as any;
  if (t && typeof t.serialize === "function") {
    const bytes = "version" in t ? t.serialize() : t.serialize({ requireAllSignatures: false, verifySignatures: false });
    return Buffer.from(bytes).toString("base64");
  }
  throw new TypeError("Pass the transaction as base64, bytes, or a @solana/web3.js Transaction / VersionedTransaction.");
}

export async function callPulse(config: PulseConfig, tool: string, input: Record<string, unknown>): Promise<PulseAnswer> {
  const base = (config.baseUrl || env("PULSE_URL") || DEFAULT_URL).replace(/\/$/, "");
  const key = config.apiKey || env("PULSE_API_KEY");
  let res: Response;
  try {
    res = await fetch(`${base}/api/tools/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `agentkit-solana-pulse/${PACKAGE_VERSION}`, ...(key ? { "x-api-key": key } : {}) },
      body: JSON.stringify(input),
    });
  } catch (error) {
    return { ok: false, message: `Could not reach Solana Pulse at ${base}: ${error instanceof Error ? error.message : String(error)}` };
  }
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 402) {
    let terms: unknown = null;
    try { terms = JSON.parse(Buffer.from(res.headers.get("payment-required") ?? "", "base64").toString("utf8")); } catch { /* no terms */ }
    return {
      ok: false,
      paymentRequired: true,
      message: `${tool}: today's 25 free calls are used up. Pay per call with x402 (USDC on Solana), set PULSE_API_KEY, or wait for the reset at 00:00 UTC. Details: ${base}/docs/connect`,
      x402: terms,
    };
  }
  if (!res.ok) return { ok: false, message: data?.error ?? `Solana Pulse answered HTTP ${res.status}.` };
  return { ok: true, data };
}
