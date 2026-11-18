// Solana arbitrage, measured: the summary the arb-study Cloud Run job (sol-arb-study/job.py) writes every 4 hours from
// random real mainnet blocks. This only reads it from the bucket and passes it on; nothing here is computed or guessed.
import type { Request, Response } from "express";

const BUCKET = "x300-506418-pulse-cases";
const NAME = "arb-study/summary.json";
let cache: { at: number; body: unknown } | null = null;

async function readSummary(): Promise<unknown> {
  const tokenRes = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  if (!tokenRes.ok) throw new Error(`no Google token (${tokenRes.status})`);
  const token = ((await tokenRes.json()) as any).access_token;
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(NAME)}?alt=media`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`summary not readable (${res.status})`);
  return res.json();
}

export async function arbitrageSummary(_req: Request, res: Response) {
  try {
    if (!cache || Date.now() - cache.at > 10 * 60_000) cache = { at: Date.now(), body: await readSummary() };
    res.set("cache-control", "public, max-age=300").json(cache.body);
  } catch (e: any) {
    // Unknown, never a guess: the page says the numbers couldn't be loaded.
    res.status(503).json({ error: `The arbitrage numbers couldn't be loaded right now (${e?.message ?? e}).` });
  }
}
