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
import { pool, ensureSchema, recordProcessedPayment } from "./db";
import { peekFree, FREE_CALLS_PER_YEAR as FREE_PER_YEAR } from "./meter";
import { loadSecrets } from "./src/secrets";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { meterCall, meterMiddleware } from "./meter";
import { z } from "zod";

async function startServer() {
  // Load secrets from Google Secret Manager first
  await loadSecrets(['DATABASE_URL', 'HELIUS_WEBHOOK_SECRET']);

  await ensureSchema();
  const app = express();
  app.set('trust proxy', 1);
  console.log("startup: trust proxy =", app.get("trust proxy"));
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
  app.use(express.json({
    verify: (req: any, res, buf) => { req.rawBody = buf; }
  }));

  // ---- Free tier (raw RPC data layer) ----
  const FREE_PATHS = new Set([
    "/api/solana/balance",
    "/api/solana/blockhash",
    "/api/solana/token-accounts",
    "/api/solana/transactions",
    "/api/solana/find-ata",
    "/api/claim/deposit-info",
    "/api/payments/status",
  ]);

  const FREE_REQUESTS_PER_MINUTE = 60;
  const freeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: FREE_REQUESTS_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Free tier rate limit reached (" + FREE_REQUESTS_PER_MINUTE + " requests per minute). Slow down or retry shortly." }
  });

  const claimLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests to the claim endpoints (30 per minute). Please wait a moment." }
  });

  const freeTtlCache = new Map<string, { at: number; value: any }>();
  const getWithTtl = async <T,>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ value: T; hit: boolean; ageMs: number }> => {
    const now = Date.now();
    const entry = freeTtlCache.get(key);
    if (entry && now - entry.at < ttlMs) return { value: entry.value as T, hit: true, ageMs: now - entry.at };
    const value = await fn();
    freeTtlCache.set(key, { at: now, value });
    if (freeTtlCache.size > 2000) freeTtlCache.clear();
    return { value, hit: false, ageMs: 0 };
  };

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    skip: (req: any) => FREE_PATHS.has(String(req.originalUrl).split("?")[0]),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  app.use("/api/", apiLimiter);
  app.use("/mcp/", apiLimiter);

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

  const requirePayment = (min: number) => meterMiddleware(min, GATEWAY_WALLET);

  const PRICE_PER_CALL_LAMPORTS = 2200000;

  // ==========================================
  // 1. SOLANA CORE API ENDPOINTS
  // ==========================================

  app.get("/api/auth/challenge", noCache, (req, res) => {
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const message = `Sign in to Solana Pulse\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
    res.json({ message });
  });

  
// Resilient Base58 decoder for server.ts
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP: Record<string, number> = {};
for (let i = 0; i < B58_ALPHABET.length; i++) {
  B58_MAP[B58_ALPHABET.charAt(i)] = i;
}

function safeBs58Decode(str: string): Uint8Array {
  const b = bs58 as any;
  if (typeof b?.decode === 'function') return b.decode(str);
  if (typeof b?.default?.decode === 'function') return b.default.decode(str);
  
  // Pure JS fallback
  if (!str || str.length === 0) return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (!(c in B58_MAP)) throw new Error("Invalid base58 character '" + c + "'");
    let carry = B58_MAP[c];
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) {
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}


app.post("/api/auth/login", noCache, async (req, res) => {
    try {
      const { wallet, signature, message } = req.body;
      if (!wallet || !signature || !message) return res.status(400).json({ error: "wallet, signature, and message are required" });

      const tsMatch = /Timestamp: (\d+)/.exec(message);
      if (!tsMatch) return res.status(400).json({ error: "Malformed message: missing timestamp" });
      const timestamp = Number(tsMatch[1]);
      if (!Number.isFinite(timestamp) || Date.now() - timestamp > 5 * 60 * 1000) {
        return res.status(401).json({ error: "Challenge expired. Request a new one from /api/auth/challenge." });
      }

      const pubKey = new PublicKey(wallet).toBuffer();
      const sig = safeBs58Decode(signature);
      const msg = Buffer.from(message);
      const isValid = nacl.sign.detached.verify(msg, sig, pubKey);
      if (!isValid) return res.status(401).json({ error: "Invalid signature" });

      const replayCheck = await pool.query(
        `INSERT INTO used_wallet_signatures (wallet_address, timestamp_used) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING wallet_address`,
        [wallet, timestamp]
      );
      if ((replayCheck.rowCount ?? 0) === 0) {
        return res.status(401).json({ error: "This signed message has already been used. Request a new challenge." });
      }

      const apiKey = randomBytes(32).toString('hex');
      const keyHash = createHash('sha256').update(apiKey).digest('hex');

      const result = await pool.query(
        `INSERT INTO wallets (address, key_hash, is_active, last_active_at)
         VALUES ($1, $2, TRUE, NOW())
         ON CONFLICT (address) DO UPDATE SET key_hash = $2, is_active = TRUE, last_active_at = NOW()
         RETURNING paid_credits, display_name, email, profile_pic_url, total_calls_made`,
        [wallet, keyHash]
      );
      const row = result.rows[0];

      res.json({
        apiKey,
        wallet,
        paidCredits: row.paid_credits,
        displayName: row.display_name,
        email: row.email,
        profilePicUrl: row.profile_pic_url,
        totalCallsMade: row.total_calls_made,
        message: "Logged in. This key is now active — logging in again issues a new key and invalidates this one."
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/profile", noCache, async (req, res) => {
    try {
      const apiKey = (req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "")) as string | undefined;
      if (!apiKey) return res.status(401).json({ error: "x-api-key header required" });
      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      const result = await pool.query(
        `SELECT address, display_name, email, profile_pic_url, paid_credits, total_calls_made, total_paid_credits_ever, total_sol_received_lamports, created_at, last_active_at FROM wallets WHERE key_hash = $1 AND is_active = TRUE`,
        [keyHash]
      );
      if (result.rowCount === 0) return res.status(401).json({ error: "Invalid or inactive API key" });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/profile", noCache, async (req, res) => {
    try {
      const apiKey = (req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "")) as string | undefined;
      if (!apiKey) return res.status(401).json({ error: "x-api-key header required" });
      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      const { displayName, email, profilePicUrl } = req.body;
      const result = await pool.query(
        `UPDATE wallets SET
           display_name = COALESCE($1, display_name),
           email = COALESCE($2, email),
           profile_pic_url = COALESCE($3, profile_pic_url)
         WHERE key_hash = $4 AND is_active = TRUE
         RETURNING address, display_name, email, profile_pic_url`,
        [displayName ?? null, email ?? null, profilePicUrl ?? null, keyHash]
      );
      if (result.rowCount === 0) return res.status(401).json({ error: "Invalid or inactive API key" });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/calls/history", noCache, async (req, res) => {
    try {
      const apiKey = (req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "")) as string | undefined;
      if (!apiKey) return res.status(401).json({ error: "x-api-key header required" });
      const keyHash = createHash('sha256').update(apiKey).digest('hex');
      const walletLookup = await pool.query(`SELECT address FROM wallets WHERE key_hash = $1 AND is_active = TRUE`, [keyHash]);
      if (walletLookup.rowCount === 0) return res.status(401).json({ error: "Invalid or inactive API key" });
      const wallet = walletLookup.rows[0].address;
      const history = await pool.query(
        `SELECT endpoint, method, price_credits, via, created_at FROM call_history WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT 100`,
        [wallet]
      );
      res.json({ wallet, calls: history.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/solana/balance", freeLimiter, noCache, async (req, res) => {
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

  app.get("/api/solana/blockhash", freeLimiter, noCache, async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const network = (req.query.network as string) || 'mainnet-beta';
      const c = await getWithTtl("bh:" + network, 5000, () => getConnection(network).getLatestBlockhash('finalized'));
      const blockhash = c.value;
      res.json({ network, blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight, timestamp: Date.now(), cached: c.hit, cache_age_ms: c.ageMs, live_status: "SUCCESS" });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/token-accounts", freeLimiter, noCache, async (req, res) => {
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

  app.get("/api/solana/transactions", freeLimiter, noCache, async (req, res) => {
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

  app.post("/api/solana/validate-and-simulate", noCache, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const { transaction, network } = req.body;
      if (!transaction) return res.status(400).json({ error: "Base64 transaction required" });

      const net = network || 'mainnet-beta';
      const connection = getConnection(net);
      const issues: { severity: 'ERROR' | 'WARNING'; code: string; message: string; fix: string }[] = [];

      let tx: VersionedTransaction;
      try {
        const txBuffer = Buffer.from(transaction, 'base64');
        tx = VersionedTransaction.deserialize(txBuffer);
      } catch (decodeErr: any) {
        return res.json({
          network: net,
          verdict: "UNSAFE",
          safe: false,
          issues: [{
            severity: "ERROR",
            code: "MALFORMED_TRANSACTION",
            message: `Could not decode the transaction: ${decodeErr.message}`,
            fix: "Confirm the transaction is a base64-encoded serialized VersionedTransaction, not a legacy Transaction or raw instruction set."
          }],
          simulation: null,
          live_status: "SUCCESS"
        });
      }

      // Heuristic check: fee payer covers the base signature fee only.
      // This does NOT account for lamports the transaction's own instructions move.
      try {
        const feePayer = tx.message.staticAccountKeys[0];
        const numSignatures = tx.message.header.numRequiredSignatures || 1;
        const baseFeeLamports = 5000 * numSignatures;
        const feePayerBalance = await connection.getBalance(feePayer);
        if (feePayerBalance < baseFeeLamports) {
          issues.push({
            severity: "ERROR",
            code: "INSUFFICIENT_FEE_PAYER_BALANCE",
            message: `Fee payer ${feePayer.toBase58()} has ${feePayerBalance} lamports, below the estimated base fee of ${baseFeeLamports} lamports for ${numSignatures} signature(s).`,
            fix: "Fund the fee payer wallet with more SOL before sending this transaction."
          });
        }
      } catch (feeCheckErr: any) {
        issues.push({
          severity: "WARNING",
          code: "FEE_PAYER_CHECK_FAILED",
          message: `Could not verify fee payer balance: ${feeCheckErr.message}`,
          fix: "Proceed with caution — fee payer solvency was not confirmed."
        });
      }

      const simResult = await connection.simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
      });

      if (simResult.value.err) {
        const errStr = JSON.stringify(simResult.value.err);
        const logs = simResult.value.logs || [];

        let code = "SIMULATION_FAILED";
        let message = `Simulation returned an error: ${errStr}`;
        let fix = "Review the logs below for the failing instruction and program.";

        if (errStr.includes("InsufficientFundsForRent") || logs.some(l => l.includes("insufficient funds for rent"))) {
          code = "INSUFFICIENT_RENT";
          message = "An account in this transaction doesn't have enough SOL to remain rent-exempt.";
          fix = "Fund the account with more SOL, or create it via the appropriate 'create account' instruction with enough lamports for rent exemption.";
        } else if (logs.some(l => l.includes("insufficient lamports") || l.includes("Attempt to debit an account but found no record of a prior credit"))) {
          code = "INSUFFICIENT_BALANCE";
          message = "One of the accounts doesn't have enough SOL or tokens for the transfer being attempted.";
          fix = "Confirm the source account's real balance with /api/solana/balance or /api/solana/token-accounts before retrying.";
        } else if (errStr.includes("AccountNotFound") || logs.some(l => l.includes("could not find account"))) {
          code = "ACCOUNT_NOT_FOUND";
          message = "This transaction references an account that doesn't exist on-chain yet.";
          fix = "If this is a token account, check /api/solana/find-ata first — it may need to be created before this transaction can run.";
        } else if (errStr.includes("custom program error")) {
          code = "PROGRAM_ERROR";
          message = `The target program rejected this instruction: ${errStr}`;
          fix = "This is a program-specific error code. Check the target program's documentation for what this code means, or inspect the logs below.";
        }

        issues.push({ severity: "ERROR", code, message, fix });
      }

      const hasErrors = issues.some(i => i.severity === "ERROR");

      res.json({
        network: net,
        verdict: hasErrors ? "UNSAFE" : "SAFE",
        safe: !hasErrors,
        issues,
        simulation: {
          success: simResult.value.err === null,
          error: simResult.value.err,
          logs: simResult.value.logs,
          unitsConsumed: simResult.value.unitsConsumed
        },
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/find-ata", freeLimiter, noCache, async (req, res) => {
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
      const accountInfo = await getConnection(network as string).getAccountInfo(ata);

      res.json({
        owner: owner.toBase58(),
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
      const connection = getConnection(network as string);

      // 1. Fetch Mint Account Info
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      if (!mintInfo.value) return res.status(404).json({ error: "Mint not found" });

      const mintData = mintInfo.value.data;
      if (!('parsed' in mintData)) return res.status(500).json({ error: "Mint account data was not in parsed format" });
      const parsedMint = mintData.parsed.info;
      const decimals = Number(parsedMint.decimals);

      // 2. Fetch Top Holders
      const largestAccounts = await connection.getTokenLargestAccounts(mintPubkey);
      const holders = largestAccounts.value.map(acc => {
        const rawAmount = acc.amount;
        return {
          address: acc.address.toBase58(),
          amount_raw: rawAmount,
          amount_formatted: (Number(rawAmount) / Math.pow(10, decimals)).toFixed(4)
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
      const connection = getConnection(network as string);

      const canaryAccounts = [
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      ];

      const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: canaryAccounts });

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

      const connection = getConnection(network as string);
      const tx = await connection.getTransaction(signature as string, {
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

      const accountKeys = tx.transaction.message.staticAccountKeys.map(k => k.toBase58());
      const preBalances = tx.meta?.preBalances || [];
      const postBalances = tx.meta?.postBalances || [];
      const balanceChanges = accountKeys.map((address, i) => {
        const before = preBalances[i] ?? 0;
        const after = postBalances[i] ?? 0;
        const deltaLamports = after - before;
        return { address, deltaLamports, deltaSol: deltaLamports / 1e9 };
      }).filter(c => c.deltaLamports !== 0);

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
        balance_changes: balanceChanges,
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

  // ==========================================
  // CLAIM PAGE SUPPORT (unmetered)
  // ==========================================

  // Placeholder deposit sizes, in calls. Each is an exact multiple of the price, so nothing is lost to rounding.
  const DEPOSIT_OPTION_CALLS = [5, 25, 100, 500];

  app.get("/api/claim/deposit-info", claimLimiter, noCache, (req, res) => {
    res.json({
      network: "mainnet-beta",
      payout_address: GATEWAY_WALLET,
      price_per_call_lamports: PRICE_PER_CALL_LAMPORTS,
      price_per_call_sol: PRICE_PER_CALL_LAMPORTS / 1e9,
      min_deposit_lamports: PRICE_PER_CALL_LAMPORTS,
      deposit_options: DEPOSIT_OPTION_CALLS.map((calls) => ({
        calls,
        lamports: calls * PRICE_PER_CALL_LAMPORTS,
        sol: (calls * PRICE_PER_CALL_LAMPORTS) / 1e9,
      })),
      free_calls_per_year: Number(process.env.FREE_CALLS_PER_YEAR) || 110,
      note: "Credits are floor(deposit / price_per_call_lamports); any remainder is not credited. Send exact multiples of the price. Send from the wallet you will sign in with."
    });
  });

  const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  app.get("/api/payments/status", claimLimiter, noCache, async (req, res) => {
    try {
      const wallet = String(req.query.wallet || "");
      if (!SOLANA_ADDRESS_RE.test(wallet)) return res.status(400).json({ error: "Valid wallet address required" });
      const result = await pool.query(
        `SELECT total_paid_credits_ever, total_sol_received_lamports, first_paid_at, (key_hash IS NOT NULL) AS has_key FROM wallets WHERE address = $1`,
        [wallet]
      );
      if (result.rowCount === 0) {
        return res.json({ wallet, deposit_detected: false, total_credits_ever: 0, total_sol_received_lamports: 0, has_key: false, first_paid_at: null });
      }
      const row = result.rows[0];
      res.json({
        wallet,
        deposit_detected: Number(row.total_paid_credits_ever) > 0,
        total_credits_ever: Number(row.total_paid_credits_ever),
        total_sol_received_lamports: Number(row.total_sol_received_lamports),
        has_key: !!row.has_key,
        first_paid_at: row.first_paid_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  
  // Free credits lookup (read-only, consumes nothing, never returns a key)
  app.get("/api/credits", freeLimiter, noCache, async (req, res) => {
    try {
      const address = String(req.query.address || "").trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        return res.status(400).json({ error: "Valid Solana wallet address required (?address=...)" });
      }
      const w = await pool.query(
        "SELECT paid_credits, total_calls_made, total_paid_credits_ever FROM wallets WHERE address = $1",
        [address]
      );
      const row = w.rows[0];
      const freeLeft = await peekFree(req.ip || "");
      return res.json({
        address,
        paidCredits: Number(row?.paid_credits || 0),
        totalCallsMade: Number(row?.total_calls_made || 0),
        totalPaidCreditsEver: Number(row?.total_paid_credits_ever || 0),
        freeCallsRemaining: freeLeft,
        freeCallsPerYear: FREE_PER_YEAR,
        lamportsPerCall: 2200000,
        hasWallet: Boolean(row)
      });
    } catch (err: any) {
      console.error("Error in /api/credits:", err);
      return res.status(500).json({ error: "Failed to look up credits" });
    }
  });

  // Wallet Claim Status Lookup Route
  app.get("/api/wallets/claim-status", async (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ error: "Wallet address parameter is required" });
      }

      const wallet = await pool.query(
        "SELECT address, paid_credits, total_paid_credits_ever, total_sol_received_lamports, key_hash FROM wallets WHERE address = $1",
        [address]
      );

      if (!wallet.rows.length) {
        return res.status(404).json({ error: "No deposit record found for this wallet address." });
      }

      const record = wallet.rows[0];
      return res.json({
        address: record.address,
        paidCredits: Number(record.paid_credits || 0),
        totalPaidCreditsEver: Number(record.total_paid_credits_ever || 0),
        totalSolReceivedLamports: Number(record.total_sol_received_lamports || 0),
        hasKey: Boolean(record.key_hash)
      });
    } catch (err: any) {
      console.error("Error fetching claim status:", err);
      return res.status(500).json({ error: "Failed to query wallet claim status" });
    }
  });


app.post("/api/payments/helius-webhook", async (req, res) => {
    try {
      const authHeader = req.headers["authorization"] as string | undefined;
      const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET;
      if (!expectedSecret) return res.status(500).json({ error: "Webhook secret not configured" });
      if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

      const authBuffer = Buffer.from(authHeader);
      const expectedBuffer = Buffer.from(expectedSecret);
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

        const creditsToAdd = Math.floor(amountLamports / PRICE_PER_CALL_LAMPORTS);
        const inserted = await recordProcessedPayment({
          txSignature,
          payerWallet,
          amountLamports,
          creditsAdded: creditsToAdd
        });

        if (inserted && creditsToAdd > 0) {
          await pool.query(
            `INSERT INTO wallets (address, paid_credits, total_paid_credits_ever, total_sol_received_lamports, first_paid_at, last_active_at)
             VALUES ($1, $2, $2, $3, NOW(), NOW())
             ON CONFLICT (address) DO UPDATE SET
               paid_credits = wallets.paid_credits + $2,
               total_paid_credits_ever = wallets.total_paid_credits_ever + $2,
               total_sol_received_lamports = wallets.total_sol_received_lamports + $3,
               first_paid_at = COALESCE(wallets.first_paid_at, NOW()),
               last_active_at = NOW()`,
            [payerWallet, creditsToAdd, amountLamports]
          );
        }

        results.push({ txSignature, status: inserted ? "recorded" : "duplicate_ignored", creditsAdded: inserted ? creditsToAdd : 0 });
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

  const FREE_TOOLS = new Set(["get_solana_balance", "get_solana_blockhash", "get_token_accounts", "get_recent_transactions"]);

  const createMcpServer = (ctx: { apiKey?: string; ip: string } = { ip: "unknown" }) => {
  const mcpServer = new McpServer({ name: "solana-pulse-gateway", version: "1.0.0" });
  const rawTool = (mcpServer as any).tool.bind(mcpServer);
  (mcpServer as any).tool = (name: string, ...rest: any[]) => {
    const handler = rest.pop();
    return rawTool(name, ...rest, async (...args: any[]) => {
      if (FREE_TOOLS.has(name)) return handler(...args);
      const m: any = await meterCall({ apiKey: ctx.apiKey, ip: ctx.ip, priceLamports: 2200000 });
      if (!m.ok) {
        return { content: [{ type: "text", text: JSON.stringify({ error: m.error || "Payment required", priceLamports: m.priceLamports || 2200000, payTo: GATEWAY_WALLET, note: "Free tier used up. Send x-api-key with credits." }) }], isError: true };
      }
      return handler(...args);
    });
  };

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

    return mcpServer;
  };

  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", async (req, res) => {
    const sessionId = randomUUID();
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);
    transports.set(sessionId, transport);
    await createMcpServer({ apiKey: (req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "")) as string | undefined, ip: req.ip || "unknown" }).connect(transport);
    res.on("close", () => transports.delete(sessionId));
  });

  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
    const transport = transports.get(sessionId);
    if (transport) await transport.handlePostMessage(req, res);
    else res.status(404).json({ error: "MCP SSE Session not found" });
  });

  app.post("/mcp", express.json(), async (req, res) => {
    const server = createMcpServer({ apiKey: (req.headers["x-api-key"] || req.headers["authorization"]?.toString().replace("Bearer ", "")) as string | undefined, ip: req.ip || "unknown" });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  app.get("/mcp", (req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null }));
  app.delete("/mcp", (req, res) => res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Use POST" }, id: null }));

  app.get("/api/debug/ip", noCache, (req, res) => res.json({ ip: req.ip, xff: req.headers["x-forwarded-for"] || null, trustProxy: app.get("trust proxy") }));
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
- Free Tier: 50 lifetime calls per wallet, 15/day cap

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
