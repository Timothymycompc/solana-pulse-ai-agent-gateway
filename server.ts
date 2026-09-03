import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { Connection, PublicKey, clusterApiUrl, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import { randomUUID, timingSafeEqual, createHmac } from "crypto";
import { isPaymentAlreadyUsed, recordPayment } from "./db";

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

  app.post("/api/solana/simulate", noCache, async (req, res) => {
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

  app.post("/api/payments/helius-webhook", async (req, res) => {
    try {
      const signatureHeader = req.headers["helius-signature"] as string | undefined;
      const secret = process.env.HELIUS_WEBHOOK_SECRET;
      if (!secret) return res.status(500).json({ error: "Webhook secret not configured" });
      if (!signatureHeader) return res.status(401).json({ error: "Missing signature header" });

      const rawBody = (req as any).rawBody as Buffer;
      const expectedSig = createHmac("sha256", secret).update(rawBody).digest("hex");

      const sigBuffer = Buffer.from(signatureHeader);
      const expectedBuffer = Buffer.from(expectedSig);
      const isValid = sigBuffer.length === expectedBuffer.length &&
        timingSafeEqual(sigBuffer, expectedBuffer);

      if (!isValid) return res.status(401).json({ error: "Invalid signature" });

      const events = Array.isArray(req.body) ? req.body : [req.body];
      const results = [];

      for (const event of events) {
        const txSignature = event.signature;
        const payerWallet = event.feePayer || event.accountData?.[0]?.account;
        const amountLamports = event.fee || 0;

        if (!txSignature || !payerWallet) {
          results.push({ status: "skipped", reason: "Missing signature or payer" });
          continue;
        }

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

        results.push({ txSignature, status: inserted ? "recorded" : "duplicate_race_ignored" });
      }

      res.json({ processed: results.length, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/analytics/live", noCache, (req, res) => res.json(stats));

  const mcpServer = new McpServer({ name: "solana-pulse-gateway", version: "1.0.0" });

  mcpServer.tool("get_solana_balance", "Get the SOL balance", {
    wallet: z.string(), network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ wallet, network }) => {
    stats.solanaRpcCalls++;
    try {
      const balance = await getConnection(network).getBalance(new PublicKey(wallet));
      return { content: [{ type: "text", text: JSON.stringify({ wallet, network, balance_sol: balance / 1e9 }, null, 2) }] };
    } catch (err: any) { return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true }; }
  });

  mcpServer.tool("get_solana_blockhash", "Get the latest blockhash", {
    network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ network }) => {
    stats.solanaRpcCalls++;
    try {
      const blockhash = await getConnection(network).getLatestBlockhash('finalized');
      return { content: [{ type: "text", text: JSON.stringify({ network, blockhash: blockhash.blockhash, timestamp: new Date().toISOString() }, null, 2) }] };
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
      "instructions": "This is a real Server-Sent Events (SSE) MCP server.",
      "mcp_sse_endpoint": "/mcp/sse",
      "tools": ["get_solana_balance", "get_solana_blockhash", "simulate_solana_transaction"]
    });
  });

  app.get("/api/debug/build", noCache, (req, res) => {
    res.json({ build: "canary-0007-dist-check", status: "alive" });
  });

  // BULLETPROOF PRODUCTION CHECK (Ignores NODE_ENV completely)
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
