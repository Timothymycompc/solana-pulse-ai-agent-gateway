import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { Connection, PublicKey, clusterApiUrl, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import fs from "fs";
import { randomUUID } from "crypto";
import { pool, ensureSchema, recordServiceUsage } from "./db";
import { makeAutofill } from "./resolver";
import { keyFromReq } from "./authKey";
import { loadSecrets } from "./src/secrets";
import { registerIntelligenceTools } from "./src/mcp/intelligenceTools";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { admitCall, getFreeCallStatus, hashIp, paidRouteMiddleware, refundFreeCall } from "./meter";
import { FREE_CALLS_PER_TOOL, priceLabel, priceOf, TOOL_PRICES } from "./pricing";
import { createX402, X402_NETWORK } from "./x402";
import { z } from "zod";

async function startServer() {
  // Load secrets from Google Secret Manager first
  await loadSecrets(['DATABASE_URL', 'HELIUS_WEBHOOK_SECRET', 'OWNER_API_KEY']);

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


  // Record route-level usage without storing query values, request bodies, or raw IP addresses.
  // Each row keeps a keyed hash of the caller network and the client name, so real users can be told apart from uptime bots.
  const trackServiceUsage = (req: any, res: any, next: any) => {
    const pathOnly = String(req.originalUrl || req.url).split("?")[0];
    if (pathOnly === "/api/analytics/usage") return next();
    const callerHash = req.ip ? hashIp(req.ip) : null;
    const client = String(req.headers["user-agent"] || "").slice(0, 120) || null;
    res.once("finish", () => {
      const toolName = req.body?.method === "tools/call" ? req.body?.params?.name : null;
      const endpoint = pathOnly === "/mcp" && typeof toolName === "string"
        ? `/mcp/tools/${toolName.replace(/[^a-zA-Z0-9_-]/g, "")}`
        : pathOnly;
      void recordServiceUsage({ wallet: null, endpoint, method: req.method, status: res.statusCode, callerHash, client });
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
  ]);

  const FREE_REQUESTS_PER_MINUTE = 120;
  const readRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: FREE_REQUESTS_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Request rate limit reached (" + FREE_REQUESTS_PER_MINUTE + " requests per minute). Slow down or retry shortly." }
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

  // Paid tools settle in USDC via x402 to GATEWAY_WALLET; free tools, free calls and the owner key skip payment.
  const x402 = createX402(GATEWAY_WALLET);
  const paidRoute = paidRouteMiddleware(x402.httpMiddleware);

  // ==========================================
  // 1. SOLANA CORE API ENDPOINTS
  // ==========================================

  const autofill = makeAutofill(getConnection);

  app.get("/api/solana/balance", readRateLimiter, noCache, autofill, paidRoute, async (req, res) => {
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

  app.get("/api/solana/blockhash", readRateLimiter, noCache, autofill, paidRoute, async (req, res) => {
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

  app.get("/api/solana/token-accounts", readRateLimiter, noCache, autofill, paidRoute, async (req, res) => {
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

  app.get("/api/solana/transactions", readRateLimiter, noCache, autofill, paidRoute, async (req, res) => {
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

  app.post("/api/solana/simulate", noCache, paidRoute, async (req, res) => {
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

  app.post("/api/solana/validate-and-simulate", noCache, paidRoute, async (req, res) => {
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

  app.get("/api/solana/find-ata", readRateLimiter, noCache, autofill, paidRoute, async (req, res) => {
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

  app.get("/api/solana/token-profile", noCache, autofill, paidRoute, async (req, res) => {
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

  app.get("/api/solana/optimal-fee", noCache, autofill, paidRoute, async (req, res) => {
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

  app.get("/api/solana/decode-tx", noCache, autofill, paidRoute, async (req, res) => {
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

  app.get("/api/trial/status", noCache, async (req: any, res) => {
    try {
      const used = await getFreeCallStatus(req.ip || "unknown");
      res.json({ scope: "caller_ip", freeCallsPerTool: FREE_CALLS_PER_TOOL, freeCallsUsedByTool: used, prices: TOOL_PRICES, network: X402_NETWORK, asset: "USDC" });
    } catch (error) {
      console.error("free call status lookup failed:", error);
      res.status(503).json({ error: "Free call status is temporarily unavailable." });
    }
  });

  app.get("/api/analytics/live", noCache, (req, res) => res.json(stats));

  app.get("/api/analytics/usage", readRateLimiter, noCache, async (req, res) => {
    // Tool runs are real data calls; other /mcp traffic is connections, tool listings and uptime pings.
    const TOOL_RUN = `(endpoint LIKE '/api/solana/%' OR endpoint LIKE '/mcp/tools/%')`;
    const you = req.ip ? hashIp(req.ip) : "";
    try {
      const [totals, tools] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE ${TOOL_RUN} AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS tool_runs_24h,
            COUNT(DISTINCT caller_hash) FILTER (WHERE ${TOOL_RUN} AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS callers_24h,
            COUNT(DISTINCT caller_hash) FILTER (WHERE ${TOOL_RUN} AND caller_hash <> $1 AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS other_callers_24h,
            COUNT(*) FILTER (WHERE ${TOOL_RUN} AND caller_hash <> $1)::bigint AS other_tool_runs_7d,
            COUNT(DISTINCT caller_hash) FILTER (WHERE ${TOOL_RUN} AND caller_hash <> $1)::bigint AS other_callers_7d,
            COUNT(*) FILTER (WHERE endpoint LIKE '/mcp%' AND NOT ${TOOL_RUN} AND created_at >= NOW() - INTERVAL '24 hours')::bigint AS pings_24h,
            MAX(created_at) FILTER (WHERE ${TOOL_RUN}) AS last_tool_run_at
          FROM service_usage
          WHERE created_at >= NOW() - INTERVAL '7 days'
        `, [you]),
        pool.query(`
          SELECT endpoint, COUNT(*)::bigint AS runs,
            COUNT(DISTINCT caller_hash) FILTER (WHERE caller_hash <> $1)::bigint AS other_callers,
            MAX(created_at) AS last_run_at
          FROM service_usage
          WHERE ${TOOL_RUN} AND created_at >= NOW() - INTERVAL '7 days'
          GROUP BY endpoint
          ORDER BY COUNT(*) DESC, endpoint ASC
          LIMIT 12
        `, [you]),
      ]);
      const row = totals.rows[0] || {};
      res.json({
        toolRuns24h: Number(row.tool_runs_24h || 0),
        callers24h: Number(row.callers_24h || 0),
        otherCallers24h: Number(row.other_callers_24h || 0),
        otherToolRuns7d: Number(row.other_tool_runs_7d || 0),
        otherCallers7d: Number(row.other_callers_7d || 0),
        pings24h: Number(row.pings_24h || 0),
        lastToolRunAt: row.last_tool_run_at || null,
        tools: tools.rows.map((t: any) => ({
          endpoint: t.endpoint,
          runs: Number(t.runs),
          otherCallers: Number(t.other_callers),
          lastRunAt: t.last_run_at,
        })),
        note: "A tool run is a data call over HTTP or MCP. Callers are counted by network, so \"besides you\" means a different network from the one viewing this page. Pings are MCP connections and tool listings, mostly directory uptime checks.",
      });
    } catch (error: any) {
      console.error("usage analytics query failed:", error);
      res.status(503).json({ error: "Live usage counts are temporarily unavailable." });
    }
  });

  // ==========================================
  // 3. MCP SERVER (FOR LLMs / AGENTS)
  // ==========================================

  const createMcpServer = (ctx: { apiKey?: string; ip: string } = { ip: "unknown" }) => {
  const mcpServer = new McpServer({ name: "solana-pulse-gateway", version: "1.0.0" });
  const rawTool = (mcpServer as any).tool.bind(mcpServer);
  // Every tool goes through the same admission as HTTP: free tools run, the owner key and free calls run unpaid,
  // and everything else follows the x402 MCP transport (PaymentRequired result, then _meta["x402/payment"]).
  (mcpServer as any).tool = (name: string, ...rest: any[]) => {
    const handler = rest.pop();
    const price = priceOf(name);
    if (typeof rest[0] === "string") rest[0] = `${rest[0]} Cost: ${priceLabel(name)}.${price ? " Calls that return an error are not charged." : ""}`;
    return rawTool(name, ...rest, async (args: any, extra: any) => {
      if (!price) return handler(args, extra);
      let admission;
      try {
        admission = await admitCall({ tool: name, ip: ctx.ip, apiKey: ctx.apiKey, hasPayment: Boolean(extra?._meta?.["x402/payment"]) });
      } catch (error) {
        console.error("free call metering error:", error);
        return { content: [{ type: "text", text: "Usage metering is temporarily unavailable. Retry shortly." }], isError: true };
      }
      if (admission.via === "x402") {
        try {
          return await (await x402.wrapMcpTool(name, price, handler))(args, extra);
        } catch (error) {
          console.error("x402 payment setup failed:", error);
          return { content: [{ type: "text", text: "Payments are temporarily unavailable. Retry shortly." }], isError: true };
        }
      }
      let result: any;
      try { result = await handler(args, extra); }
      catch (e) { if (admission.via === "free_call") await refundFreeCall(ctx.ip, name); throw e; }
      if (admission.via !== "free_call") return result;
      if (result?.isError) await refundFreeCall(ctx.ip, name);
      return { ...result, _meta: { ...(result?._meta || {}), freeCallsRemaining: admission.remaining } };
    });
  };

  const NETWORK = z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta").describe('Cluster to query: "mainnet-beta" (real funds; the default) or "devnet" (test network). Optional.');
  const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

  mcpServer.tool("get_solana_balance", "Get a wallet's current SOL balance. Use it to check a wallet can cover a transfer or fee, or that funds arrived. Returns {wallet, network, balance_sol}. Example: {\"wallet\":\"<wallet address>\"}", {
    wallet: z.string().describe("Wallet whose SOL balance to read: base58 public key, 32-44 characters (required)."), network: NETWORK
  }, READ_ONLY, async ({ wallet, network }) => {
    stats.solanaRpcCalls++;
    try {
      const balance = await getConnection(network).getBalance(new PublicKey(wallet));
      return { content: [{ type: "text", text: JSON.stringify({ wallet, network, balance_sol: balance / 1e9 }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_solana_blockhash", "Get the latest finalized blockhash. Use it when building a transaction you will sign and send yourself; a transaction is only valid with a recent blockhash. Returns {network, blockhash, timestamp}. Example: {\"network\":\"mainnet-beta\"}", {
    network: NETWORK
  }, READ_ONLY, async ({ network }) => {
    stats.solanaRpcCalls++;
    try {
      const blockhash = await getConnection(network).getLatestBlockhash('finalized');
      return { content: [{ type: "text", text: JSON.stringify({ network, blockhash: blockhash.blockhash, timestamp: new Date().toISOString() }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_token_accounts", "List every SPL token account a wallet owns: account address, mint, balance, decimals. Use it to see what tokens a wallet holds before swapping or sending. Returns {wallet, tokenCount, tokens}. Example: {\"wallet\":\"<wallet address>\"}", {
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

  mcpServer.tool("get_recent_transactions", "List a wallet's most recent transaction signatures, newest first, with slot, time and error status. Use it to find a transaction to inspect with decode_tx. Returns {wallet, count, signatures}. Example: {\"wallet\":\"<wallet address>\",\"limit\":5}", {
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

  mcpServer.tool("simulate_solana_transaction", "Dry-run a transaction against live chain state without sending it. Returns success, error, program logs and compute units used. Use it to test a transaction; for a SAFE or UNSAFE verdict with fix hints use validate_transaction. Nothing is broadcast. Example: {\"transaction\":\"<base64 transaction>\"}", {
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

  mcpServer.tool("find_ata", "Derive the Associated Token Account (ATA) address for a wallet and token mint, and say whether it already exists on-chain. Use it before sending SPL tokens, to know the destination account and whether it must be created. Returns {owner, mint, ataAddress, exists, network}. Example: {\"wallet\":\"<wallet address>\",\"mint\":\"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\"}", {
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

  mcpServer.tool("token_profile", "Live safety profile of an SPL token: decimals, supply, freeze and mint authority status, a risk level (HIGH when a freeze authority exists, so holders can be frozen), and the top 10 holders. Use it before buying or recommending an unfamiliar token. Cached 60 seconds. Example: {\"mint\":\"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\"}", {
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

  mcpServer.tool("optimal_fee", "Live priority-fee recommendation for current congestion: low, medium and high tiers in micro-lamports per compute unit with estimated confirmation times, plus min, max and average. Use it just before sending a transaction so it lands without overpaying. Example: {\"network\":\"mainnet-beta\"}", {
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

  mcpServer.tool("decode_tx", "Explain a confirmed transaction in plain language: category (swap, SOL transfer, meme-coin trade), success or failure, fee, slot, time, each account's SOL balance change, and raw logs. Use it to check what a transaction actually did. Example: {\"signature\":\"<transaction signature>\"}", {
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

  mcpServer.tool("validate_transaction", "Pre-send safety check: decodes the transaction, checks the fee payer can pay fees, tests it against live chain state without sending, and returns a SAFE or UNSAFE verdict with issues (each with a code and fix hint), logs and compute units. Use it as the last step before signing an agent-built transaction. Example: {\"transaction\":\"<base64 transaction>\"}", {
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
    await createMcpServer({ apiKey: keyFromReq(req), ip: req.ip || "unknown" }).connect(transport);
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
    const server = createMcpServer({ apiKey: keyFromReq(req), ip: req.ip || "unknown" });
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
  // Tool summaries for the manifest; prices come from pricing.ts.
  const MANIFEST_TOOLS: [string, string][] = [
    ["get_solana_balance", "Read a wallet's SOL balance."],
    ["get_solana_blockhash", "Get the latest finalized blockhash for building a transaction."],
    ["get_token_accounts", "List every SPL token account a wallet owns, with mint and balance."],
    ["get_recent_transactions", "List a wallet's recent transaction signatures, newest first."],
    ["simulate_solana_transaction", "Dry-run a base64 transaction against live chain state without sending it."],
    ["find_ata", "Derive a wallet's Associated Token Account for a mint and check if it exists."],
    ["token_profile", "Token profile with decimals, supply, freeze and mint authorities, and top holders. Freeze-authority risk is a heuristic, not honeypot detection."],
    ["optimal_fee", "Live low, medium and high priority-fee tiers for current congestion."],
    ["decode_tx", "Explain a confirmed transaction: category, status, fee, balance changes, logs."],
    ["validate_transaction", "Pre-send check: SAFE or UNSAFE verdict with fix hints."],
    ["get_wallet_snapshot", "Combine SOL and token holdings with recent activity in one wallet snapshot."],
    ["summarize_wallet_activity", "Summarize recent success and failure counts for a wallet."],
    ["resolve_token_symbol", "Find Solana token candidates for a ticker, ranked by reported liquidity."],
    ["get_token_market_snapshot", "Return DEX price, liquidity, 24-hour volume, and pair link for a mint."],
    ["analyze_token_concentration", "Calculate top-ten token-account share of supply and report mint authorities."],
    ["compare_tokens", "Compare two mints across supply, authorities, and top-account concentration."],
    ["inspect_address", "Classify an account using its owner program, executable flag, and parsed token data."],
    ["explain_transaction_effects", "Join pre/post RPC data into SOL and token balance changes, fee, status, and program labels."],
    ["analyze_wallet_portfolio", "Estimate priced SOL and token holdings in USD and report missing market prices."],
    ["estimate_transaction_cost", "Estimate base and configured priority fees, then simulate without broadcasting."]
  ];
  const pricingSummary = `Basic reads are free (rate-limited). Every other tool has ${FREE_CALLS_PER_TOOL} free calls per caller, then costs $0.001-$0.01 USDC per call, paid per request with x402 on Solana mainnet. Calls that return an error are not charged.`;

  app.get("/.well-known/mcp.json", noCache, (req, res) => {
    stats.totalRequests++;
    res.json({
      name: "Solana Pulse AI Agent Gateway",
      version: "1.0.0",
      description: "Live Solana data and agent-ready analysis through 20 Model Context Protocol tools for mainnet-beta and devnet.",
      capabilities: { tools: { description: `Twenty read-only tools combine live Solana account data, transaction effects, token market context, portfolio estimates, and transaction cost analysis. ${pricingSummary}` } },
      instructions: `Connect using POST /mcp (Streamable HTTP) or /mcp/sse (SSE). ${pricingSummary} Paid calls follow the x402 v2 MCP transport: an unpaid call returns a PaymentRequired result, and the client retries with _meta["x402/payment"]. No account or API key is needed. Token authority and concentration fields are screening signals, not complete safety checks. Market values are estimates; transaction simulation is not a guarantee of later execution.`,
      payments: { protocol: "x402", x402Version: 2, scheme: "exact", network: X402_NETWORK, asset: "USDC", payTo: GATEWAY_WALLET, freeCallsPerTool: FREE_CALLS_PER_TOOL },
      mcp_sse_endpoint: "/mcp/sse",
      tools: MANIFEST_TOOLS.map(([name, description]) => ({ name, description: `${description} ${priceLabel(name)}.`, price: priceOf(name) })),
    });
  });

  // Glama connector ownership verification
  app.get("/.well-known/glama.json", (req, res) => {
    res.json({ $schema: "https://glama.ai/mcp/schemas/connector.json", maintainers: [{ email: "timothymycompc@gmail.com" }] });
  });

  // LLM Crawler Discovery
  app.get("/robots.txt", noCache, (req, res) => {
    res.type("text/plain");
    res.send("User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: https://solana-pulse-gateway-1021990235790.us-central1.run.app/sitemap.xml");
  });

  app.get("/llms.txt", noCache, (req, res) => {
    res.type("text/plain");
    res.send(`# Solana Pulse AI Agent Gateway\n
Solana blockchain API and Model Context Protocol (MCP) server. Provides read-only lookups, transaction simulation, token metadata, priority-fee estimates, and transaction decoding on mainnet-beta and devnet.

## Pricing (x402, USDC on Solana)
- Free, rate-limited (120 requests per minute per IP): ${Object.keys(TOOL_PRICES).filter((t) => !TOOL_PRICES[t]).join(", ")}.
- Every other tool: ${FREE_CALLS_PER_TOOL} free calls per caller (counted by IP address, shared between HTTP and MCP), then a per-call price in USDC:
${Object.entries(TOOL_PRICES).filter(([, p]) => p).map(([t, p]) => `  - ${t}: ${p}`).join("\n")}
- No account or API key. Pay per request with x402 v2 (scheme "exact", network ${X402_NETWORK}). Calls that return an error are not charged.

## HTTP API
- GET /api/solana/balance?wallet=<address> — native SOL balance.
- GET /api/solana/blockhash — latest finalized blockhash.
- GET /api/solana/token-accounts?wallet=<address> — SPL token accounts.
- GET /api/solana/transactions?wallet=<address> — recent signatures (maximum 50).
- GET /api/solana/find-ata?wallet=<address>&mint=<mint> — derive an ATA and check whether it exists.
- POST /api/solana/simulate — simulate a base64 serialized VersionedTransaction without broadcasting.
- POST /api/solana/validate-and-simulate — simulate a transaction and return a safety verdict with fix hints.
- GET /api/solana/token-profile?mint=<mint> — token details, mint authorities, risk signal, and top holders.
- GET /api/solana/optimal-fee — recent priority-fee estimates.
- GET /api/solana/decode-tx?signature=<signature> — transaction summary and balance changes.
- GET /api/trial/status — free calls used per tool for this caller, and each tool's price.

## MCP Tools (20)
- Core tools: get_solana_balance, get_solana_blockhash, get_token_accounts, get_recent_transactions, simulate_solana_transaction, find_ata, token_profile, optimal_fee, decode_tx, and validate_transaction.
- Intelligence tools: get_wallet_snapshot, summarize_wallet_activity, resolve_token_symbol, get_token_market_snapshot, analyze_token_concentration, compare_tokens, inspect_address, explain_transaction_effects, analyze_wallet_portfolio, and estimate_transaction_cost.
- Prices are listed under Pricing and in each tool description.

## Paying with x402
- HTTP: an unpaid call to a paid route returns 402 with a PAYMENT-REQUIRED header (base64 PaymentRequired). Retry with a PAYMENT-SIGNATURE header; the receipt comes back in PAYMENT-RESPONSE.
- MCP: an unpaid call returns a tool result with isError and the PaymentRequired object. Retry the call with the payment in _meta["x402/payment"]; the receipt comes back in _meta["x402/payment-response"].
- Client libraries such as @x402/fetch and @x402/mcp handle this automatically.

## Entry Points
- Streamable HTTP endpoint: POST /mcp
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
