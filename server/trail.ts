import { AsyncLocalStorage } from "node:async_hooks";

// What one tool call asked the outside world, in order: the toolbox shows it as "what went out".
// Only the service, the RPC method or the URL path, the time and whether it worked. Never a URL's host
// for the RPC (it carries the provider key), never a query string, never headers.
export type TrailStep = { to: string; what: string; at: number; ms: number; ok: boolean };
type Trail = { t0: number; steps: TrailStep[] };

const store = new AsyncLocalStorage<Trail>();
const MAX_STEPS = 80;
export const TRAIL_HEADER = "x-pulse-trail";

export function withTrail<T>(fn: () => Promise<T>): Promise<{ result: T; steps: TrailStep[] }> {
  const trail: Trail = { t0: performance.now(), steps: [] };
  return store.run(trail, async () => ({ result: await fn(), steps: trail.steps }));
}

function record(to: string, what: string, started: number, ok: boolean) {
  const trail = store.getStore();
  if (!trail || trail.steps.length >= MAX_STEPS) return;
  trail.steps.push({ to, what, at: Math.round(started - trail.t0), ms: Math.round(performance.now() - started), ok });
}

// JSON-RPC method names from a request body (one call or a batch).
export function rpcMethods(body: unknown): string[] {
  try {
    const parsed = JSON.parse(String(body));
    return (Array.isArray(parsed) ? parsed : [parsed]).map((call) => String(call?.method ?? "unknown"));
  } catch {
    return ["unknown"];
  }
}

// How long the main RPC is skipped after it answers 429 (rate limit or "max usage reached": plan credits used up).
export const RPC_COOLDOWN_MS = 2 * 60_000;

// A fetch for web3.js's Connection that notes each RPC method it sends.
// With a backup URL: when the main RPC answers 429, the same request goes to the backup, and the main RPC is
// skipped for RPC_COOLDOWN_MS, then tried again. The trail names the backup (`<label> (backup)`) so the caller
// can see which source answered. 2026-11-19: Helius ran out of credits and half of all calls failed with 503.
export function rpcFetch(label: string, backupUrl?: string, now: () => number = Date.now): typeof fetch {
  let skipMainUntil = 0;
  const send = async (to: string, input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => {
    const started = performance.now();
    const methods = rpcMethods(init?.body);
    try {
      const res = await fetch(input, init);
      for (const m of methods) record(to, m, started, res.ok);
      return res;
    } catch (error) {
      for (const m of methods) record(to, m, started, false);
      throw error;
    }
  };
  return async (input, init) => {
    if (!backupUrl) return send(label, input, init);
    if (now() < skipMainUntil) return send(`${label} (backup)`, backupUrl, init);
    const res = await send(label, input, init);
    if (res.status !== 429) return res;
    skipMainUntil = now() + RPC_COOLDOWN_MS;
    return send(`${label} (backup)`, backupUrl, init);
  };
}

const SERVICE_NAMES: Record<string, string> = {
  "api.jup.ag": "Jupiter",
  "lite-api.jup.ag": "Jupiter",
  "api.rugcheck.xyz": "RugCheck",
};

// Service name and path for an outside HTTP call; addresses in the path become {address}.
export function describeUrl(url: string): { to: string; what: string } {
  const u = new URL(url);
  return { to: SERVICE_NAMES[u.host] ?? u.host, what: u.pathname.replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "{address}") };
}

export async function recordHttp<T>(url: string, call: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const { to, what } = describeUrl(url);
  try {
    const out = await call();
    record(to, what, started, true);
    return out;
  } catch (error) {
    record(to, what, started, false);
    throw error;
  }
}

// Header value: plain ASCII JSON, short enough for any proxy.
export const encodeTrail = (steps: TrailStep[]) => JSON.stringify(steps).replace(/[^\x20-\x7e]/g, "?");
