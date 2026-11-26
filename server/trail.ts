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

// How long the main RPC is skipped once it says its plan credits are used up ("max usage reached").
export const RPC_COOLDOWN_MS = 2 * 60_000;
// At most this many requests wait on one RPC at a time, per server instance. Helius's free plan allows about 10 a
// second; token_traders alone used to fire 10 getTransaction at once, plus web3.js's own retries (2026-11-26 logs).
export const RPC_MAX_IN_FLIGHT = Number(process.env.RPC_MAX_IN_FLIGHT) || 6;
// A per-second rate limit clears fast: wait this long, then ask the main RPC once more before using the backup.
export const RPC_RETRY_DELAY_MS = 600;

// The main RPC's plan credits are used up (not just too many requests this second).
export function isQuotaOut(bodyText: string): boolean {
  return /max usage|credits|quota/i.test(bodyText);
}

// Lets at most `max` tasks run at once; the rest wait their turn in order.
function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((go) => waiting.push(go));
    active++;
    try { return await task(); } finally { active--; waiting.shift()?.(); }
  };
}

type RpcFetchOptions = { maxInFlight?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<void> };

// A fetch for web3.js's Connection that notes each RPC method it sends, and sends at most RPC_MAX_IN_FLIGHT at once.
// With a backup URL, when the main RPC answers 429:
//   - credits used up ("max usage reached"): this request and all others go to the backup for RPC_COOLDOWN_MS,
//     then the main RPC is tried again (2026-11-19: Helius ran out of credits and half of all calls failed with 503);
//   - only too many requests this second: wait RPC_RETRY_DELAY_MS and ask the main RPC again; if it still says 429,
//     only this one request goes to the backup. Before 2026-11-26 one burst sent ALL traffic to Solana's public RPC for
//     2 minutes, which rate-limits far sooner, so token_traders, tx_version and trace failed in bursts.
// The trail names the backup (`<label> (backup)`) so the caller can see which source answered.
export function rpcFetch(label: string, backupUrl?: string, now: () => number = Date.now, opts: RpcFetchOptions = {}): typeof fetch {
  let skipMainUntil = 0;
  const retryDelayMs = opts.retryDelayMs ?? RPC_RETRY_DELAY_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const mainLimit = limiter(opts.maxInFlight ?? RPC_MAX_IN_FLIGHT);
  const backupLimit = limiter(opts.maxInFlight ?? RPC_MAX_IN_FLIGHT);
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
  const main = (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]) => mainLimit(() => send(label, input, init));
  const backup = (init: Parameters<typeof fetch>[1]) => backupLimit(() => send(`${label} (backup)`, backupUrl!, init));
  return async (input, init) => {
    if (!backupUrl) return main(input, init);
    if (now() < skipMainUntil) return backup(init);
    let res = await main(input, init);
    if (res.status !== 429) return res;
    if (isQuotaOut(await res.clone().text().catch(() => ""))) {
      skipMainUntil = now() + RPC_COOLDOWN_MS;
      return backup(init);
    }
    await sleep(retryDelayMs);
    res = await main(input, init);
    return res.status === 429 ? backup(init) : res;
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
