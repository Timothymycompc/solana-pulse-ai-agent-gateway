#!/bin/bash
set -e echo 
"======================================================" 
echo " Scaffolding Solana Pulse 
Backend & Fixing App State " echo 
"======================================================"
# 1. Generate package.json with the 
# necessary cryptographic and runtime 
# dependencies
cat << 'EOF' > package.json { "name": 
  "solana-pulse-gateway", "version": 
  "1.0.0", "description": "Solana 
  Pulse Gateway with Wallet Login and 
  Rate Limiting", "main": "app.js", 
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": { 
    "@solana/web3.js": "^1.75.0", 
    "bs58": "^5.0.0", "express": 
    "^4.18.2", "express-rate-limit": 
    "^7.1.5", "tweetnacl": "^1.0.3"
  }
}
EOF echo "[✓] Generated package.json"
# 2. Generate app.js with the proxy 
# header fixes to resolve 
# express-rate-limit errors
cat << 'EOF' > app.js const express = 
require('express'); const rateLimit = 
require('express-rate-limit'); const 
solanaRoutes = 
require('./routes/solana'); const app 
= express(); const PORT = 
process.env.PORT || 8080;
// FIX: Enable trust proxy to prevent 
// rate-limiter ValidationErrors in 
// proxy environments (Cloud Run)
app.set('trust proxy', 1);
// Parse JSON payload structures
app.use(express.json()); 
app.use(express.urlencoded({ 
extended: true }));
// Configure Global Rate Limiter to 
// handle client IPs safely over 
// Cloud Run proxies
const limiter = rateLimit({ windowMs: 
    15 * 60 * 1000, // 15 minutes 
    limit: 100, // Limit each client 
    IP to 100 requests per 15 mins 
    standardHeaders: 'draft-7', // 
    Sends standard RateLimit headers 
    legacyHeaders: false, // Prevents 
    sending non-standard 
    X-RateLimit-* headers message: {
        success: false, error: "Too 
        many requests from this IP, 
        please try again in 15 
        minutes."
    }
});
// Apply rate limiter to all API 
// endpoints
app.use('/api/', limiter);
// Mount your Solana routes
app.use('/api/solana', solanaRoutes);
// Base application health endpoint
app.get('/health', (req, res) => { 
    res.status(200).json({ status: 
    "UP", timestamp: new Date() });
});
app.listen(PORT, () => { 
    console.log(`Solana Pulse service 
    running on port ${PORT}`);
});
EOF echo "[✓] Generated app.js"
# 3. Create the routes directory and 
# write the standardized Solana 
# routes
mkdir -p routes cat << 'EOF' > 
routes/solana.js const express = 
require('express'); const router = 
express.Router(); const nacl = 
require('tweetnacl'); const bs58 = 
require('bs58'); const { Connection, 
PublicKey, LAMPORTS_PER_SOL } = 
require('@solana/web3.js');
// Initialize Connection (Falls back 
// to standard public Devnet RPC)
const connection = new 
Connection(process.env.SOLANA_RPC_URL 
|| 'https://api.devnet.solana.com');
/** * GET /api/solana/balance * 
 Returns standardized and formatted 
 account balance details in SOL */
router.get('/balance', async (req, 
res) => {
    try { const { address } = 
        req.query; if (!address) {
            return 
            res.status(400).json({
                success: false, 
                error: "Address query 
                parameter is 
                required."
            });
        }
        const pubKey = new 
        PublicKey(address); const 
        lamports = await 
        connection.getBalance(pubKey);
        
        res.status(200).json({ 
            success: true, data: {
                address, balance: 
                lamports / 
                LAMPORTS_PER_SOL, 
                unit: "SOL"
            }
        });
    } catch (err) {
        res.status(500).json({ 
        success: false, error: 
        err.message });
    }
});
/** * POST /api/solana/login * 
 Validates cryptographically signed 
 messages from Solana browser wallets 
 (SIWS) */
router.post('/login', async (req, 
res) => {
    try { const { publicKey, 
        signature, message } = 
        req.body; if (!publicKey || 
        !signature || !message) {
            return 
            res.status(400).json({
                success: false, 
                error: "Missing 
                required parameters: 
                publicKey, signature, 
                and message."
            });
        }
        // Parse key and signature 
        // strings into correct byte 
        // arrays
        const pubKey = new 
        PublicKey(publicKey); const 
        signatureBuffer = 
        bs58.decode(signature); const 
        messageBytes = new 
        TextEncoder().encode(message);
        // Verify Ed25519 signature
        const isValid = 
        nacl.sign.detached.verify(
            messageBytes, 
            signatureBuffer, 
            pubKey.toBytes()
        ); if (!isValid) { return 
            res.status(401).json({
                success: false, 
                error: "Cryptographic 
                verification failed. 
                Invalid signature."
            });
        }
        // Authentication Success: 
        // Generate secure session 
        // state/tokens here
        res.status(200).json({ 
            success: true, message: 
            "Authentication 
            successful", data: {
                address: publicKey, 
                token: 
                "placeholder-jwt-session-token"
            }
        });
    } catch (err) {
        res.status(500).json({ 
        success: false, error: 
        err.message });
    }
});
module.exports = router; EOF echo 
"[✓] Generated routes/solana.js"
# 4. Install npm dependencies 
# automatically
echo "Installing Node.js 
dependencies..." npm install echo 
"======================================================" 
echo " Scaffolding Complete!  " echo 
" Run: 'npm start' to run the server 
locally.  "
echo "======================================================"
