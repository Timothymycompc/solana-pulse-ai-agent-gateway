import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { Connection, PublicKey, clusterApiUrl, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import fs from "fs";
import { randomUUID, timingSafeEqual, randomBytes, createHash, createHmac } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { pool, ensureSchema, recordProcessedPayment, recordServiceUsage } from "./db";
import { makeAutofill } from "./resolver";
import { lookupUser, saveDefaults, cleanDefaults } from "./userDefaults";
import { keyFromReq } from "./authKey";
import { loadSecrets } from "./src/secrets";
import { registerIntelligenceTools } from "./src/mcp/intelligenceTools";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getTrialStatus, meterTrialOrCredit, refundTrialOrCredit, TRIAL_CALLS_PER_VISITOR, trialMeterMiddleware } from "./meter";
import { FREE_TOOL_NAMES, getTool, buildDescription } from "./toolRegistry";
import { buildMcpManifest, buildLlmsTxt, SERVER_VERSION } from "./discovery";
import { z } from "zod";

async function startServer() {
  // Load secrets from Google Secret Manager first
  await loadSecrets(['DATABASE_URL', 'HELIUS_WEBHOOK_SECRET']);

  await ensureSchema();
  const app = express();
  app.set('trust proxy', 1);
  console.log("startup: trust proxy =", app.get("trust proxy"));
  const PORT = Number(process.env.PORT) || 3000;

  // Cloud Run terminates TLS before requests reach Express; send the policy to HTTPS clients.
  app.use((_req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
  app.use(express.json({
    verify: (req: any, res, buf) => { req.rawBody = buf; }
  }));

  const trialCookieName = "pulse_trial";
  const trialCookieSecret = process.env.TRIAL_COOKIE_SECRET || process.env.HELIUS_WEBHOOK_SECRET || process.env.DATABASE_URL || "local-development-trial-secret";
  const signTrialVisitor = (visitorId: string) => createHmac("sha256", trialCookieSecret).update(visitorId).digest("hex");
  const getTrialVisitorId = (req: any): string | null => {
    const cookies = String(req.headers.cookie || "").split(";");
    const entry = cookies.map((part: string) => part.trim()).find((part: string) => part.startsWith(`${trialCookieName}=`));
    if (!entry) return null;
    let value = "";
    try { value = decodeURIComponent(entry.slice(trialCookieName.length + 1)); } catch { return null; }
    const [visitorId, signature] = value.split(".");
    if (!/^[0-9a-f-]{36}$/i.test(visitorId || "") || !/^[0-9a-f]{64}$/i.test(signature || "")) return null;
    const expected = Buffer.from(signTrialVisitor(visitorId), "hex");
    const supplied = Buffer.from(signature, "hex");
    return expected.length === supplied.length && timingSafeEqual(expected, supplied) ? visitorId : null;
  };
  const ensureTrialVisitor = (req: any, res: any, next: any) => {
    let visitorId = getTrialVisitorId(req);
    if (!visitorId) {
      visitorId = randomUUID();
      const secure = process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https";
      const cookie = `${trialCookieName}=${visitorId}.${signTrialVisitor(visitorId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
      res.append("Set-Cookie", cookie);
    }
    req.trialVisitorId = visitorId;
    next();
  };
  app.use("/api", ensureTrialVisitor);
  app.use("/mcp", ensureTrialVisitor);

  // Record route-level usage without storing query values, request bodies, or IP addresses.
  const trackServiceUsage = (req: any, res: any, next: any) => {
    const pathOnly = String(req.originalUrl || req.url).split("?")[0];
    if (pathOnly === "/api/analytics/usage") return next();
    const apiKey = keyFromReq(req);
    res.once("finish", () => {
      const toolName = req.body?.method === "tools/call" ? req.body?.params?.name : null;
      const endpoint = pathOnly === "/mcp" && typeof toolName === "string"
        ? `/mcp/tools/${toolName.replace(/[^a-zA-Z0-9_-]/g, "")}`
        : pathOnly;
      void (async () => {
        try {
          let wallet = req.user?.wallet || null;
          if (!wallet && apiKey) {
            const keyHash = createHash("sha256").update(apiKey).digest("hex");
            const user = await pool.query(
              "SELECT address FROM wallets WHERE key_hash = $1 AND is_active = TRUE",
              [keyHash]
            );
            wallet = user.rows[0]?.address || null;
          }
          await recordServiceUsage({ wallet, endpoint, method: req.method, status: res.statusCode });
        } catch (error) {
          console.error("service usage tracking failed:", error);
        }
      })();
    });
    next();
  };
  app.use("/api", trackServiceUsage);
  app.use("/mcp", trackServiceUsage);

  // Fail closed on typos so a request for devnet can never silently query mainnet.
  const allowedNetworks = new Set(["mainnet-beta", "devnet"]);
  app.use("/api", (req: any, res: any, next: any) => {
    const network = req.query?.network ?? req.body?.network;
    if (network === undefined || network === null || network === "") return next();
    if (typeof network !== "string" || !allowedNetworks.has(network)) {
      return res.status(400).json({ error: 'Unsupported network. Use "mainnet-beta" or "devnet".' });
    }
    next();
  });

  // Core data routes use their dedicated request limiter below; all data calls are also metered.
  const DEDICATED_RATE_LIMIT_PATHS = new Set([
    "/api/solana/balance",
    "/api/solana/blockhash",
    "/api/solana/token-accounts",
    "/api/solana/transactions",
    "/api/solana/find-ata",
    "/api/claim/deposit-info",
    "/api/payments/status",
  ]);

  const FREE_REQUESTS_PER_MINUTE = 120;
  const readRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: FREE_REQUESTS_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Request rate limit reached (" + FREE_REQUESTS_PER_MINUTE + " requests per minute). Slow down or retry shortly." }
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
    windowMs: 60 * 1000,
    max: 120,
    skip: (req: any) => DEDICATED_RATE_LIMIT_PATHS.has(String(req.originalUrl).split("?")[0]),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  app.use("/api/", apiLimiter);
  app.use("/mcp/", apiLimiter);

  // Reject unknown networks instead of silently falling back to mainnet.
  app.use("/api/", (req: any, res: any, next: any) => {
    const n = req.query?.network ?? (req.body && typeof req.body === "object" ? req.body.network : undefined);
    if (n !== undefined && n !== null && n !== "" && n !== "mainnet-beta" && n !== "devnet") {
      return res.status(400).json({ error: `Invalid network "${String(n).slice(0, 40)}". Use "mainnet-beta" or "devnet".` });
    }
    next();
  });

  const stats = { totalRequests: 0, solanaRpcCalls: 0 };

  const mainnetRpcUrl = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl('mainnet-beta');
  const devnetRpcUrl = process.env.SOLANA_DEVNET_RPC_URL || clusterApiUrl('devnet');
  const mainnetConnection = new Connection(mainnetRpcUrl, 'confirmed');
  const devnetConnection = new Connection(devnetRpcUrl, 'confirmed');
  const getConnection = (network: string) => {
    if (network === 'devnet') return devnetConnection;
    if (network === 'mainnet-beta') return mainnetConnection;
    throw new Error('Unsupported network. Use "mainnet-beta" or "devnet".');
  };

  const noCache = (req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  };

  const GATEWAY_WALLET = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";

  const requirePayment = (min: number) => trialMeterMiddleware(min, GATEWAY_WALLET);

  const PRICE_PER_CALL_LAMPORTS = 2200000;

  // ==========================================
  // 1. SOLANA CORE API ENDPOINTS
  // ==========================================

  const autofill = makeAutofill(getConnection, lookupUser);

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
      const apiKey = keyFromReq(req);
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
      const apiKey = keyFromReq(req);
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
      const apiKey = keyFromReq(req);
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

  app.get("/api/solana/balance", readRateLimiter, noCache, autofill, async (req, res) => {
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

  app.get("/api/solana/blockhash", readRateLimiter, noCache, autofill, async (req, res) => {
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

  app.get("/api/solana/token-accounts", readRateLimiter, noCache, autofill, async (req, res) => {
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

  app.get("/api/solana/transactions", readRateLimiter, noCache, autofill, async (req, res) => {
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

  app.get("/api/solana/find-ata", readRateLimiter, noCache, autofill, async (req, res) => {
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

  const profileCache = new Map<string, { t: number; v: any }>();
  const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
    Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms))]);

  app.get("/api/solana/token-profile", noCache, autofill, requirePayment(2200000), async (req, res) => {
    stats.totalRequests++; stats.solanaRpcCalls++;
    try {
      const { mint, network = 'mainnet-beta' } = req.query;
      if (!mint) {
        return res.status(400).json({
          error: "Missing parameter",
          hint: "Pass a mint address, or a ticker such as ?symbol=BONK",
          live_status: "FAILED"
        });
      }
      let mintPubkey: PublicKey;
      try { mintPubkey = new PublicKey(String(mint)); }
      catch { return res.status(400).json({ error: "That is not a valid mint address", live_status: "FAILED" }); }

      const net = String(network);
      const cacheKey = net + ":" + mintPubkey.toBase58();
      const hit = profileCache.get(cacheKey);
      if (hit && Date.now() - hit.t < 60000) return res.json({ ...hit.v, cached: true });

      const connection = getConnection(net);
      const [mintInfo, largest] = await Promise.all([
        withTimeout(connection.getParsedAccountInfo(mintPubkey), 8000),
        withTimeout(connection.getTokenLargestAccounts(mintPubkey), 5000).catch((e: any) => ({ failed: String(e?.message || e) })),
      ]);

      if (!mintInfo.value) return res.status(404).json({ error: "Mint not found", live_status: "FAILED" });
      const mintData: any = mintInfo.value.data;
      if (!mintData || typeof mintData !== "object" || !mintData.parsed || mintData.parsed.type !== "mint") {
        return res.status(422).json({ error: "This address exists but is not a token mint", live_status: "FAILED" });
      }
      const parsedMint = mintData.parsed.info;
      const decimals = Number(parsedMint.decimals);

      let topHolders: any[] | null = null;
      let topHoldersNote: string | undefined;
      const largestValue = (largest as any).value;
      if (largestValue) {
        topHolders = largestValue.slice(0, 10).map((acc: any) => ({
          address: acc.address.toBase58(),
          amount_raw: acc.amount,
          amount_formatted: (Number(acc.amount) / Math.pow(10, decimals)).toFixed(4)
        }));
      } else {
        topHoldersNote = "Top holders are unavailable right now because the RPC was slow or declined this heavy lookup. Everything else is live.";
      }

      const freezeAuth = parsedMint.freezeAuthority;
      const mintAuth = parsedMint.mintAuthority;
      const isHoneypotRisk = freezeAuth !== null;

      const body = {
        mint: mintPubkey.toBase58(),
        decimals,
        supply_raw: parsedMint.supply,
        supply_formatted: (Number(parsedMint.supply) / Math.pow(10, decimals)).toLocaleString(),
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
        topHolders,
        topHoldersNote,
        network: net,
        live_status: "SUCCESS"
      };
      profileCache.set(cacheKey, { t: Date.now(), v: body });
      res.json(body);
    } catch (err: any) {
      const slow = String(err?.message || "").includes("timed out");
      res.status(slow ? 504 : 500).json({
        error: slow ? "The Solana RPC was too slow to answer. Try again in a moment." : err.message,
        live_status: "FAILED"
      });
    }
  });

  app.get("/api/solana/optimal-fee", noCache, autofill, requirePayment(2200000), async (req, res) => {
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

  app.get("/api/solana/decode-tx", noCache, autofill, requirePayment(2200000), async (req, res) => {
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
      trial_calls_per_visitor: TRIAL_CALLS_PER_VISITOR,
      note: "New visitors can make 27 trial calls without signing in. After the trial, credits are floor(deposit / price_per_call_lamports); any remainder is not credited. Send exact multiples from the wallet you will sign in with."
    });
  });

  const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  app.get("/api/payments/status", claimLimiter, noCache, autofill, async (req, res) => {
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

  
  // Verify a personal API key and the header it was sent in (free, read-only, never echoes the key)
  app.get("/api/keys/verify", readRateLimiter, noCache, async (req, res) => {
    try {
      const xKey = req.headers["x-api-key"] as string | undefined;
      const authHdr = req.headers["authorization"]?.toString();
      const apiKey = xKey || authHdr?.replace(/^Bearer\s+/i, "");
      if (!apiKey) {
        return res.status(401).json({ valid: false, error: "No key received. Send x-api-key: <key> or Authorization: Bearer <key>." });
      }
      const keyHash = createHash("sha256").update(apiKey).digest("hex");
      const r = await pool.query(
        "SELECT address, paid_credits, total_calls_made, is_active FROM wallets WHERE key_hash = $1",
        [keyHash]
      );
      const row = r.rows[0];
      return res.json({
        valid: Boolean(row && row.is_active),
        headerUsed: xKey ? "x-api-key" : "authorization",
        address: row ? row.address : null,
        paidCredits: row ? Number(row.paid_credits || 0) : 0,
        totalCallsMade: row ? Number(row.total_calls_made || 0) : 0
      });
    } catch (err: any) {
      console.error("Error in /api/keys/verify:", err);
      return res.status(500).json({ error: "Failed to verify key" });
    }
  });

  // Per-key live defaults: what blank calls fill in with (signed-in wallets only)

  app.get("/api/keys/defaults", readRateLimiter, noCache, async (req, res) => {
    try {
      const k = keyFromReq(req);
      if (!k) return res.status(401).json({ error: "Send your key as x-api-key or Authorization: Bearer." });
      const user = await lookupUser(k);
      if (!user) return res.status(401).json({ error: "Invalid or inactive API key" });
      return res.json({
        address: user.address,
        defaults: user.defaults,
        builtIn: { wallet: user.address, token: "USDC", signature: "latest Jupiter transaction", network: "mainnet-beta" }
      });
    } catch (err: any) {
      console.error("Error in GET /api/keys/defaults:", err);
      return res.status(500).json({ error: "Failed to load defaults" });
    }
  });

  app.put("/api/keys/defaults", readRateLimiter, noCache, express.json(), async (req, res) => {
    try {
      const k = keyFromReq(req);
      if (!k) return res.status(401).json({ error: "Send your key as x-api-key or Authorization: Bearer." });
      const user = await lookupUser(k);
      if (!user) return res.status(401).json({ error: "Invalid or inactive API key" });
      const { value, errors } = cleanDefaults(req.body);
      if (errors.length) return res.status(400).json({ error: errors.join("; ") });
      const saved = await saveDefaults(user.address, value);
      if (!saved) return res.status(503).json({ error: "Saving defaults is not available right now." });
      return res.json({ address: user.address, defaults: value });
    } catch (err: any) {
      console.error("Error in PUT /api/keys/defaults:", err);
      return res.status(500).json({ error: "Failed to save defaults" });
    }
  });

  // Free credits lookup (read-only, consumes nothing, never returns a key)
  app.get("/api/credits", readRateLimiter, noCache, autofill, async (req, res) => {
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
      const trial = await getTrialStatus((req as any).trialVisitorId, (req as any).ip || "unknown");
      return res.json({
        address,
        paidCredits: Number(row?.paid_credits || 0),
        totalCallsMade: Number(row?.total_calls_made || 0),
        totalPaidCreditsEver: Number(row?.total_paid_credits_ever || 0),
        trialCallsRemaining: trial.remaining,
        trialCallsPerVisitor: TRIAL_CALLS_PER_VISITOR,
        lamportsPerCall: 2200000,
        hasWallet: Boolean(row)
      });
    } catch (err: any) {
      console.error("Error in /api/credits:", err);
      return res.status(500).json({ error: "Failed to look up credits" });
    }
  });

  app.get("/api/trial/status", noCache, async (req: any, res) => {
    try {
      const status = await getTrialStatus(req.trialVisitorId, req.ip || "unknown");
      res.json({ scope: "visitor_cookie", trialCallsPerVisitor: TRIAL_CALLS_PER_VISITOR, callsUsed: status.used, callsRemaining: status.remaining, priceAfterTrialLamports: PRICE_PER_CALL_LAMPORTS });
    } catch (error) {
      console.error("trial status lookup failed:", error);
      res.status(503).json({ error: "Trial status is temporarily unavailable." });
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

  app.get("/api/analytics/usage", readRateLimiter, noCache, async (_req, res) => {
    try {
      const [totals, services] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::bigint AS calls,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::bigint AS calls_24h,
            COUNT(DISTINCT wallet_address) FILTER (WHERE wallet_address IS NOT NULL)::bigint AS identified_wallets,
            COUNT(DISTINCT wallet_address) FILTER (WHERE wallet_address IS NOT NULL AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS identified_wallets_24h,
            COUNT(*) FILTER (WHERE endpoint LIKE '/api/%' AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS http_calls_24h,
            COUNT(*) FILTER (WHERE endpoint LIKE '/mcp%' AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS mcp_calls_24h,
            MAX(created_at) AS last_call_at
          FROM service_usage
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `),
        pool.query(`
          SELECT endpoint, COUNT(*)::bigint AS calls,
            COUNT(DISTINCT wallet_address) FILTER (WHERE wallet_address IS NOT NULL)::bigint AS identified_wallets,
            MAX(created_at) AS last_call_at
          FROM service_usage
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY endpoint
          ORDER BY COUNT(*) DESC, endpoint ASC
          LIMIT 12
        `),
      ]);
      const row = totals.rows[0] || {};
      res.json({
        window: "rolling_24h",
        calls: Number(row.calls_24h || 0),
        identifiedWallets: Number(row.identified_wallets_24h || 0),
        httpCalls: Number(row.http_calls_24h || 0),
        mcpCalls: Number(row.mcp_calls_24h || 0),
        lastCallAt: row.last_call_at || null,
        services: services.rows.map((service: any) => ({
          endpoint: service.endpoint,
          calls: Number(service.calls),
          identifiedWallets: Number(service.identified_wallets),
          lastCallAt: service.last_call_at,
        })),
        note: "Calls include anonymous requests. Wallet counts include only authenticated wallet accounts; anonymous callers are not individually identified.",
      });
    } catch (error: any) {
      console.error("usage analytics query failed:", error);
      res.status(503).json({ error: "Live usage counts are temporarily unavailable." });
    }
  });

  // ==========================================
  // 3. MCP SERVER (FOR LLMs / AGENTS)
  // ==========================================

  const FREE_TOOLS = new Set(FREE_TOOL_NAMES);

  const createMcpServer = (ctx: { apiKey?: string; ip: string; visitorId: string } = { ip: "unknown", visitorId: "" }) => {
  const mcpServer = new McpServer({ name: "solana-pulse-gateway", version: SERVER_VERSION });
  const rawTool = (mcpServer as any).tool.bind(mcpServer);
  (mcpServer as any).tool = (name: string, ...rest: any[]) => {
    const handler = rest.pop();
    const reg = getTool(name);
    if (reg && typeof rest[0] === "string") rest[0] = buildDescription(reg);
    else console.warn(`[registry] MCP tool "${name}" is not in toolRegistry.ts`);
    return rawTool(name, ...rest, async (...args: any[]) => {
      if (FREE_TOOLS.has(name)) return handler(...args);
      const m: any = await meterTrialOrCredit({ apiKey: ctx.apiKey, ip: ctx.ip, visitorId: ctx.visitorId, priceLamports: PRICE_PER_CALL_LAMPORTS });
      if (!m.ok) {
        return { content: [{ type: "text", text: JSON.stringify({ error: m.error || "Payment required", priceLamports: m.priceLamports || PRICE_PER_CALL_LAMPORTS, trialCallsPerVisitor: TRIAL_CALLS_PER_VISITOR, trialCallsUsed: m.trialCallsUsed ?? undefined, payTo: GATEWAY_WALLET, note: "The anonymous trial is used. Sign in with a wallet, add credits, and reconnect with x-api-key." }) }], isError: true };
      }
      let result: any;
      try { result = await handler(...args); }
      catch (e) { await refundTrialOrCredit(m, ctx.visitorId); throw e; }
      if (result && result.isError) await refundTrialOrCredit(m, ctx.visitorId);
      const trialCallsRemaining = m.via === "trial" ? m.trialCallsRemaining : 0;
      return { ...result, _meta: { ...(result?._meta || {}), trialCallsRemaining } };
    });
  };

  const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta").describe('Cluster to query: "mainnet-beta" (real funds; the default) or "devnet" (test network). Optional.');
  const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  mcpServer.tool("get_solana_balance", "Get a wallet's current SOL balance. Use it to check a wallet can cover a transfer or fee, or that funds arrived. Returns {wallet, network, balance_sol}. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {\"wallet\":\"<wallet address>\"}", {
    wallet: z.string().describe("Wallet whose SOL balance to read: base58 public key, 32-44 characters (required)."), network: NETWORK
  }, READ_ONLY, async ({ wallet, network }) => {
    stats.solanaRpcCalls++;
    try {
      const balance = await getConnection(network).getBalance(new PublicKey(wallet));
      return { content: [{ type: "text", text: JSON.stringify({ wallet, network, balance_sol: balance / 1e9 }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_solana_blockhash", "Get the latest finalized blockhash. Use it when building a transaction you will sign and send yourself; a transaction is only valid with a recent blockhash. Returns {network, blockhash, timestamp}. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {\"network\":\"mainnet-beta\"}", {
    network: NETWORK
  }, READ_ONLY, async ({ network }) => {
    stats.solanaRpcCalls++;
    try {
      const blockhash = await getConnection(network).getLatestBlockhash('finalized');
      return { content: [{ type: "text", text: JSON.stringify({ network, blockhash: blockhash.blockhash, timestamp: new Date().toISOString() }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_token_accounts", "List every SPL token account a wallet owns: account address, mint, balance, decimals. Use it to see what tokens a wallet holds before swapping or sending. Returns {wallet, tokenCount, tokens}. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {\"wallet\":\"<wallet address>\"}", {
    wallet: z.string().describe("Wallet whose token accounts to list: base58 public key, 32-44 characters (required)."),
    network: NETWORK
  }, READ_ONLY, async ({ wallet, network }) => {
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

  mcpServer.tool("get_recent_transactions", "List a wallet's most recent transaction signatures, newest first, with slot, time and error status. Use it to find a transaction to inspect with decode_tx. Returns {wallet, count, signatures}. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {\"wallet\":\"<wallet address>\",\"limit\":5}", {
    wallet: z.string().describe("Wallet whose transaction history to list: base58 public key, 32-44 characters (required)."),
    limit: z.number().int().min(1).max(1000).optional().default(10).describe("How many signatures to return, newest first: integer 1-1000 (optional, default 10)."),
    network: NETWORK
  }, READ_ONLY, async ({ wallet, limit, network }) => {
    stats.solanaRpcCalls++;
    try {
      const ownerPubkey = new PublicKey(wallet);
      const signatures = await getConnection(network).getSignaturesForAddress(ownerPubkey, { limit });
      return { content: [{ type: "text", text: JSON.stringify({ wallet, count: signatures.length, signatures }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("simulate_solana_transaction", "Dry-run a transaction against live chain state without sending it. Returns success, error, program logs and compute units used. Use it to test a transaction; for a SAFE or UNSAFE verdict with fix hints use validate_transaction. Nothing is broadcast. Cost: 1 credit (0.0022 SOL), x-api-key header required; calls that return an error are refunded. Example: {\"transaction\":\"<base64 transaction>\"}", {
    transaction: z.string().describe("The transaction to test: base64-encoded serialized VersionedTransaction (not a legacy Transaction), signed or unsigned (required)."),
    network: NETWORK
  }, READ_ONLY, async ({ transaction, network }) => {
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

  // ---- Added: remaining gateway endpoints exposed as MCP tools ----

  mcpServer.tool("find_ata", "Derive the Associated Token Account (ATA) address for a wallet and token mint, and say whether it already exists on-chain. Use it before sending SPL tokens, to know the destination account and whether it must be created. Returns {owner, mint, ataAddress, exists, network}. Cost: 1 credit (0.0022 SOL) after the 27-call trial. Example: {\"wallet\":\"<wallet address>\",\"mint\":\"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\"}", {
    wallet: z.string().describe("Owner of the token account: a regular wallet address (base58 public key, 32-44 characters), not a program-derived address (required)."),
    mint: z.string().describe("Token mint address: base58, 32-44 characters (required). Example: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v is USDC."),
    network: NETWORK
  }, READ_ONLY, async ({ wallet, mint, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const owner = new PublicKey(wallet);
      const mintPubkey = new PublicKey(mint);
      const ata = await getAssociatedTokenAddress(mintPubkey, owner);
      const accountInfo = await getConnection(network).getAccountInfo(ata);
      return { content: [{ type: "text", text: JSON.stringify({ owner: owner.toBase58(), mint: mintPubkey.toBase58(), ataAddress: ata.toBase58(), exists: !!accountInfo, network }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("token_profile", "Live safety profile of an SPL token: decimals, supply, freeze and mint authority status, a risk level (HIGH when a freeze authority exists, so holders can be frozen), and the top 10 holders. Use it before buying or recommending an unfamiliar token. Cached 60 seconds. Cost: 1 credit (0.0022 SOL), x-api-key header required; calls that return an error are refunded. Example: {\"mint\":\"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\"}", {
    mint: z.string().describe("Token mint address: base58, 32-44 characters (required). Pass the mint, not a ticker symbol."),
    network: NETWORK
  }, READ_ONLY, async ({ mint, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      let mintPubkey: PublicKey;
      try { mintPubkey = new PublicKey(String(mint)); }
      catch { return { content: [{ type: "text", text: "Error: That is not a valid mint address" }], isError: true }; }

      const cacheKey = network + ":" + mintPubkey.toBase58();
      const hit = profileCache.get(cacheKey);
      if (hit && Date.now() - hit.t < 60000) return { content: [{ type: "text", text: JSON.stringify({ ...hit.v, cached: true }, null, 2) }] };

      const connection = getConnection(network);
      const [mintInfo, largest] = await Promise.all([
        withTimeout(connection.getParsedAccountInfo(mintPubkey), 8000),
        withTimeout(connection.getTokenLargestAccounts(mintPubkey), 5000).catch((e: any) => ({ failed: String(e?.message || e) })),
      ]);

      if (!mintInfo.value) return { content: [{ type: "text", text: "Error: Mint not found" }], isError: true };
      const mintData: any = mintInfo.value.data;
      if (!mintData || typeof mintData !== "object" || !mintData.parsed || mintData.parsed.type !== "mint") {
        return { content: [{ type: "text", text: "Error: This address exists but is not a token mint" }], isError: true };
      }
      const parsedMint = mintData.parsed.info;
      const decimals = Number(parsedMint.decimals);

      let topHolders: any[] | null = null;
      let topHoldersNote: string | undefined;
      const largestValue = (largest as any).value;
      if (largestValue) {
        topHolders = largestValue.slice(0, 10).map((acc: any) => ({
          address: acc.address.toBase58(),
          amount_raw: acc.amount,
          amount_formatted: (Number(acc.amount) / Math.pow(10, decimals)).toFixed(4)
        }));
      } else {
        topHoldersNote = "Top holders are unavailable right now because the RPC was slow or declined this heavy lookup. Everything else is live.";
      }

      const freezeAuth = parsedMint.freezeAuthority;
      const mintAuth = parsedMint.mintAuthority;
      const isHoneypotRisk = freezeAuth !== null;

      const body = {
        mint: mintPubkey.toBase58(),
        decimals,
        supply_raw: parsedMint.supply,
        supply_formatted: (Number(parsedMint.supply) / Math.pow(10, decimals)).toLocaleString(),
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
        topHolders,
        topHoldersNote,
        network
      };
      profileCache.set(cacheKey, { t: Date.now(), v: body });
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
    } catch (err: any) {
      const slow = String(err?.message || "").includes("timed out");
      return { content: [{ type: "text", text: slow ? "Error: The Solana RPC was too slow to answer. Try again in a moment." : `Error: ${err.message}` }], isError: true };
    }
  });

  mcpServer.tool("optimal_fee", "Live priority-fee recommendation for current congestion: low, medium and high tiers in micro-lamports per compute unit with estimated confirmation times, plus min, max and average. Use it just before sending a transaction so it lands without overpaying. Cost: 1 credit (0.0022 SOL), x-api-key header required; calls that return an error are refunded. Example: {\"network\":\"mainnet-beta\"}", {
    network: NETWORK
  }, READ_ONLY, async ({ network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const connection = getConnection(network);
      const canaryAccounts = [new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")];
      const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: canaryAccounts });
      if (!fees || fees.length === 0) throw new Error("Could not fetch prioritization fees from cluster");

      const feeValues = fees.map(f => f.prioritizationFee);
      const minFee = Math.min(...feeValues);
      const maxFee = Math.max(...feeValues);
      const avgFee = Math.round(feeValues.reduce((a, b) => a + b, 0) / feeValues.length);
      const tiers = {
        low: avgFee,
        medium: Math.round(avgFee * 1.5),
        high: maxFee > 0 ? maxFee : Math.round(avgFee * 3)
      };

      return { content: [{ type: "text", text: JSON.stringify({
        network,
        current_congestion: avgFee > 1000 ? "HIGH" : avgFee > 100 ? "MODERATE" : "LOW",
        tiers: {
          low: { lamports: tiers.low, description: "Economical: Good for non-urgent transfers. Might take a few blocks.", estimated_time: "15-60 seconds" },
          medium: { lamports: tiers.medium, description: "Balanced: Recommended for most swaps and agentic tasks.", estimated_time: "5-15 seconds" },
          high: { lamports: tiers.high, description: "Aggressive: Use for time-sensitive trades or high-competition mints.", estimated_time: "1-5 seconds" }
        },
        raw_stats: { min: minFee, max: maxFee, average: avgFee, sample_size: fees.length },
        llm_advice: `Network congestion is currently ${avgFee > 1000 ? 'HIGH' : 'LOW'}. For reliable execution, use at least ${tiers.medium} lamports per compute unit.`
      }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("decode_tx", "Explain a confirmed transaction in plain language: category (swap, SOL transfer, meme-coin trade), success or failure, fee, slot, time, each account's SOL balance change, and raw logs. Use it to check what a transaction actually did. Cost: 1 credit (0.0022 SOL), x-api-key header required; calls that return an error are refunded. Example: {\"signature\":\"<transaction signature>\"}", {
    signature: z.string().describe("Signature of a confirmed transaction: base58 string, about 88 characters; get one from get_recent_transactions (required)."),
    network: NETWORK
  }, READ_ONLY, async ({ signature, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const tx = await getConnection(network).getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
      if (!tx) return { content: [{ type: "text", text: "Error: Transaction not found or not yet confirmed" }], isError: true };

      const logs = tx.meta?.logMessages || [];
      let summary = "Generic transaction executed.";
      let category = "Transfer";
      if (logs.some(l => l.includes("Jupiter"))) { summary = "Swap executed via Jupiter Aggregator."; category = "Swap"; }
      else if (logs.some(l => l.includes("Pump.fun"))) { summary = "Interaction with Pump.fun (Mint or Swap)."; category = "MemeCoin"; }
      else if (logs.some(l => l.includes("Raydium"))) { summary = "Swap executed via Raydium."; category = "Swap"; }
      else if (logs.some(l => l.includes("System Program: Transfer"))) { summary = "Native SOL transfer."; category = "Transfer"; }

      const accountKeys = tx.transaction.message.staticAccountKeys.map(k => k.toBase58());
      const preBalances = tx.meta?.preBalances || [];
      const postBalances = tx.meta?.postBalances || [];
      const balanceChanges = accountKeys.map((address, i) => {
        const deltaLamports = (postBalances[i] ?? 0) - (preBalances[i] ?? 0);
        return { address, deltaLamports, deltaSol: deltaLamports / 1e9 };
      }).filter(c => c.deltaLamports !== 0);

      return { content: [{ type: "text", text: JSON.stringify({
        signature,
        network,
        summary,
        category,
        details: { slot: tx.slot, fee: tx.meta?.fee, timestamp: tx.blockTime, status: tx.meta?.err === null ? "SUCCESS" : "FAILED" },
        balance_changes: balanceChanges,
        raw_logs: logs,
        llm_context: `This transaction was a ${category}. ${summary} The transaction ${tx.meta?.err === null ? 'succeeded' : 'failed'}.`
      }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("validate_transaction", "Pre-send safety check: decodes the transaction, checks the fee payer can pay fees, tests it against live chain state without sending, and returns a SAFE or UNSAFE verdict with issues (each with a code and fix hint), logs and compute units. Use it as the last step before signing an agent-built transaction. Cost: 1 credit (0.0022 SOL), x-api-key header required; calls that return an error are refunded. Example: {\"transaction\":\"<base64 transaction>\"}", {
    transaction: z.string().describe("The transaction to check: base64-encoded serialized VersionedTransaction (not a legacy Transaction), signed or unsigned (required)."),
    network: NETWORK
  }, READ_ONLY, async ({ transaction, network }: any) => {
    stats.solanaRpcCalls++;
    try {
      const connection = getConnection(network);
      const issues: { severity: 'ERROR' | 'WARNING'; code: string; message: string; fix: string }[] = [];

      let tx: VersionedTransaction;
      try {
        tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
      } catch (decodeErr: any) {
        return { content: [{ type: "text", text: JSON.stringify({
          network,
          verdict: "UNSAFE",
          safe: false,
          issues: [{
            severity: "ERROR",
            code: "MALFORMED_TRANSACTION",
            message: `Could not decode the transaction: ${decodeErr.message}`,
            fix: "Confirm the transaction is a base64-encoded serialized VersionedTransaction, not a legacy Transaction or raw instruction set."
          }],
          simulation: null
        }, null, 2) }] };
      }

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

      const simResult = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });

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
          fix = "Confirm the source account's real balance with get_solana_balance or get_token_accounts before retrying.";
        } else if (errStr.includes("AccountNotFound") || logs.some(l => l.includes("could not find account"))) {
          code = "ACCOUNT_NOT_FOUND";
          message = "This transaction references an account that doesn't exist on-chain yet.";
          fix = "If this is a token account, check find_ata first — it may need to be created before this transaction can run.";
        } else if (errStr.includes("custom program error")) {
          code = "PROGRAM_ERROR";
          message = `The target program rejected this instruction: ${errStr}`;
          fix = "This is a program-specific error code. Check the target program's documentation for what this code means, or inspect the logs below.";
        }
        issues.push({ severity: "ERROR", code, message, fix });
      }

      const hasErrors = issues.some(i => i.severity === "ERROR");
      return { content: [{ type: "text", text: JSON.stringify({
        network,
        verdict: hasErrors ? "UNSAFE" : "SAFE",
        safe: !hasErrors,
        issues,
        simulation: {
          success: simResult.value.err === null,
          error: simResult.value.err,
          logs: simResult.value.logs,
          unitsConsumed: simResult.value.unitsConsumed
        }
      }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  registerIntelligenceTools(mcpServer, {
    getConnection,
    onRpcCall: () => { stats.solanaRpcCalls++; },
  });

    return mcpServer;
  };

  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", async (req, res) => {
    const sessionId = randomUUID();
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);
    transports.set(sessionId, transport);
    await createMcpServer({ apiKey: keyFromReq(req), ip: req.ip || "unknown", visitorId: (req as any).trialVisitorId }).connect(transport);
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
    const server = createMcpServer({ apiKey: keyFromReq(req), ip: req.ip || "unknown", visitorId: (req as any).trialVisitorId });
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
    res.json(buildMcpManifest());
  });

  // LLM Crawler Discovery
  app.get("/robots.txt", noCache, (req, res) => {
    res.type("text/plain");
    res.send("User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: https://solana-pulse-gateway-1021990235790.us-central1.run.app/sitemap.xml");
  });

  app.get("/llms.txt", noCache, (req, res) => {
    res.type("text/plain");
    res.send(buildLlmsTxt());
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
