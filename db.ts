import { Pool } from "pg";

const isCloudSqlSocket = (process.env.DATABASE_URL || "").includes("/cloudsql/");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudSqlSocket ? undefined : { rejectUnauthorized: false }
});

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallets (
      address TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      first_paid_at TIMESTAMPTZ,
      last_active_at TIMESTAMPTZ,
      paid_credits INTEGER NOT NULL DEFAULT 0,
      free_credits_lifetime_used INTEGER NOT NULL DEFAULT 0,
      free_credits_today_used INTEGER NOT NULL DEFAULT 0,
      free_credits_today_date DATE,
      total_paid_credits_ever INTEGER NOT NULL DEFAULT 0,
      total_sol_received_lamports BIGINT NOT NULL DEFAULT 0,
      total_calls_made INTEGER NOT NULL DEFAULT 0,
      is_test_wallet BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS key_hash TEXT;`);
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS display_name TEXT;`);
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS email TEXT;`);
  await pool.query(`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS wallets_key_hash_unique ON wallets (key_hash) WHERE key_hash IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS used_wallet_signatures (
      wallet_address TEXT NOT NULL,
      timestamp_used BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (wallet_address, timestamp_used)
    );
  `);

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_payments (
      tx_signature TEXT PRIMARY KEY,
      payer_wallet TEXT NOT NULL,
      amount_lamports BIGINT NOT NULL,
      credits_added INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function logCall(params: { wallet: string | null; endpoint: string; method: string; priceCredits: number; via: string }) {
  try {
    await pool.query(
      `INSERT INTO call_history (wallet_address, endpoint, method, price_credits, via) VALUES ($1, $2, $3, $4, $5)`,
      [params.wallet, params.endpoint, params.method, params.priceCredits, params.via]
    );
  } catch (e) {
    console.error("call_history insert failed:", e);
  }
}

export async function recordProcessedPayment(params: {
  txSignature: string;
  payerWallet: string;
  amountLamports: number;
  creditsAdded: number;
}): Promise<boolean> {
  try {
    const r = await pool.query(
      `INSERT INTO processed_payments (tx_signature, payer_wallet, amount_lamports, credits_added)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tx_signature) DO NOTHING
       RETURNING tx_signature`,
      [params.txSignature, params.payerWallet, params.amountLamports, params.creditsAdded]
    );
    return (r.rowCount ?? 0) > 0;
  } catch (e: any) {
    if (e.code === '23505') return false;
    throw e;
  }
}
