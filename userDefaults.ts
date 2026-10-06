import { createHash } from "crypto";
import { pool } from "./db";

let columnReady: Promise<boolean> | null = null;
export function ensureDefaultsColumn(): Promise<boolean> {
  if (!columnReady) {
    columnReady = pool
      .query("ALTER TABLE wallets ADD COLUMN IF NOT EXISTS defaults JSONB NOT NULL DEFAULT '{}'::jsonb")
      .then(() => true)
      .catch((e: any) => {
        console.error("wallets.defaults column unavailable:", e.message);
        return false;
      });
  }
  return columnReady;
}

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

export type UserCtx = { address: string; defaults: Record<string, string> };

export async function lookupUser(apiKey: string): Promise<UserCtx | null> {
  const ok = await ensureDefaultsColumn();
  const r = await pool.query(
    ok
      ? "SELECT address, defaults FROM wallets WHERE key_hash = $1 AND is_active = TRUE"
      : "SELECT address FROM wallets WHERE key_hash = $1 AND is_active = TRUE",
    [hashKey(apiKey)]
  );
  if (!r.rowCount) return null;
  return { address: r.rows[0].address, defaults: (r.rows[0].defaults as any) || {} };
}

export async function saveDefaults(address: string, defaults: Record<string, string>): Promise<boolean> {
  const ok = await ensureDefaultsColumn();
  if (!ok) return false;
  await pool.query("UPDATE wallets SET defaults = $2::jsonb WHERE address = $1", [address, JSON.stringify(defaults)]);
  return true;
}

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const TOKEN = /^[A-Za-z0-9$._-]{1,44}$/;

export function cleanDefaults(input: any): { value: Record<string, string>; errors: string[] } {
  const value: Record<string, string> = {};
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { value, errors: ['Send a JSON object like {"wallet":"...","token":"BONK"}'] };
  }
  for (const [k, raw] of Object.entries(input)) {
    if (!["wallet", "token", "signature", "network"].includes(k)) { errors.push(`Unknown field "${k}"`); continue; }
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) continue;
    if (k === "wallet" && !ADDR.test(v)) errors.push("wallet is not a valid Solana address");
    else if (k === "token" && !TOKEN.test(v)) errors.push("token must be a mint address or a ticker");
    else if (k === "signature" && !SIG.test(v)) errors.push("signature is not a valid transaction signature");
    else if (k === "network" && !["mainnet-beta", "devnet"].includes(v)) errors.push("network must be mainnet-beta or devnet");
    else value[k] = v;
  }
  return { value, errors };
}
