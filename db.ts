import { Pool } from "pg";

const isCloudSqlSocket = (process.env.DATABASE_URL || "").includes("/cloudsql/");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudSqlSocket ? undefined : { rejectUnauthorized: false },
});

// The gateway keeps three tables. No wallets, keys or balances are stored: payments settle on chain via x402.
export async function ensureSchema() {
  // Free calls per paid tool, counted per caller network (keyed hash, never the raw IP).
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

  // One row per /api and /mcp request: route, status, caller network hash and client name. No query values or bodies.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_usage (
      id BIGSERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      status INTEGER NOT NULL,
      caller_hash TEXT,
      client TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE service_usage ADD COLUMN IF NOT EXISTS caller_hash TEXT, ADD COLUMN IF NOT EXISTS client TEXT;`);
  await pool.query(`DROP INDEX IF EXISTS service_usage_wallet_idx;`);
  await pool.query(`ALTER TABLE service_usage DROP COLUMN IF EXISTS wallet_address;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS service_usage_created_idx ON service_usage (created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS service_usage_endpoint_idx ON service_usage (endpoint, created_at DESC);`);

  // Every settled x402 payment: the revenue ledger. Amounts are USDC base units (6 decimals).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS x402_payments (
      tx_signature TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      payer TEXT,
      amount_base_units BIGINT NOT NULL,
      asset TEXT NOT NULL,
      network TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS x402_payments_created_idx ON x402_payments (created_at DESC);`);

  // Tables from the retired SOL-credit system and the old cookie trial.
  for (const table of ["wallets", "used_wallet_signatures", "processed_payments", "call_history", "anonymous_trial_usage"]) {
    await pool.query(`DROP TABLE IF EXISTS ${table};`);
  }
}

export async function recordServiceUsage(params: { endpoint: string; method: string; status: number; callerHash: string | null; client: string | null }) {
  try {
    await pool.query(
      `INSERT INTO service_usage (endpoint, method, status, caller_hash, client) VALUES ($1, $2, $3, $4, $5)`,
      [params.endpoint, params.method, params.status, params.callerHash, params.client]
    );
  } catch (e) {
    console.error("service_usage insert failed:", e);
  }
}

export async function recordPayment(params: { txSignature: string; tool: string; payer: string | null; amountBaseUnits: string; asset: string; network: string }) {
  try {
    await pool.query(
      `INSERT INTO x402_payments (tx_signature, tool, payer, amount_base_units, asset, network) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tx_signature) DO NOTHING`,
      [params.txSignature, params.tool, params.payer, params.amountBaseUnits, params.asset, params.network]
    );
  } catch (e) {
    console.error("x402_payments insert failed:", e);
  }
}
