import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Hardening: Restrict CORS (no credentials, strict origins if needed, but for public API allow GET)
  app.use(cors({
    origin: "*", // Public API, but we removed allow_credentials to fix the CORS hole
    methods: ["GET", "POST", "OPTIONS"]
  }));
  app.use(express.json());

  // Hardening: Add Rate Limiting to prevent DDoS / RPC spam
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  // Apply rate limiter to all /api routes
  app.use("/api/", apiLimiter);

  // In-memory stats to track real API hits
  const stats = {
    totalRequests: 0,
    solanaRpcCalls: 0,
  };

  // Connect to Real Solana Networks
  const mainnetConnection = new Connection(clusterApiUrl('mainnet-beta'));
  const devnetConnection = new Connection(clusterApiUrl('devnet'));

  const getConnection = (network: string) => 
    network === 'devnet' ? devnetConnection : mainnetConnection;

  // Real Solana RPC Bridge Endpoints
  app.get("/api/solana/balance", async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    
    try {
      const wallet = req.query.wallet as string;
      const network = (req.query.network as string) || 'mainnet-beta';
      
      if (!wallet) {
        return res.status(400).json({ error: "Wallet address required" });
      }

      const pubKey = new PublicKey(wallet);
      const connection = getConnection(network);
      
      // REAL network call
      const balance = await connection.getBalance(pubKey);
      
      res.json({
        wallet,
        network,
        balance_lamports: balance,
        balance_sol: balance / 1e9,
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/solana/blockhash", async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    
    try {
      const network = (req.query.network as string) || 'mainnet-beta';
      const connection = getConnection(network);
      
      // REAL network call
      const blockhash = await connection.getLatestBlockhash();
      
      res.json({
        network,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  // Analytics for Owner Portal
  app.get("/api/analytics/live", (req, res) => {
    res.json(stats);
  });

  // Serve MCP Manifest
  app.get("/.well-known/mcp.json", (req, res) => {
    stats.totalRequests++;
    res.json({
      "mcpServers": {
        "solana-pulse": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-everything"],
          "endpoints": {
            "get_balance": "/api/solana/balance",
            "get_blockhash": "/api/solana/blockhash"
          }
        }
      }
    });
  });

  // Vite middleware for development (serves the React UI)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Live Server running on port ${PORT}`);
  });
}

startServer();
