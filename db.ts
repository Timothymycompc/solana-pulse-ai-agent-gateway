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
  // NOTE: api_keys / pending_claims / payments tables no longer exist in production
  // (superseded by the wallets / used_wallet_signatures schema). This function is now
  // a no-op placeholder until the metering/payment code is migrated to that schema.
  return;
}
