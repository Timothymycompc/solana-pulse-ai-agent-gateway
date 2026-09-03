var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
var import_path = __toESM(require("path"), 1);
var import_web3 = require("@solana/web3.js");
var import_fs = __toESM(require("fs"), 1);
var import_crypto = require("crypto");

// db.ts
var import_pg = require("pg");
var isCloudSqlSocket = (process.env.DATABASE_URL || "").includes("/cloudsql/");
var pool = new import_pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudSqlSocket ? void 0 : { rejectUnauthorized: false }
});
async function isPaymentAlreadyUsed(txSignature) {
  const result = await pool.query(
    "SELECT 1 FROM payments WHERE tx_signature = $1",
    [txSignature]
  );
  return (result.rowCount ?? 0) > 0;
}
async function recordPayment(params) {
  try {
    await pool.query(
      `INSERT INTO payments (tx_signature, payer_wallet, amount_lamports, endpoint_used, network)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.txSignature,
        params.payerWallet,
        params.amountLamports,
        params.endpointUsed || null,
        params.network || "mainnet-beta"
      ]
    );
    return true;
  } catch (err) {
    if (err.code === "23505") return false;
    throw err;
  }
}
async function consumePayment(txSignature, minLamports = 0) {
  const result = await pool.query(
    `UPDATE payments SET status = 'used' WHERE tx_signature = $1 AND status = 'verified' AND amount_lamports >= $2 RETURNING id`,
    [txSignature, minLamports]
  );
  return (result.rowCount ?? 0) > 0;
}

// server.ts
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_sse = require("@modelcontextprotocol/sdk/server/sse.js");
var import_zod = require("zod");
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = Number(process.env.PORT) || 3e3;
  app.use((0, import_cors.default)({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
  app.use(import_express.default.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));
  const apiLimiter = (0, import_express_rate_limit.default)({
    windowMs: 15 * 60 * 1e3,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });
  app.use("/api/", apiLimiter);
  app.use("/mcp/", apiLimiter);
  const stats = { totalRequests: 0, solanaRpcCalls: 0 };
  const mainnetRpcUrl = process.env.SOLANA_MAINNET_RPC_URL || (0, import_web3.clusterApiUrl)("mainnet-beta");
  const devnetRpcUrl = process.env.SOLANA_DEVNET_RPC_URL || (0, import_web3.clusterApiUrl)("devnet");
  const mainnetConnection = new import_web3.Connection(mainnetRpcUrl, "confirmed");
  const devnetConnection = new import_web3.Connection(devnetRpcUrl, "confirmed");
  const getConnection = (network) => network === "devnet" ? devnetConnection : mainnetConnection;
  const noCache = (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  };
  const GATEWAY_WALLET = "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU";
  const requirePayment = (minLamports) => (req, res, next) => {
    (async () => {
      const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
      const txSignature = req.headers["x-payment-signature"];
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
              remainingBalance: result.rows[0].credit_balance_lamports
            };
            return next();
          }
        } catch (dbErr) {
          console.error("API Key check error:", dbErr);
        }
      }
      if (txSignature) {
        const consumed = await consumePayment(txSignature, minLamports);
        if (consumed) {
          return next();
        }
      }
      return res.status(402).json({
        error: "Payment required",
        priceLamports: minLamports,
        instructions: `Pass header 'x-api-key: <key>' with sufficient balance, or send ${minLamports} lamports to ${GATEWAY_WALLET} and pass 'x-payment-signature: <tx_signature>'.`,
        payTo: GATEWAY_WALLET
      });
    })().catch(next);
  };
  app.get("/api/solana/balance", noCache, async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    try {
      const wallet = req.query.wallet;
      const network = req.query.network || "mainnet-beta";
      if (!wallet) return res.status(400).json({ error: "Wallet address required" });
      const balance = await getConnection(network).getBalance(new import_web3.PublicKey(wallet));
      res.json({ wallet, network, balance_lamports: balance, balance_sol: balance / 1e9, live_status: "SUCCESS" });
    } catch (err) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });
  app.get("/api/solana/blockhash", noCache, async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    try {
      const network = req.query.network || "mainnet-beta";
      const blockhash = await getConnection(network).getLatestBlockhash("finalized");
      res.json({ network, blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight, timestamp: Date.now(), live_status: "SUCCESS" });
    } catch (err) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });
  app.get("/api/solana/token-accounts", noCache, requirePayment(5e3), async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    try {
      const wallet = req.query.wallet;
      const network = req.query.network || "mainnet-beta";
      if (!wallet) return res.status(400).json({ error: "Wallet address required" });
      const ownerPubkey = new import_web3.PublicKey(wallet);
      const TOKEN_PROGRAM_ID = new import_web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const tokenAccounts = await getConnection(network).getParsedTokenAccountsByOwner(ownerPubkey, {
        programId: TOKEN_PROGRAM_ID
      });
      const tokens = tokenAccounts.value.map((accountInfo) => {
        const parsedInfo = accountInfo.account.data.parsed.info;
        return {
          accountPubkey: accountInfo.pubkey.toBase58(),
          mint: parsedInfo.mint,
          amount: parsedInfo.tokenAmount.uiAmount,
          decimals: parsedInfo.tokenAmount.decimals
        };
      });
      res.json({ wallet, network, tokenCount: tokens.length, tokens, live_status: "SUCCESS" });
    } catch (err) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });
  app.get("/api/solana/transactions", noCache, requirePayment(5e3), async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    try {
      const wallet = req.query.wallet;
      const network = req.query.network || "mainnet-beta";
      const limit = Math.min(Number(req.query.limit) || 10, 50);
      if (!wallet) return res.status(400).json({ error: "Wallet address required" });
      const ownerPubkey = new import_web3.PublicKey(wallet);
      const signatures = await getConnection(network).getSignaturesForAddress(ownerPubkey, { limit });
      res.json({ wallet, network, count: signatures.length, transactions: signatures, live_status: "SUCCESS" });
    } catch (err) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });
  app.post("/api/solana/simulate", noCache, requirePayment(1e4), async (req, res) => {
    stats.totalRequests++;
    stats.solanaRpcCalls++;
    try {
      const { transaction, network } = req.body;
      if (!transaction) return res.status(400).json({ error: "Base64 transaction required" });
      const net = network || "mainnet-beta";
      const txBuffer = Buffer.from(transaction, "base64");
      const tx = import_web3.VersionedTransaction.deserialize(txBuffer);
      const simResult = await getConnection(net).simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true
      });
      res.json({
        network: net,
        success: simResult.value.err === null,
        error: simResult.value.err,
        logs: simResult.value.logs,
        unitsConsumed: simResult.value.unitsConsumed,
        live_status: "SUCCESS"
      });
    } catch (err) {
      res.status(500).json({ error: err.message, live_status: "FAILED" });
    }
  });
  app.post("/api/payments/helius-webhook", async (req, res) => {
    try {
      const authHeader = req.headers["authorization"];
      const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET;
      if (!expectedSecret) return res.status(500).json({ error: "Webhook secret not configured" });
      if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });
      const authBuffer = Buffer.from(authHeader);
      const expectedBuffer = Buffer.from(expectedSecret);
      const isValid = authBuffer.length === expectedBuffer.length && (0, import_crypto.timingSafeEqual)(authBuffer, expectedBuffer);
      if (!isValid) return res.status(401).json({ error: "Invalid authorization" });
      const events = Array.isArray(req.body) ? req.body : [req.body];
      const results = [];
      for (const event of events) {
        const txSignature = event.signature;
        const nativeTransfers = event.nativeTransfers || [];
        const paymentTransfer = nativeTransfers.find(
          (t) => t.toUserAccount === GATEWAY_WALLET
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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/analytics/live", noCache, (req, res) => res.json(stats));
  const mcpServer = new import_mcp.McpServer({ name: "solana-pulse-gateway", version: "1.0.0" });
  mcpServer.tool("get_solana_balance", "Get the SOL balance of any wallet address", {
    wallet: import_zod.z.string(),
    network: import_zod.z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ wallet, network }) => {
    stats.solanaRpcCalls++;
    try {
      const balance = await getConnection(network).getBalance(new import_web3.PublicKey(wallet));
      return { content: [{ type: "text", text: JSON.stringify({ wallet, network, balance_sol: balance / 1e9 }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
  mcpServer.tool("get_solana_blockhash", "Get the latest finalized blockhash", {
    network: import_zod.z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ network }) => {
    stats.solanaRpcCalls++;
    try {
      const blockhash = await getConnection(network).getLatestBlockhash("finalized");
      return { content: [{ type: "text", text: JSON.stringify({ network, blockhash: blockhash.blockhash, timestamp: (/* @__PURE__ */ new Date()).toISOString() }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
  mcpServer.tool("get_token_accounts", "Get all SPL token balances and mints owned by a wallet", {
    wallet: import_zod.z.string().describe("Solana wallet public key"),
    network: import_zod.z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ wallet, network }) => {
    stats.solanaRpcCalls++;
    try {
      const ownerPubkey = new import_web3.PublicKey(wallet);
      const TOKEN_PROGRAM_ID = new import_web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const tokenAccounts = await getConnection(network).getParsedTokenAccountsByOwner(ownerPubkey, {
        programId: TOKEN_PROGRAM_ID
      });
      const tokens = tokenAccounts.value.map((accountInfo) => {
        const parsedInfo = accountInfo.account.data.parsed.info;
        return {
          accountPubkey: accountInfo.pubkey.toBase58(),
          mint: parsedInfo.mint,
          amount: parsedInfo.tokenAmount.uiAmount,
          decimals: parsedInfo.tokenAmount.decimals
        };
      });
      return { content: [{ type: "text", text: JSON.stringify({ wallet, tokenCount: tokens.length, tokens }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
  mcpServer.tool("get_recent_transactions", "Get recent transaction signatures for a wallet address", {
    wallet: import_zod.z.string().describe("Solana wallet public key"),
    limit: import_zod.z.number().optional().default(10),
    network: import_zod.z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ wallet, limit, network }) => {
    stats.solanaRpcCalls++;
    try {
      const ownerPubkey = new import_web3.PublicKey(wallet);
      const signatures = await getConnection(network).getSignaturesForAddress(ownerPubkey, { limit });
      return { content: [{ type: "text", text: JSON.stringify({ wallet, count: signatures.length, signatures }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
  mcpServer.tool("simulate_solana_transaction", "Simulate a Solana transaction without broadcasting it", {
    transaction: import_zod.z.string().describe("Base64-encoded serialized transaction"),
    network: import_zod.z.enum(["mainnet-beta", "devnet"]).optional().default("mainnet-beta")
  }, async ({ transaction, network }) => {
    stats.solanaRpcCalls++;
    try {
      const txBuffer = Buffer.from(transaction, "base64");
      const tx = import_web3.VersionedTransaction.deserialize(txBuffer);
      const simResult = await getConnection(network).simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true
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
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
  const transports = /* @__PURE__ */ new Map();
  app.get("/mcp/sse", async (req, res) => {
    const sessionId = (0, import_crypto.randomUUID)();
    const transport = new import_sse.SSEServerTransport(`/mcp/messages?sessionId=${sessionId}`, res);
    transports.set(sessionId, transport);
    await mcpServer.connect(transport);
    res.on("close", () => transports.delete(sessionId));
  });
  app.post("/mcp/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
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
  const distPath = import_path.default.join(process.cwd(), "dist");
  const isProduction = import_fs.default.existsSync(import_path.default.join(distPath, "index.html"));
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { allowedHosts: true, middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(import_express.default.static(distPath));
    app.use((req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Live Server running on port ${PORT}`));
}
startServer();
//# sourceMappingURL=server.cjs.map
