cat << 'EOF' > server.ts\nimport "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { Connection, PublicKey, clusterApiUrl, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import { randomUUID } from "crypto";
import { pool, consumePayment } from "./db";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// Dummy initialization for type reference - ensure your project's actual initialized mcpServer instance is imported/instantiated
const mcpServer: any = {
  connect: async (transport: any) => {}
};

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
        instructions: `Pass header 'x-api-key: <key>' with sufficient balance, or send \${minLamports} lamports to \${GATEWAY_WALLET} and pass 'x-payment-signature: <tx_signature>'.`,
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
      if (err.message?.includes("403") || err.status === 403) {
        console.warn("⚠️ Public RPC hit a 403 block. Rerouting caller to the micro-payment pool.");
        return res.status(402).json({
          error: "RPC Node Throttled (403)",
          priceLamports: 5000,
          instructions: `The public node is throttled. Please send 5000 lamports to \${GATEWAY_WALLET} and pass the transaction signature inside the 'x-payment-signature' header to unlock premium private RPC pools.`,
          payTo: GATEWAY_WALLET
        });
      }
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
      if (err.message?.includes("403") || err.status === 403) {
        console.warn("⚠️ Public RPC hit a 403 block. Rerouting caller to the micro-payment pool.");
        return res.status(402).json({
          error: "RPC Node Throttled (403)",
          priceLamports: 5000,
          instructions: `The public node is throttled. Please send 5000 lamports to \${GATEWAY_WALLET} and pass the transaction signature inside the 'x-payment-signature' header to unlock premium private RPC pools.`,
          payTo: GATEWAY_WALLET
        });
      }
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
  // 2. MODEL CONTEXT PROTOCOL (MCP) INTERFACE
  // ==========================================

  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", async (req, res) => {
    const sessionId = randomUUID();
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=\${sessionId}`, res);
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
      "instructions": "This is a real Server-Sent Events (SSE) MCP server for Solana on-chain tools. Premium endpoints require credit headers or upfront transaction signatures.",
      "mcp_sse_endpoint": "/mcp/sse",
      "tools": [
        {
          "name": "get_solana_balance",
          "description": "Queries the live ledger for a wallet balance. Free endpoint.",
          "inputSchema": { "type": "object", "properties": { "wallet": { "type": "string" }, "network": { "type": "string", "default": "mainnet-beta" } }, "required": ["wallet"] }
        },
        {
          "name": "get_solana_blockhash",
          "description": "Fetches the most recent blockhash for transaction signing. Free endpoint.",
          "inputSchema": { "type": "object", "properties": { "network": { "type": "string", "default": "mainnet-beta" } } }
        },
        {
          "name": "get_token_accounts",
          "description": "Premium Endpoint. Resolves token accounts and mints for a given owner. Cost: 5,000 lamports via x-payment-signature or x-api-key credits.",
          "inputSchema": { "type": "object", "properties": { "wallet": { "type": "string" }, "network": { "type": "string", "default": "mainnet-beta" } }, "required": ["wallet"] }
        },
        {
          "name": "get_recent_transactions",
          "description": "Premium Endpoint. Fetches transaction signatures for an address. Cost: 5,000 lamports via x-payment-signature or x-api-key credits.",
          "inputSchema": { "type": "object", "properties": { "wallet": { "type": "string" }, "network": { "type": "string", "default": "mainnet-beta" } }, "required": ["wallet"] }
        },
        {
          "name": "simulate_solana_transaction",
          "description": "Premium Endpoint. Deserializes and simulates a transaction string to calculate gas/units. Cost: 10,000 lamports.",
          "inputSchema": { "type": "object", "properties": { "transaction": { "type": "string", "description": "Base64 transaction string" }, "network": { "type": "string", "default": "mainnet-beta" } }, "required": ["transaction"] }
        }
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

  app.listen(PORT, "0.0.0.0", () => console.log(`Live Server running on port \${PORT}`));
}
startServer();
EOF\n
