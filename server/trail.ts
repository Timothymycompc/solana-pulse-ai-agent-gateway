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

// A fetch for web3.js's Connection that notes each RPC method it sends.
export function rpcFetch(label: string): typeof fetch {
  return async (input, init) => {
    const started = performance.now();
    const methods = rpcMethods(init?.body);
    try {
      const res = await fetch(input, init);
      for (const m of methods) record(label, m, started, res.ok);
      return res;
    } catch (error) {
      for (const m of methods) record(label, m, started, false);
      throw error;
    }
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
