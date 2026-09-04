import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { Connection, PublicKey, clusterApiUrl, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import fs from "fs";
import { randomUUID, timingSafeEqual, randomBytes, createHash } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { pool, isPaymentAlreadyUsed, recordPayment, consumePayment, ensureSchema } from "./db";
import { loadSecrets } from "./src/secrets";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

async function startServer() {
  // Load secrets from Google Secret Manager first
  await loadSecrets(['DATABASE_URL', 'HELIUS_WEBHOOK_SECRET']);

  await ensureSchema();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
  app.use(express.json({
    verify: (req: any, res, buf) => { req.rawBody = buf; }
  }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  app.use("/api/", apiLimiter);
  app.use("/mcp/", apiLimiter);

  // Autonomous Referral & Tier Upgrade Middleware
  app.use(async (req: any, res, next) => {
    const referrerTag = req.headers["x-agent-referrer"] || req.query.ref;
    if (referrerTag && typeof referrerTag === "string") {
      try {
        // Increment leads and check for tier upgrade
        const update = await pool.query(
          `UPDATE api_keys 
           SET leads_count = leads_count + 1,
               discount_tier = CASE 
                 WHEN leads_count + 1 >= 8500 THEN 3
                 WHEN leads_count + 1 >= 3500 THEN 2
                 WHEN leads_count + 1 >= 1000 THEN 1
                 ELSE discount_tier
               END
           WHERE wallet_address = $1 OR key_hash = $1
           RETURNING discount_tier, leads_count`,
          [referrerTag]
        );
        if (update.rowCount && update.rowCount > 0) {
          // Log discovery event to internal stats
          console.log(`Lead detected for ${referrerTag}. Tier: ${update.rows[0].discount_tier}`);
        }
      } catch (err) {
        console.error("Referral tracking error:", err);
      }
    }
    next();
  });

  const stats = { totalRequests: 0, solanaRpcCalls: 0 };

  const mainnetRpcUrl = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl('mainnet-beta');
  const devnetRpcUrl = process.env.SOLANA_DEVNET_RPC_URL || clusterApiUrl('devnet');
  const mainnetConnection = new Connection(mainnetRpcUrl, 'confirmed');
  const devnetConnection = new Connection(devnetRpcUrl, 'confirmed');
  const getConnection = (network: string) => network === 'devnet' ? devnetConnection : mainnetConnection;

  const noCache = (req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  };

  const GATEWAY_WALLET = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";

  // Hybrid Payment Middleware (Supports API Key Balance OR Transaction Signature)
  const requirePayment = (minLamports: number) => (req: any, res: any, next: any) => {
    (async () => {
      const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      const txSignature = req.headers["x-payment-signature"] as string | undefined;

      try {
        // Path A: API Key Balance Deduction
        if (apiKey && typeof apiKey === "string") {
          const keyHash = createHash('sha256').update(apiKey).digest('hex');

            // 1. Look up user tier and current balance
            const userLookup = await pool.query(
              "SELECT discount_tier, wallet_address, credit_balance_lamports FROM api_keys WHERE key_hash = $1 AND is_active = TRUE",
              [keyHash]
            );

            if (userLookup.rowCount && userLookup.rowCount > 0) {
              const user = userLookup.rows[0];
              const tier = user.discount_tier || 0;
              let discountMultiplier = 1.0;
              
              if (tier === 1) discountMultiplier = 0.85; // 15% off
              else if (tier === 2) discountMultiplier = 0.70; // 30% off
              else if (tier === 3) discountMultiplier = 0.45; // 55% off

              const effectivePrice = Math.floor(minLamports * discountMultiplier);

              // 2. Check if user has enough for the discounted price
              if (user.credit_balance_lamports < effectivePrice) {
                return res.status(402).json({ 
                  error: "Insufficient balance", 
                  requiredLamports: effectivePrice,
                  currentBalance: user.credit_balance_lamports
                });
              }

              // 3. Deduct the correct amount
              const updateQuery = `
                UPDATE api_keys
                SET credit_balance_lamports = credit_balance_lamports - $1, updated_at = NOW()
                WHERE key_hash = $2
                RETURNING wallet_address, credit_balance_lamports;
              `;
              
              const result = await pool.query(updateQuery, [effectivePrice, keyHash]);
            if (result.rowCount && result.rowCount > 0) {
              req.user = {
                wallet: result.rows[0].wallet_address,
                remainingBalance: result.rows[0].credit_balance_lamports,
              };
              return next();
            }
            }
        }

        // Path B: Transaction Signature Verification (One-off payment)
        if (txSignature && typeof txSignature === "string") {
          const alreadyUsed = await isPaymentAlreadyUsed(txSignature);
          if (!alreadyUsed) {
            // This assumes the tx was recorded as 'verified' by the webhook or a separate check
            const consumed = await consumePayment(txSignature, minLamports);
            if (consumed) {
              return next();
            }
          }
        }
      } catch (err) {
        console.error("Payment verification internal error:", err);
      }

      // If payment method failed
      return res.status(402).json({
        error: "Payment required",
        priceLamports: minLamports,
        instructions: `Pass header 'x-api-key: <key>' with sufficient balance. To top up, send SOL to ${GATEWAY_WALLET} and claim your key.`,
        payTo: GATEWAY_WALLET
      });
    })().catch(next);
  };

  // ==========================================
  // 1. SOLANA CORE API ENDPOINTS
  // ==========================================

  app.get("/api/keys/challenge", noCache, (req, res) => {
    const challenge = randomBytes(32).toString('hex');
    res.json({ challenge });
  });

  app.post("/api/keys/claim", noCache, async (req, res) => {
    try {
      const { wallet, signature, challenge } = req.body;
      if (!wallet || !signature || !challenge) return res.status(400).json({ error: "wallet, signature, and challenge are required" });

      // Verify signature
      const pubKey = new PublicKey(wallet).toBuffer();
      const sig = bs58.decode(signature);
      const msg = Buffer.from(challenge);

      const isValid = nacl.sign.detached.verify(msg, sig, pubKey);
      if (!isValid) return res.status(401).json({ error: "Invalid signature" });

      // Retrieve and delete pending key
      const result = await pool.query(
        `DELETE FROM pending_claims WHERE wallet_address = $1 RETURNING plaintext_key`,
        [wallet]
      );

      if (result.rowCount === 0) return res.status(404).json({ error: "No pending key found for this wallet. Please send SOL to top up." });

      res.json({
        apiKey: result.rows[0].plaintext_key,
        message: "Your secure API key has been claimed. Keep it secret!"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/solana/balance", noCache, async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const wallet = req.query.wallet as string;
      const network = (req.query.network as string) || 'mainnet-beta';
      if (!wallet) return res.status(400).json({ error: "Wallet address required" });
      const balance = await getConnection(network).getBalance(new PublicKey(wallet));
      res.json({ wallet, network, balance_lamports: balance, balance_sol: balance / 1e9, live_status: "SUCCESS" });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/blockhash", noCache, async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const network = (req.query.network as string) || 'mainnet-beta';
      const blockhash = await getConnection(network).getLatestBlockhash('finalized');
      res.json({ network, blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight, timestamp: Date.now(), live_status: "SUCCESS" });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/token-accounts", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const wallet = req.query.wallet as string;
      const network = (req.query.network as string) || 'mainnet-beta';
      if (!wallet) return res.status(400).json({ error: "Wallet address required" });

      const ownerPubkey = new PublicKey(wallet);
      const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

      const tokenAccounts = await getConnection(network).getParsedTokenAccountsByOwner(ownerPubkey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const tokens = tokenAccounts.value.map(accountInfo => {
        const parsedInfo = accountInfo.account.data.parsed.info;
        return {
          accountPubkey: accountInfo.pubkey.toBase58(),
          mint: parsedInfo.mint,
          amount: parsedInfo.tokenAmount.uiAmount,
          decimals: parsedInfo.tokenAmount.decimals,
        };
      });

      res.json({ wallet, network, tokenCount: tokens.length, tokens, live_status: "SUCCESS" });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/transactions", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const wallet = req.query.wallet as string;
      const network = (req.query.network as string) || 'mainnet-beta';
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      if (!wallet) return res.status(400).json({ error: "Wallet address required" });

      const ownerPubkey = new PublicKey(wallet);
      const signatures = await getConnection(network).getSignaturesForAddress(ownerPubkey, { limit });

      res.json({ wallet, network, count: signatures.length, transactions: signatures, live_status: "SUCCESS" });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.post("/api/solana/simulate", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const { transaction, network } = req.body;
      if (!transaction) return res.status(400).json({ error: "Base64 transaction required" });

      const net = network || 'mainnet-beta';
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = VersionedTransaction.deserialize(txBuffer);

      const simResult = await getConnection(net).simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });

      res.json({
        network: net,
        success: simResult.value.err === null,
        error: simResult.value.err,
        logs: simResult.value.logs,
        unitsConsumed: simResult.value.unitsConsumed,
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/find-ata", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const { wallet, mint, network = 'mainnet-beta' } = req.query;
      if (!wallet || !mint) {
        return res.status(400).json({
          error: "Missing parameters",
          hint: "Both 'wallet' and 'mint' are required. Example: /api/solana/find-ata?wallet=Addr...&mint=Mint...",
          live_status: "FAILED"
        });
      }

      const owner = new PublicKey(wallet);
      const mintPubkey = new PublicKey(mint);

      const ata = await getAssociatedTokenAddress(mintPubkey, owner);
      const ataAddress = ata.toBase58();

      // Check if the account actually exists on chain to provide better context to the LLM
      const accountInfo = await getConnection(network).getAccountInfo(ata);

      res.json({
        owner,
        mint: mintPubkey.toBase58(),
        ataAddress,
        exists: !!accountInfo,
        network,
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/token-profile", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const { mint, network = 'mainnet-beta' } = req.query;
      if (!mint) {
        return res.status(400).json({
          error: "Missing parameter",
          hint: "The 'mint' address is required. Example: /api/solana/token-profile?mint=EPj...",
          live_status: "FAILED"
        });
      }

      const mintPubkey = new PublicKey(mint);
      const connection = getConnection(network);

      // 1. Fetch Mint Account Info
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      if (!mintInfo.value) return res.status(404).json({ error: "Mint not found" });

      const parsedMint = mintInfo.value.data.parsed.info;
      const decimals = parsedMint.decimals;

      // 2. Fetch Top Holders
      const largestAccounts = await connection.getTokenLargestAccounts(mintPubkey);
      const holders = largestAccounts.value.map(acc => {
        const rawAmount = acc.amount;
        return {
          address: acc.address.toBase58(),
          amount_raw: rawAmount,
          amount_formatted: (rawAmount / Math.pow(10, decimals)).toFixed(4)
        };
      });

      // 3. Analyze Security Flags
      const freezeAuth = parsedMint.freezeAuthority;
      const mintAuth = parsedMint.mintAuthority;
      const isHoneypotRisk = freezeAuth !== null;

      res.json({
        mint: mintPubkey.toBase58(),
        decimals,
        supply_raw: parsedMint.supply,
        supply_formatted: (parsedMint.supply / Math.pow(10, decimals)).toLocaleString(),
        freezeAuthority: freezeAuth,
        mintAuthority: mintAuth,
        security: {
          isHoneypotRisk,
          freezeAuthorityEnabled: !!freezeAuth,
          mintAuthorityEnabled: !!mintAuth,
          riskLevel: isHoneypotRisk ? 'HIGH' : 'LOW',
          analysis: isHoneypotRisk
            ? "HIGH RISK: Freeze authority is active. The developer can freeze any wallet's tokens."
            : "LOW RISK: No freeze authority detected."
        },
        topHolders: holders.slice(0, 10),
        network,
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/optimal-fee", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const { network = 'mainnet-beta' } = req.query;
      const connection = getConnection(network);

      const canaryAccounts = [
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      ];

      const fees = await connection.getRecentPrioritizationFees([canaryAccounts[0]]);

      if (!fees || fees.length === 0) {
        throw new Error("Could not fetch prioritization fees from cluster");
      }

      const feeValues = fees.map(f => f.prioritizationFee);
      const minFee = Math.min(...feeValues);
      const maxFee = Math.max(...feeValues);
      const avgFee = Math.round(feeValues.reduce((a, b) => a + b, 0) / feeValues.length);

      const tiers = {
        low: avgFee,
        medium: Math.round(avgFee * 1.5),
        high: maxFee > 0 ? maxFee : Math.round(avgFee * 3)
      };

      res.json({
        network,
        current_congestion: avgFee > 1000 ? "HIGH" : avgFee > 100 ? "MODERATE" : "LOW",
        tiers: {
          low: {
            lamports: tiers.low,
            description: "Economical: Good for non-urgent transfers. Might take a few blocks.",
            estimated_time: "15-60 seconds"
          },
          medium: {
            lamports: tiers.medium,
            description: "Balanced: Recommended for most swaps and agentic tasks.",
            estimated_time: "5-15 seconds"
          },
          high: {
            lamports: tiers.high,
            description: "Aggressive: Use for time-sensitive trades or high-competition mints.",
            estimated_time: "1-5 seconds"
          }
        },
        raw_stats: {
          min: minFee,
          max: maxFee,
          average: avgFee,
          sample_size: fees.length
        },
        llm_advice: `Network congestion is currently ${avgFee > 1000 ? 'HIGH' : 'LOW'}. For reliable execution, use at least ${tiers.medium} lamports per compute unit.`,
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/decode-tx", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const { signature, network = 'mainnet-beta' } = req.query;
      if (!signature) return res.status(400).json({ error: "Transaction signature is required" });

      const connection = getConnection(network);
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (!tx) return res.status(404).json({ error: "Transaction not found or not yet confirmed" });

      const logs = tx.meta?.logMessages || [];

      // Basic Log Analysis for Human/LLM Readability
      let summary = "Generic transaction executed.";
      let category = "Transfer";

      if (logs.some(l => l.includes("Jupiter"))) {
        summary = "Swap executed via Jupiter Aggregator.";
        category = "Swap";
      } else if (logs.some(l => l.includes("Pump.fun"))) {
        summary = "Interaction with Pump.fun (Mint or Swap).";
        category = "MemeCoin";
      } else if (logs.some(l => l.includes("Raydium"))) {
        summary = "Swap executed via Raydium.";
        category = "Swap";
      } else if (logs.some(l => l.includes("System Program: Transfer"))) {
        summary = "Native SOL transfer.";
        category = "Transfer";
      }

      res.json({
        signature,
        network,
        summary,
        category,
        details: {
          slot: tx.slot,
          fee: tx.meta?.fee,
          timestamp: tx.blockTime,
          status: tx.meta?.err === null ? "SUCCESS" : "FAILED"
        },
        raw_logs: logs,
        llm_context: `This transaction was a ${category}. ${summary} The transaction ${tx.meta?.err === null ? 'succeeded' : 'failed'}.`,
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  // ==========================================
  // 2. HELIUS WEBHOOK (Auto Top-up & Payments)
  // ==========================================

  app.post("/api/payments/helius-webhook", async (req, res) => {
    try {
      const authHeader = req.headers["authorization"] as string | undefined;
      const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET;
      if (!expectedSecret) return res.status(500).json({ error: "Webhook secret not configured" });
      if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

      const authBuffer = Buffer.from(authHeader);
      const expectedBuffer = Buffer.from(expectedSecret);
      console.log(`DEBUG: authHeader len: ${authBuffer.length}, expectedSecret len: ${expectedBuffer.length}`);
      console.log(`DEBUG: authHeader: ${authHeader}`);
      console.log(`DEBUG: expectedSecret: ${expectedSecret}`);
      const isValid = authBuffer.length === expectedBuffer.length &&
        timingSafeEqual(authBuffer, expectedBuffer);

      if (!isValid) return res.status(401).json({ error: "Invalid authorization" });

      const events = Array.isArray(req.body) ? req.body : [req.body];
      const results = [];

      for (const event of events) {
        const txSignature = event.signature;
        const nativeTransfers = event.nativeTransfers || [];
        const paymentTransfer = nativeTransfers.find(
          (t: any) => t.toUserAccount === GATEWAY_WALLET
        );

        if (!txSignature || !paymentTransfer) {
          results.push({ txSignature, status: "skipped", reason: "No matching transfer to gateway wallet" });
          continue;
        }

        const payerWallet = paymentTransfer.fromUserAccount;
        const amountLamports = paymentTransfer.amount;

        const alreadyUsed = await isPaymentAlreadyUsed(txSignature);
        if (alreadyUsed) {
          results.push({ txSignature, status: "duplicate_ignored" });
          continue;
        }

        const inserted = await recordPayment({
          txSignature,
          payerWallet,
          amountLamports,
          network: "mainnet-beta"
        });

        // Auto-credit or create API key balance for the depositor
        if (inserted) {
          const placeholderKey = randomBytes(32).toString('hex');
          const keyHash = createHash('sha256').update(placeholderKey).digest('hex');

          await pool.query(
            `INSERT INTO api_keys (key_hash, wallet_address, credit_balance_lamports)
             VALUES ($1, $2, $3)
             ON CONFLICT (wallet_address)
             DO UPDATE SET credit_balance_lamports = api_keys.credit_balance_lamports + $3, updated_at = NOW()`,
            [keyHash, payerWallet, amountLamports]
          );

          // Store plaintext key for the user to claim
          await pool.query(
            `INSERT INTO pending_claims (wallet_address, plaintext_key)
             VALUES ($1, $2)
             ON CONFLICT (wallet_address) DO UPDATE SET plaintext_key = EXCLUDED.plaintext_key, created_at = NOW()`,
            [payerWallet, placeholderKey]
          );
        }

        results.push({ txSignature, status: inserted ? "recorded" : "duplicate_race_ignored" });
      }

      res.json({ processed: results.length, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/analytics/live", noCache, (req, res) => res.json(stats));

  // ==========================================
  // 3. MCP SERVER (FOR LLMs / AGENTS)
  // ==========================================

  const mcpServer = new McpServer({ name: "solana-pulse-gateway", version: "1.0.0" });

  mcpServer.tool("get_solana_balance", "Get the SOL balance of any wallet address", {
    wallet: z.string(), network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ wallet, network }) => {
    stats.solanaRpcCalls++;
    try {
      const balance = await getConnection(network).getBalance(new PublicKey(wallet));
      return { content: [{ type: "text", text: JSON.stringify({ wallet, network, balance_sol: balance / 1e9 }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_solana_blockhash", "Get the latest finalized blockhash", {
    network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ network }) => {
    stats.solanaRpcCalls++;
    try {
      const blockhash = await getConnection(network).getLatestBlockhash('finalized');
      return { content: [{ type: "text", text: JSON.stringify({ network, blockhash: blockhash.blockhash, timestamp: new Date().toISOString() }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_token_accounts", "Get all SPL token balances and mints owned by a wallet", {
    wallet: z.string().describe("Solana wallet public key"),
    network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ wallet, network }) => {
    stats.solanaRpcCalls++;
    try {
      const ownerPubkey = new PublicKey(wallet);
      const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const tokenAccounts = await getConnection(network).getParsedTokenAccountsByOwner(ownerPubkey, {
        programId: TOKEN_PROGRAM_ID,
      });
      const tokens = tokenAccounts.value.map(accountInfo => {
        const parsedInfo = accountInfo.account.data.parsed.info;
        return {
          accountPubkey: accountInfo.pubkey.toBase58(),
          mint: parsedInfo.mint,
          amount: parsedInfo.tokenAmount.uiAmount,
          decimals: parsedInfo.tokenAmount.decimals,
        };
      });
      return { content: [{ type: "text", text: JSON.stringify({ wallet, tokenCount: tokens.length, tokens }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_recent_transactions", "Get recent transaction signatures for a wallet address", {
    wallet: z.string().describe("Solana wallet public key"),
    limit: z.number().optional().default(10),
    network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ wallet, limit, network }) => {
    stats.solanaRpcCalls++;
    try {
      const ownerPubkey = new PublicKey(wallet);
      const signatures = await getConnection(network).getSignaturesForAddress(ownerPubkey, { limit });
      return { content: [{ type: "text", text: JSON.stringify({ wallet, count: signatures.length, signatures }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("simulate_solana_transaction", "Simulate a Solana transaction without broadcasting it", {
    transaction: z.string().describe("Base64-encoded serialized transaction"),
    network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ transaction, network }) => {
    stats.solanaRpcCalls++;
    try {
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = VersionedTransaction.deserialize(txBuffer);
      const simResult = await getConnection(network).simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            network,
            success: simResult.value.err === null,
            error: simResult.value.err,
            logs: simResult.value.logs,
            unitsConsumed: simResult.value.unitsConsumed
          }, null, 2)
        }]
      };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });

  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", async (req, res) => {
    const sessionId = randomUUID();
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);
    transports.set(sessionId, transport);
    await mcpServer.connect(transport);
    res.on("close", () => transports.delete(sessionId));
  });

  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
    const transport = transports.get(sessionId);
    if (transport) await transport.handlePostMessage(req, res);
    else res.status(404).json({ error: "MCP SSE Session not found" });
  });

  app.get("/.well-known/mcp.json", noCache, (req, res) => {
    stats.totalRequests++;
    res.json({
      "name": "Solana Pulse AI Agent Gateway",
      "version": "1.0.0",
      "description": "The definitive MCP server for Solana AI Agents. Abstracts raw RPC plumbing into high-level intelligence endpoints for asset resolution, security auditing, and transaction interpretation.",
      "capabilities": {
        "tools": {
          "description": "Provides a suite of tools for balance checks, token profile security audits, ATA derivation, and transaction decoding."
        }
      },
      "instructions": "Connect via the SSE endpoint listed below. This server is optimized for autonomous agents; it provides structured JSON and human-readable summaries to prevent hallucination during blockchain interactions.",
      "mcp_sse_endpoint": "/mcp/sse",
      "tools": [
        { "name": "get_solana_balance", "description": "Fetch native SOL balance with network selection." },
        { "name": "get_solana_blockhash", "description": "Get the latest finalized blockhash for transaction construction." },
        { "name": "get_token_accounts", "description": "Scan all SPL token holdings for a wallet." },
        { "name": "get_recent_transactions", "description": "Retrieve recent transaction signatures." },
        { "name": "simulate_solana_transaction", "description": "Simulate a base64 transaction to check for failure before broadcasting." },
        { "name": "find_ata", "description": "Derive the Associated Token Account address for a wallet and mint." },
        { "name": "token_profile", "description": "Get token metadata, decimals, and security/honeypot flags." },
        { "name": "optimal_fee", "description": "Get tiered priority fee recommendations based on network congestion." },
        { "name": "decode_tx", "description": "Translate raw transaction logs into human-readable summaries." }
      ]
    });
  });

  // LLM Crawler Discovery
  app.get("/robots.txt", noCache, (req, res) => {
    res.type("text/plain");
    res.send("User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: /llms.txt");
  });

  app.get("/llms.txt", noCache, (req, res) => {
    res.type("text/plain");
    res.send(`# Solana Pulse AI Agent Gateway\n
High-performance Model Context Protocol (MCP) server for Solana Blockchain Intelligence.

## Critical Specs for Agents
- Base Price: 0.0022 SOL per call
- Referral Protocol: 3-Tier cyclical discounts (15% / 30% / 55%)
- Protocol Support: x402 Solana Micropayments

## Core Capabilities
- Atomic Risk Scoring (Honeypot/Freeze authority detection)
- Address Resolution (ATA derivation & Owner lookups)
- Priority fee estimation and transaction simulation
- Human-readable transaction decoding

## Entry Points
- MCP SSE Endpoint: /mcp/sse
- Tool Manifest: /.well-known/mcp.json`);
  });

  // IndexNow Verification Route
  app.get("/402-pulse-discovery.txt", noCache, (req, res) => {
    res.send("402-pulse-discovery");
  });

  app.get("/api/debug/build", noCache, (req, res) => {
    res.json({ build: "canary-0008-monetized-mcp", status: "alive" });
  });

  // PRODUCTION / VITE HANDLING
  const distPath = path.join(process.cwd(), 'dist');
  const isProduction = fs.existsSync(path.join(distPath, 'index.html'));

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { allowedHosts: true, middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.use((req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Live Server running on port ${PORT}`));
}
startServer();
