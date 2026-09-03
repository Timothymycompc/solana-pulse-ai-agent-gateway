-- 1. Table to store API Keys and User Credit Balances
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash VARCHAR(64) UNIQUE NOT NULL,
    wallet_address VARCHAR(44) NOT NULL,
    credit_balance_lamports BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast key lookup during API calls
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

-- 2. Table to store incoming payment logs from Helius Webhooks
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    tx_signature VARCHAR(128) UNIQUE NOT NULL,
    payer_wallet VARCHAR(44) NOT NULL,
    amount_lamports BIGINT NOT NULL,
    network VARCHAR(32) DEFAULT 'mainnet-beta',
    status VARCHAR(32) DEFAULT 'verified',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Insert a default test API key with 10,000,000 lamports (0.01 SOL) so you can test immediately
INSERT INTO api_keys (key_hash, wallet_address, credit_balance_lamports)
VALUES ('test-agent-key-12345', 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', 10000000)
ON CONFLICT (key_hash) DO NOTHING;
