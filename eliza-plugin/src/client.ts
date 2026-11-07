// Calls one Solana Pulse tool over HTTP. Settings come from the agent (runtime.getSetting) or the environment:
// PULSE_API_KEY (optional) and PULSE_URL (optional). Without a key each tool gives 25 free calls a day; past that Pulse
// answers 402 and the result says how to pay or where to get a key, instead of throwing.
import type { RuntimeLike } from "./types";

export const DEFAULT_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
export const PLUGIN_VERSION = "0.1.0";
const FREE_CALLS = 25;

export interface Settings {
  url?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export type PulseAnswer =
  | { ok: true; data: Record<string, any> }
  | { ok: false; message: string; fix?: string; paymentRequired?: boolean; x402?: unknown };

const env = (name: string) => (typeof process !== "undefined" ? process.env?.[name] : undefined);

export function settingsFrom(source?: RuntimeLike | Settings): Settings {
  if (source && typeof (source as RuntimeLike).getSetting === "function") {
    const read = (k: string) => {
      const v = (source as RuntimeLike).getSetting!(k);
      return typeof v === "string" && v ? v : env(k);
    };
    return { url: read("PULSE_URL"), apiKey: read("PULSE_API_KEY") };
  }
  const s = (source as Settings) ?? {};
  return { url: s.url ?? env("PULSE_URL"), apiKey: s.apiKey ?? env("PULSE_API_KEY"), headers: s.headers };
}

// Transactions may be passed as objects; Pulse takes base64. A versioned transaction serializes as is; a legacy one
// serializes unsigned so it can be checked before signing.
export function toBase64(tx: unknown): unknown {
  if (!tx || typeof tx === "string" || typeof (tx as any).serialize !== "function") return tx;
  const bytes = "version" in (tx as any) ? (tx as any).serialize() : (tx as any).serialize({ requireAllSignatures: false, verifySignatures: false });
  return Buffer.from(bytes).toString("base64");
}

export async function callPulse(source: RuntimeLike | Settings | undefined, tool: string, input: Record<string, unknown>): Promise<PulseAnswer> {
  const settings = settingsFrom(source);
  const base = (settings.url || DEFAULT_URL).replace(/\/$/, "");
  const body = { ...input, ...("tx" in input ? { tx: toBase64(input.tx) } : {}) };
  let res: Response;
  try {
    res = await fetch(`${base}/api/tools/${tool}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": `elizaos-plugin-solana-pulse/${PLUGIN_VERSION}`,
        ...(settings.apiKey ? { "x-api-key": settings.apiKey } : {}),
        ...(settings.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, message: `Could not reach Solana Pulse at ${base}: ${error instanceof Error ? error.message : String(error)}`, fix: "Check the network or PULSE_URL, then retry." };
  }
  const data: any = await res.json().catch(() => ({}));
  if (res.status === 402) {
    // x402 v2 puts the payment terms, base64 JSON, in the PAYMENT-REQUIRED header.
    let terms: any = null;
    try {
      terms = JSON.parse(Buffer.from(res.headers.get("payment-required") ?? "", "base64").toString("utf8"));
    } catch {
      /* no terms */
    }
    const accept = terms?.accepts?.[0];
    return {
      ok: false,
      paymentRequired: true,
      message: `This tool's ${FREE_CALLS} free calls for today are used up. Each further call is paid per request with x402 (USDC on Solana)${accept?.amount ? `: ${Number(accept.amount) / 1e6} USDC` : ""}.`,
      fix: `Pay with an x402 client against the same URL, wait for the daily reset (00:00 UTC), or set PULSE_API_KEY. Details: ${base}/docs/connect`,
      x402: terms,
    };
  }
  if (!res.ok) return { ok: false, message: data?.error ?? `Solana Pulse answered HTTP ${res.status}.`, ...(data?.fix ? { fix: data.fix } : {}) };
  return { ok: true, data };
}
