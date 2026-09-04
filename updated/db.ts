import { Pool } from "pg";

const isCloudSqlSocket = (process.env.DATABASE_URL || "").includes("/cloudsql/");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudSqlSocket ? undefined : { rejectUnauthorized: false }
});

export async function isPaymentAlreadyUsed(txSignature: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM payments WHERE tx_signature = $1",
    [txSignature]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function recordPayment(params: {
  txSignature: string;
  payerWallet: string;
  amountLamports: number;
  endpointUsed?: string;
  network?: string;
}): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO payments (tx_signature, payer_wallet, amount_lamports, endpoint_used, network)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.txSignature,
        params.payerWallet,
        params.amountLamports,
        params.endpointUsed || null,
        params.network || 'mainnet-beta'
      ]
    );
    return true;
  } catch (err: any) {
    if (err.code === '23505') return false;
    throw err;
  }
}

export async function consumePayment(txSignature: string, minLamports: number = 0): Promise<boolean> {
  const result = await pool.query(
    `UPDATE payments SET status = 'used' WHERE tx_signature = $1 AND status = 'verified' AND amount_lamports >= $2 RETURNING id`,
    [txSignature, minLamports]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function ensureSchema() {
  await pool.query(`
    ALTER TABLE api_keys ADD CONSTRAINT unique_wallet UNIQUE (wallet_address);
  `).catch(err => {
    if (err.code !== '42P07') throw err; // Ignore if constraint already exists (duplicate_object)
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_claims (
      wallet_address VARCHAR(44) PRIMARY KEY,
      plaintext_key TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}
