import { Pool } from "pg";

const isCloudSqlSocket = (process.env.DATABASE_URL || "").includes("/cloudsql/");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudSqlSocket ? undefined : { rejectUnauthorized: false }
});

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_history (
      id BIGSERIAL PRIMARY KEY,
      wallet_address TEXT,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      price_credits INTEGER NOT NULL DEFAULT 0,
      via TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS call_history_wallet_idx ON call_history (wallet_address, created_at DESC);`);
  await pool.query(`ALTER TABLE call_history ADD COLUMN IF NOT EXISTS status INTEGER;`).catch((e: any) => console.error('call_history status column:', e.message));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trial_tool_usage (
      ip_hash TEXT NOT NULL,
      tool TEXT NOT NULL,
      calls_used INTEGER NOT NULL DEFAULT 0 CHECK (calls_used >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_call_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (ip_hash, tool)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_usage (
      id BIGSERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status INTEGER NOT NULL,
      wallet_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE service_usage ADD COLUMN IF NOT EXISTS caller_hash TEXT, ADD COLUMN IF NOT EXISTS client TEXT;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS service_usage_created_idx ON service_usage (created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS service_usage_endpoint_idx ON service_usage (endpoint, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS service_usage_wallet_idx ON service_usage (wallet_address) WHERE wallet_address IS NOT NULL;`);
}

export async function logCall(params: { wallet: string | null; endpoint: string; method: string; priceCredits: number; via: string; status?: number }) {
  try {
    await pool.query(
      `INSERT INTO call_history (wallet_address, endpoint, method, price_credits, via, status) VALUES ($1, $2, $3, $4, $5, $6)`,
      [params.wallet, params.endpoint, params.method, params.priceCredits, params.via, params.status ?? null]
    );
  } catch (e) {
    console.error("call_history insert failed:", e);
  }
}

export async function recordServiceUsage(params: { wallet: string | null; endpoint: string; method: string; status: number; callerHash: string | null; client: string | null }) {
  try {
    await pool.query(
      `INSERT INTO service_usage (wallet_address, endpoint, method, status, caller_hash, client) VALUES ($1, $2, $3, $4, $5, $6)`,
      [params.wallet, params.endpoint, params.method, params.status, params.callerHash, params.client]
    );
  } catch (e) {
    console.error('service_usage insert failed:', e);
  }
}
