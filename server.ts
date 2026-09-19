
// ==========================================
// PAYWALL & CHALLENGE/CLAIM AUTH MODULE
// ==========================================
import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";

const pendingChallenges = new Map();
const apiKeys = new Map();

export function handleGetChallenge(req, res) {
  const challenge = crypto.randomBytes(32).toString("hex");
  pendingChallenges.set(challenge, { expiresAt: Date.now() + 5 * 60 * 1000 });
  res.json({ challenge });
}

export function handleClaimKey(req, res) {
  const { wallet, signature, challenge } = req.body;
  if (!wallet || !signature || !challenge) {
    return res.status(400).json({ error: "Missing wallet, signature, or challenge" });
  }

  const record = pendingChallenges.get(challenge);
  if (!record || record.expiresAt < Date.now()) {
    pendingChallenges.delete(challenge);
    return res.status(400).json({ error: "Invalid or expired challenge" });
  }

  try {
    const msgBytes = Buffer.from(challenge, "hex");
    const sigBytes = bs58.decode(signature);
    const pubKeyBytes = bs58.decode(wallet);

    if (!nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes)) {
      return res.status(401).json({ error: "Invalid wallet signature" });
    }
  } catch (err) {
    return res.status(400).json({ error: "Signature verification failed" });
  }

  pendingChallenges.delete(challenge);
  const apiKey = "sp_" + crypto.randomBytes(24).toString("hex");
  apiKeys.set(apiKey, {
    wallet,
    balanceLamports: 0,
    lifetimeCalls: 0,
    dailyCalls: 0,
    lastCallDate: new Date().toISOString().slice(0, 10),
  });

  res.json({ apiKey });
}

export function requirePayment(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const apiKey = req.headers["x-api-key"] || authHeader.replace("Bearer ", "").trim();

  if (!apiKey) {
    return res.status(401).json({ error: "Missing x-api-key header or Bearer token" });
  }

  const account = apiKeys.get(apiKey);
  if (!account) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (account.lastCallDate !== today) {
    account.dailyCalls = 0;
    account.lastCallDate = today;
  }

  if (account.lifetimeCalls < 50 && account.dailyCalls < 15) {
    account.lifetimeCalls += 1;
    account.dailyCalls += 1;
    return next();
  }

  const cost = 2200000;
  if (account.balanceLamports < cost) {
    return res.status(402).json({
      error: "Payment Required",
      message: "Insufficient credits. Free tier exhausted (50 lifetime / 15 daily).",
      balanceLamports: account.balanceLamports,
      requiredLamports: cost
    });
  }

  account.balanceLamports -= cost;
  account.lifetimeCalls += 1;
  account.dailyCalls += 1;
  next();
}

import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { Connection, PublicKey, clusterApiUrl, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import { randomUUID, timingSafeEqual } from "crypto";
import { pool, isPaymentAlreadyUsed, recordPayment, consumePayment } from "./db";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

async function startServer() {
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

      // Path A: API Key Balance Deduction
      if (apiKey && typeof apiKey === "string") {
        try {
          const query = `
            UPDATE api_keys
            SET credit_balance_lamports = credit_balance_lamports - $1, updated_at = NOW()
            WHERE key_hash = $2 AND is_active = TRUE AND credit_balance_lamports >= $1
            RETURNING wallet_address, credit_balance_lamports;
          `;
          const result = await pool.query(query, [minLamports, apiKey]);
          if (result.rowCount && result.rowCount > 0) {
            req.user = {
              wallet: result.rows[0].wallet_address,
              remainingBalance: result.rows[0].credit_balance_lamports,
            };
            return next();
          }
        } catch (dbErr) {
          console.error("API Key check error:", dbErr);
        }
      }

      // Path B: Per-call Solana Transaction Signature
      if (txSignature) {
        const consumed = await consumePayment(txSignature, minLamports);
        if (consumed) {
          return next();
        }
      }

      // If neither payment method passed
      return res.status(402).json({
        error: "Payment required",
        priceLamports: minLamports,
        instructions: `Pass header 'x-api-key: <key>' with sufficient balance, or send ${minLamports} lamports to ${GATEWAY_WALLET} and pass 'x-payment-signature: <tx_signature>'.`,
        payTo: GATEWAY_WALLET
      });
    })().catch(next);
  };

  // ==========================================
  // 1. SOLANA CORE API ENDPOINTS
  // ==========================================

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

  app.get("/api/solana/token-accounts", noCache, requirePayment(5000), async (req, res) => {
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

  app.get("/api/solana/transactions", noCache, requirePayment(5000), async (req, res) => {
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

  app.post("/api/solana/simulate", noCache, requirePayment(10000), async (req, res) => {
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
          await pool.query(
            `INSERT INTO api_keys (key_hash, wallet_address, credit_balance_lamports)
             VALUES ($1, $2, $3)
             ON CONFLICT (key_hash)
             DO UPDATE SET credit_balance_lamports = api_keys.credit_balance_lamports + $3, updated_at = NOW()`,
            [payerWallet, payerWallet, amountLamports]
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
      "instructions": "This is a real Server-Sent Events (SSE) MCP server for Solana on-chain tools.",
      "mcp_sse_endpoint": "/mcp/sse",
      "tools": [
        "get_solana_balance",
        "get_solana_blockhash",
        "get_token_accounts",
        "get_recent_transactions",
        "simulate_solana_transaction"
      ]
    });
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

  
// ==========================================
// GENERIC SOLANA MICROSERVICE ROUTER (NEW)
// ==========================================
app.all('/api/solana/:service', (req, res, next) => { const free = ['balance', 'blockhash']; if (free.includes(req.params.service)) return next(); return requirePayment(req, res, next); }, async (req, res) => {
  const service = req.params.service;
  const targetUrls = {
    'rent': 'https://solana-rent-calculator-1021990235790.us-central1.run.app',
    'metadata': 'https://solana-token-metadata-1021990235790.us-central1.run.app',
    'block': 'https://solana-block-scanner-1021990235790.us-central1.run.app',
    'decode': 'https://solana-tx-decoder-1021990235790.us-central1.run.app',
    'fees': 'https://solana-gas-estimator-1021990235790.us-central1.run.app',
    'profile': 'https://solana-wallet-profiler-1021990235790.us-central1.run.app',
  };
  
  const targetUrl = targetUrls[service];
  if (!targetUrl) {
    return res.status(404).json({ error: 'Service not registered' });
  }

  try {
    const url = `${targetUrl}${req.url.replace('/api/solana/' + service, '')}`;
    const response = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect to microservice: ' + service });
  }
});


app.get('/api/keys/challenge', handleGetChallenge);
app.post('/api/keys/claim', handleClaimKey);

app.listen(PORT, "0.0.0.0", () => console.log(`Live Server running on port ${PORT}`));
}
startServer();
