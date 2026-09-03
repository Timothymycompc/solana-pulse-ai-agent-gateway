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
