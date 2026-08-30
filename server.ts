import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import fs from "fs";
import { randomUUID } from "crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "OPTIONS"]
  }));
  app.use(express.json());

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  app.use("/api/", apiLimiter);
  app.use("/mcp/", apiLimiter);

  const stats = {
    totalRequests: 0,
    solanaRpcCalls: 0,
  };

  const mainnetRpcUrl = process.env.SOLANA_MAINNET_RPC_URL || clusterApiUrl('mainnet-beta');
  const devnetRpcUrl = process.env.SOLANA_DEVNET_RPC_URL || clusterApiUrl('devnet');

  const mainnetConnection = new Connection(mainnetRpcUrl, 'confirmed');
  const devnetConnection = new Connection(devnetRpcUrl, 'confirmed');

  const getConnection = (network: string) => 
    network === 'devnet' ? devnetConnection : mainnetConnection;

  // No-cache middleware for API responses
  const noCache = (req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  };

  // ---------------------------------------------------
  // 1. Standard REST Endpoints
  // ---------------------------------------------------
  app.get("/api/solana/balance", noCache, async (req, res) => {
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

  app.get("/api/solana/blockhash", noCache, async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    
    try {
      const network = (req.query.network as string) || 'mainnet-beta';
      const connection = getConnection(network);
      
      const blockhash = await connection.getLatestBlockhash('finalized');
      
      res.json({
        network,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
        timestamp: Date.now(), // Force response variation for debugging
        live_status: "SUCCESS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });

  app.get("/api/analytics/live", noCache, (req, res) => {
    res.json(stats);
  });

  // ---------------------------------------------------
  // 2. Real MCP SSE Server Implementation
  // ---------------------------------------------------
  const mcpServer = new McpServer({
    name: "solana-pulse-gateway",
    version: "1.0.0"
  });

  // Register real tools for the MCP server
  mcpServer.tool("get_solana_balance",
    "Get the SOL balance of any Solana wallet address",
    {
      wallet: z.string().describe("Base58 encoded Solana wallet address"),
      network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta").describe("Solana cluster network")
    },
    async ({ wallet, network }) => {
      stats.solanaRpcCalls++;
      try {
        const pubKey = new PublicKey(wallet);
        const connection = getConnection(network);
        const balance = await connection.getBalance(pubKey);
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              wallet,
              network,
              balance_sol: balance / 1e9
            }, null, 2) 
          }]
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  mcpServer.tool("get_solana_blockhash",
    "Get the latest blockhash from the Solana network for transaction signing",
    {
      network: z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta").describe("Solana cluster network")
    },
    async ({ network }) => {
      stats.solanaRpcCalls++;
      try {
        const connection = getConnection(network);
        const blockhash = await connection.getLatestBlockhash('finalized');
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              network,
              blockhash: blockhash.blockhash,
              lastValidBlockHeight: blockhash.lastValidBlockHeight,
              timestamp: new Date().toISOString()
            }, null, 2) 
          }]
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", async (req, res) => {
    const sessionId = randomUUID();
    const transport = new SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);
    transports.set(sessionId, transport);
    await mcpServer.connect(transport);

    res.on("close", () => {
      transports.delete(sessionId);
    });
  });

  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }

    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(404).json({ error: "MCP SSE Session not found" });
    }
  });

  // Provide proper Claude Desktop configuration instead of a fake generic server
  app.get("/.well-known/mcp.json", noCache, (req, res) => {
    stats.totalRequests++;
    
    // Provide actual Claude Desktop configuration instructions
    res.json({
      "instructions": "This is a real Server-Sent Events (SSE) MCP server. To use it with Claude Desktop, you can configure an SSE bridge or write a small stdio-to-sse wrapper. Alternatively, you can use the REST API endpoints directly.",
      "mcp_sse_endpoint": "/mcp/sse",
      "tools": ["get_solana_balance", "get_solana_blockhash"],
      "rest_endpoints": {
        "get_balance": "/api/solana/balance",
        "get_blockhash": "/api/solana/blockhash"
      },
      "claude_desktop_config": {
        "mcpServers": {
          "solana-pulse": {
            "command": "node",
            "args": ["/path/to/your/stdio-sse-bridge.js", "https://[YOUR_URL]/mcp/sse"]
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
