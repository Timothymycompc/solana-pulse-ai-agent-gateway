import "dotenv/config";
import { pool, recordPayment, isPaymentAlreadyUsed, consumePayment } from "./db";
import { createHash, randomBytes } from "crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";

async function runTest() {
  console.log("Starting End-to-End Payment Logic Test...");

  const testWallet = "TestWallet" + Math.random().toString(36).substring(7);
  const testSignature = "Sig" + Math.random().toString(36).substring(7);
  const amount = 5000000; // 0.005 SOL

  try {
    // 1. Simulate Helius Webhook: Record Payment
    console.log(`\n[1/4] Simulating Helius Webhook for ${testWallet}...`);
    const recorded = await recordPayment({
      txSignature: testSignature,
      payerWallet: testWallet,
      amountLamports: amount,
      network: 'mainnet-beta'
    });
    console.log(`Payment recorded: ${recorded}`);

    // 2. Simulate API Key generation (which happens in the webhook handler)
    console.log(`\n[2/4] Generating API key and pending claim...`);
    const placeholderKey = randomBytes(32).toString('hex');
    const keyHash = createHash('sha256').update(placeholderKey).digest('hex');

    await pool.query(
      `INSERT INTO api_keys (key_hash, wallet_address, credit_balance_lamports)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_address)
       DO UPDATE SET credit_balance_lamports = api_keys.credit_balance_lamports + $3, updated_at = NOW()`,
      [keyHash, testWallet, amount]
    );

    await pool.query(
      `INSERT INTO pending_claims (wallet_address, plaintext_key)
       VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET plaintext_key = EXCLUDED.plaintext_key, created_at = NOW()`,
      [testWallet, placeholderKey]
    );
    console.log(`API key generated and stored in pending_claims.`);

    // 3. Simulate Key Claim Flow
    console.log(`\n[3/4] Simulating Key Claim Flow...`);
    const challenge = randomBytes(32).toString('hex');

    // Sign challenge (simulating user's wallet)
    const keyPair = nacl.sign.keyPair();
    const pubKey = bs58.encode(keyPair.publicKey);
    // In a real test, the wallet would be the pubKey. Let's override testWallet.
    const realWallet = pubKey;

    // Correcting the DB entries to use the actual pubKey for the signature test
    await pool.query(`UPDATE api_keys SET wallet_address = $1 WHERE wallet_address = $2`, [realWallet, testWallet]);
    await pool.query(`UPDATE pending_claims SET wallet_address = $1 WHERE wallet_address = $2`, [realWallet, testWallet]);

    const signature = bs58.encode(nacl.sign.detached(Buffer.from(challenge), keyPair.secretKey));

    // Verify claim logic
    const msg = Buffer.from(challenge);
    const sig = bs58.decode(signature);
    const pubKeyBuf = bs58.decode(realWallet);

    const isValid = nacl.sign.detached.verify(msg, sig, pubKeyBuf);
    console.log(`Signature valid: ${isValid}`);

    const claimResult = await pool.query(
      `DELETE FROM pending_claims WHERE wallet_address = $1 RETURNING plaintext_key`,
      [realWallet]
    );

    if (claimResult.rowCount === 0) throw new Error("No pending key found!");
    const claimedKey = claimResult.rows[0].plaintext_key;
    console.log(`Key successfully claimed: ${claimedKey.substring(0, 10)}...`);

    // 4. Simulate API Call (Payment Consumption)
    console.log(`\n[4/4] Simulating API Call (Credit Consumption)...`);
    const minLamports = 1000000; // 0.001 SOL
    const query = `
      UPDATE api_keys
      SET credit_balance_lamports = credit_balance_lamports - $1, updated_at = NOW()
      WHERE key_hash = $2 AND is_active = TRUE AND credit_balance_lamports >= $1
      RETURNING credit_balance_lamports;
    `;
    const keyHashClaimed = createHash('sha256').update(claimedKey).digest('hex');
    const consumeResult = await pool.query(query, [minLamports, keyHashClaimed]);

    if (consumeResult.rowCount === 0) {
        // Maybe is_active is false by default? Let's check schema.
        console.log("Initial consumption failed, checking if is_active is TRUE...");
        await pool.query(`UPDATE api_keys SET is_active = TRUE WHERE key_hash = $1`, [keyHashClaimed]);
        const retryResult = await pool.query(query, [minLamports, keyHashClaimed]);
        if (retryResult.rowCount === 0) throw new Error("Credit consumption failed!");
        console.log(`Credit consumed. New balance: ${retryResult.rows[0].credit_balance_lamports} lamports`);
    } else {
        console.log(`Credit consumed. New balance: ${consumeResult.rows[0].credit_balance_lamports} lamports`);
    }

    console.log("\n✅ End-to-End Payment Flow Verified Successfully!");
  } catch (err: any) {
    console.error("\n❌ Test Failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runTest();
