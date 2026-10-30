// Private reports for trial-key holders. A key opens only the report filed under the name its key was issued to;
// any other key, an expired key or no key sees nothing, and the answer never says which names have reports.
import { PublicKey, type Connection } from "@solana/web3.js";
import { TRIAL_KEYS, trialKeyFor } from "../meter";
import { REPORTS } from "./list";
import type { Report, Watched } from "./types";

export { REPORTS, publishedReports } from "./list";

export type ReportLookup =
  | { status: 200; name: string; until: string; report: Report }
  | { status: 401; error: string }
  | { status: 404; error: string };

// The owner (Tim) can preview any report by name with the owner key, to check it before a key is handed out.
export function reportFor(apiKey: string | undefined, now = Date.now(), keys = TRIAL_KEYS, reports = REPORTS, ownerAs?: string | null): ReportLookup {
  if (ownerAs) {
    const report = reports[ownerAs];
    return report ? { status: 200, name: ownerAs, until: "owner preview", report } : { status: 404, error: `No report named ${ownerAs}.` };
  }
  const trial = trialKeyFor(apiKey, now, keys);
  if (!trial) return { status: 401, error: "That key isn't a live Pulse key. Check it, or ask Timothy for a new one." };
  const report = reports[trial.name];
  if (!report) return { status: 404, error: "Your key works for every tool, but there's no report filed under it yet." };
  return { status: 200, name: trial.name, until: trial.until, report };
}

// The newest transactions of each watched address, counted by version. Read fresh from the chain on each open
// (cached a few minutes so a reload doesn't re-read everything). A read that fails counts as unknown, never as a version.
export type LiveCount = { label: string; address: string; newest: number; legacy: number; v0: number; v1: number; unknown: number; latest: string | null; checkedAt: string };
const NEWEST = 40;
const cache = new Map<string, { at: number; value: LiveCount }>();
const CACHE_MS = 5 * 60_000;

// One transaction's version, retrying a rate-limited read a few times before calling it unknown.
async function versionOf(conn: Connection, signature: string, pauseMs: number): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r: any = await (conn as any)._rpcRequest("getTransaction", [signature, { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
      if (r?.result) return r.result.version;
      if (r?.error?.code !== 429) return undefined;
    } catch (error) {
      if (!/429|Too Many Requests/i.test(String(error))) return undefined;
    }
    if (pauseMs) await new Promise((done) => setTimeout(done, pauseMs * (attempt + 1)));
  }
  return undefined;
}

export async function liveCount(conn: Connection, w: Watched, now = Date.now(), pauseMs = 400): Promise<LiveCount> {
  const hit = cache.get(w.address);
  if (hit && now - hit.at < CACHE_MS) return hit.value;
  const sigs = await conn.getSignaturesForAddress(new PublicKey(w.address), { limit: NEWEST }, "confirmed");
  const out: LiveCount = { label: w.label, address: w.address, newest: sigs.length, legacy: 0, v0: 0, v1: 0, unknown: 0, latest: sigs[0]?.blockTime ? new Date(sigs[0].blockTime * 1000).toISOString() : null, checkedAt: new Date(now).toISOString() };
  for (let i = 0; i < sigs.length; i += 2) {
    for (const v of await Promise.all(sigs.slice(i, i + 2).map((s) => versionOf(conn, s.signature, pauseMs)))) {
      if (v === "legacy") out.legacy++;
      else if (v === 0) out.v0++;
      else if (v === 1) out.v1++;
      else out.unknown++;
    }
  }
  cache.set(w.address, { at: now, value: out });
  return out;
}
