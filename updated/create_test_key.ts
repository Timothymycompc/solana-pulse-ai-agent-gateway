import "dotenv/config";
import { pool } from "./db";
import { randomBytes, createHash } from "crypto";

async function run() {
  const wallet = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";
  const plaintextKey = randomBytes(32).toString('hex');
  const keyHash = createHash('sha256').update(plaintextKey).digest('hex');

  await pool.query(
    `INSERT INTO api_keys (key_hash, wallet_address, credit_balance_lamports, is_active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (wallet_address) 
     DO UPDATE SET key_hash = EXCLUDED.key_hash, credit_balance_lamports = EXCLUDED.credit_balance_lamports, is_active = TRUE`,
    [keyHash, wallet, 100000000]
  );

  console.log(`Test Key created for ${wallet}`);
  console.log(`Plaintext: ${plaintextKey}`);
  console.log(`Hash: ${keyHash}`);
  process.exit(0);
}
run().catch(console.error);
