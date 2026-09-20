const express = require('express');
const router = express.Router();
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Initialize Connection (Falls back to standard public Devnet RPC)
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

/**
 * GET /api/solana/balance
 * Returns standardized and formatted account balance details in SOL
 */
router.get('/balance', async (req, res) => {
    try {
        const { address } = req.query;
        if (!address) {
            return res.status(400).json({ 
                success: false, 
                error: "Address query parameter is required." 
            });
        }

        const pubKey = new PublicKey(address);
        const lamports = await connection.getBalance(pubKey);
        
        res.status(200).json({
            success: true,
            data: {
                address,
                balance: lamports / LAMPORTS_PER_SOL,
                unit: "SOL"
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/solana/login
 * Validates cryptographically signed messages from Solana browser wallets (SIWS)
 */
router.post('/login', async (req, res) => {
    try {
        const { publicKey, signature, message } = req.body;

        if (!publicKey || !signature || !message) {
            return res.status(400).json({ 
                success: false, 
                error: "Missing required parameters: publicKey, signature, and message." 
            });
        }

        // Parse key and signature strings into correct byte arrays
        const pubKey = new PublicKey(publicKey);
        const signatureBuffer = bs58.decode(signature);
        const messageBytes = new TextEncoder().encode(message);

        // Verify Ed25519 signature
        const isValid = nacl.sign.detached.verify(
            messageBytes,
            signatureBuffer,
            pubKey.toBytes()
        );

        if (!isValid) {
            return res.status(401).json({ 
                success: false, 
                error: "Cryptographic verification failed. Invalid signature." 
            });
        }

        // Authentication Success: Generate secure session state/tokens here
        res.status(200).json({
            success: true,
            message: "Authentication successful",
            data: {
                address: publicKey,
                token: "placeholder-jwt-session-token"
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
