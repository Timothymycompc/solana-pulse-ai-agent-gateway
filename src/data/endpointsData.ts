import { ApiEndpoint } from '../types';

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'solana-validate-and-simulate',
    name: 'Validate & Simulate Transaction',
    suite: 'safety',
    method: 'POST',
    path: '/api/solana/validate-and-simulate',
    summary: 'Simulates a transaction and returns a plain Safe/Unsafe verdict with a specific fix.',
    description: 'Wraps transaction simulation with pre-flight checks for common agent mistakes: malformed transactions, an underfunded fee payer, missing accounts, and program errors. Returns a clear verdict and a concrete fix instead of a raw error blob.',
    priceLamports: 2200000,
    category: 'Pre-Flight',
    isLive: true,
    requestBodySchema: {
      transaction: 'string (Base64 encoded VersionedTransaction)',
      network: 'string (mainnet-beta | devnet)'
    },
    sampleRequestBody: {
      transaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA...',
      network: 'mainnet-beta'
    },
    sampleResponse: {
      network: 'mainnet-beta',
      verdict: 'UNSAFE',
      safe: false,
      issues: [
        {
          severity: 'ERROR',
          code: 'INSUFFICIENT_FEE_PAYER_BALANCE',
          message: 'Fee payer has 0 lamports, below the estimated base fee of 5000 lamports for 1 signature(s).',
          fix: 'Fund the fee payer wallet with more SOL before sending this transaction.'
        }
      ],
      simulation: {
        success: false,
        error: null,
        logs: [],
        unitsConsumed: 0
      },
      live_status: 'SUCCESS'
    },
    tags: ['preflight', 'safety', 'simulation']
  },
  {
    id: 'solana-simulate',
    name: 'Simulate Transaction',
    suite: 'safety',
    method: 'POST',
    path: '/api/solana/simulate',
    summary: 'Simulates a base64 encoded transaction.',
    description: 'Simulates a base64 encoded serialized transaction without broadcasting to evaluate gas/logs.',
    priceLamports: 10000000,
    category: 'Simulation',
    isLive: true,
    requestBodySchema: {
      transaction: 'string (Base64 encoded VersionedTransaction)',
      network: 'string (mainnet-beta | devnet)'
    },
    sampleRequestBody: {
      transaction: 'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA...',
      network: 'mainnet-beta'
    },
    sampleResponse: {
      network: 'mainnet-beta',
      success: true,
      error: null,
      logs: ['Program 1: Instruction 1 processed'],
      unitsConsumed: 1200,
      live_status: 'SUCCESS'
    },
    tags: ['simulation', 'tx']
  },
  {
    id: 'solana-decode-tx',
    name: 'Decode Transaction Events',
    suite: 'safety',
    method: 'GET',
    path: '/api/solana/decode-tx',
    summary: 'Translates raw transaction logs into human-readable summaries.',
    description: 'Takes a transaction signature and parses the raw program logs to provide a plain-English summary of what happened (e.g., "Swapped SOL for USDC on Jupiter"). Prevents LLMs from hallucinating tx results.',
    priceLamports: 5000000,
    category: 'Translator',
    isLive: true,
    queryParams: [
      { name: 'signature', type: 'string', required: true, description: 'The transaction signature' },
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query' }
    ],
    sampleResponse: {
      signature: '5K7e...xyz',
      network: 'mainnet-beta',
      summary: 'Swap executed via Jupiter Aggregator.',
      category: 'Swap',
      details: {
        slot: 28941000,
        fee: 5000,
        timestamp: 1725345600,
        status: 'SUCCESS'
      },
      raw_logs: ['Program 1: Instruction 1 processed', 'Program Log: Swap success...'],
      llm_context: 'This transaction was a Swap. Swap executed via Jupiter Aggregator. The transaction succeeded.',
      live_status: 'SUCCESS'
    },
    tags: ['translator', 'logs', 'parsing']
  },
  {
    id: 'solana-optimal-fee',
    name: 'Get Optimal Priority Fee',
    suite: 'safety',
    method: 'GET',
    path: '/api/solana/optimal-fee',
    summary: 'Calculates real-time priority fees to avoid tx stagnation.',
    description: 'Analyzes current network congestion and returns tiered fee recommendations (Low, Medium, High) with estimated landing times. Prevents transactions from getting stuck during high volatility.',
    priceLamports: 5000000,
    category: 'Pre-Flight',
    isLive: true,
    queryParams: [
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query' }
    ],
    sampleResponse: {
      network: 'mainnet-beta',
      current_congestion: 'MODERATE',
      tiers: {
        low: { lamports: 150, description: 'Economical...', estimated_time: '15-60 seconds' },
        medium: { lamports: 500, description: 'Balanced...', estimated_time: '5-15 seconds' },
        high: { lamports: 2000, description: 'Aggressive...', estimated_time: '1-5 seconds' }
      },
      raw_stats: { min: 50, max: 5000, average: 400, sample_size: 150 },
      llm_advice: 'Network congestion is currently MODERATE. For reliable execution, use at least 500 lamports per compute unit.',
      live_status: 'SUCCESS'
    },
    tags: ['preflight', 'fees', 'optimization']
  },
  {
    id: 'solana-token-profile',
    name: 'Get Token Security Profile',
    suite: 'intel',
    method: 'GET',
    path: '/api/solana/token-profile',
    summary: 'Fetches mint metadata, security flags, and top holders.',
    description: 'Provides critical token data including decimals (for correct math), freeze authority (honeypot check), and holder distribution to detect rug-pull risks.',
    priceLamports: 5000000,
    category: 'Simplifier',
    isLive: true,
    queryParams: [
      { name: 'mint', type: 'string', required: true, description: 'The token mint address' },
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query' }
    ],
    sampleResponse: {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      supply_raw: 1000000000000000,
      supply_formatted: '1,000,000,000',
      freezeAuthority: 'SomePubkey...',
      mintAuthority: null,
      security: {
        isHoneypotRisk: true,
        freezeAuthorityEnabled: true,
        mintAuthorityEnabled: false,
        riskLevel: 'HIGH',
        analysis: 'HIGH RISK: Freeze authority is active. The developer can freeze any wallet\'s tokens.'
      },
      topHolders: [
        { address: 'Addr1...', amount_raw: 500000000000000, amount_formatted: '500,000,000' },
        { address: 'Addr2...', amount_raw: 200000000000000, amount_formatted: '200,000,000' }
      ],
      network: 'mainnet-beta',
      live_status: 'SUCCESS'
    },

    tags: ['simplifier', 'security', 'honeypot'],
    presets: [
      {
        label: 'Test USDC',
        params: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }
      }
    ]
  },
  {
    id: 'solana-balance',
    name: 'Get SOL Balance',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/balance',
    summary: 'Fetches the real-time native SOL balance of any wallet on Solana mainnet or devnet.',
    description: 'Fetches the real-time native SOL balance of any wallet on Solana mainnet or devnet.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: true, description: 'The Solana wallet address (Base58)' },
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query (mainnet-beta or devnet)' }
    ],
    sampleResponse: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      network: 'mainnet-beta',
      balance_lamports: 1450000000,
      balance_sol: 1.45,
      live_status: 'SUCCESS'
    },
    tags: ['core', 'balance']
  },
  {
    id: 'solana-blockhash',
    name: 'Get Latest Blockhash',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/blockhash',
    summary: 'Retrieves the latest finalized blockhash.',
    description: 'Retrieves the latest finalized blockhash and valid block height directly from the Solana cluster.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query' }
    ],
    sampleResponse: {
      network: 'mainnet-beta',
      blockhash: '7f3kD9mQxL2vN8pRz4tYcB6sJ1aE5wXu...',
      lastValidBlockHeight: 28941000,
      timestamp: 1725345600000,
      live_status: 'SUCCESS'
    },
    tags: ['core', 'blockchain']
  },
  {
    id: 'solana-token-accounts',
    name: 'Get Token Accounts',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/token-accounts',
    summary: 'Scans all SPL Token accounts owned by a wallet.',
    description: 'Scans all SPL Token accounts and token balances owned by a wallet address.',
    priceLamports: 5000000,
    category: 'SPL Tokens',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: true, description: 'The Solana wallet address' },
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query' }
    ],
    sampleResponse: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      network: 'mainnet-beta',
      tokenCount: 1,
      tokens: [
        {
          accountPubkey: 'H6z...',
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          amount: 250.5,
          decimals: 6
        }
      ],
      live_status: 'SUCCESS'
    },
    tags: ['spl', 'tokens']
  },
  {
    id: 'solana-transactions',
    name: 'Get Transaction History',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/transactions',
    summary: 'Fetches recent confirmed transaction signatures.',
    description: 'Fetches recent confirmed transaction signatures, confirmation statuses, and slot timestamps.',
    priceLamports: 5000000,
    category: 'History',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: true, description: 'The Solana wallet address' },
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query' },
      { name: 'limit', type: 'number', required: false, default: '10', description: 'Number of signatures to return' }
    ],
    sampleResponse: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      network: 'mainnet-beta',
      count: 1,
      transactions: ['5K7e...'],
      live_status: 'SUCCESS'
    },
    tags: ['history', 'txs']
  },
  {
    id: 'solana-find-ata',
    name: 'Find Token ATA',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/find-ata',
    summary: 'Derives the Associated Token Account (ATA) for a wallet and mint.',
    description: 'Calculates the correct ATA address for a specific token mint and wallet. This removes the need for LLMs to manually derive addresses, preventing common transaction errors.',
    priceLamports: 5000000,
    category: 'Simplifier',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: true, description: 'The Solana wallet address' },
      { name: 'mint', type: 'string', required: true, description: 'The token mint address' },
      { name: 'network', type: 'string', required: false, default: 'mainnet-beta', description: 'Network to query' }
    ],
    sampleResponse: {
      owner: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ataAddress: 'H6z... (Derived ATA)',
      exists: true,
      network: 'mainnet-beta',
      live_status: 'SUCCESS'
    },
    tags: ['simplifier', 'ata', 'address'],
    presets: [
      {
        label: 'Test USDC',
        params: { wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }
      }
    ]
  },
  {
    id: 'credits-lookup',
    name: 'Check Wallet Credits',
    suite: 'free',
    method: 'GET',
    path: '/api/credits',
    summary: 'Shows paid credits and free calls remaining for a wallet address.',
    description: 'Read-only lookup. Returns paid credits, lifetime usage, and free calls left for the calling connection. Costs nothing and never returns an API key.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [
      { name: 'address', type: 'string', required: true, description: 'The Solana wallet address (Base58)' }
    ],
    sampleResponse: {
      address: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      paidCredits: 4545,
      totalCallsMade: 12,
      freeCallsRemaining: 110,
      freeCallsPerYear: 110,
      lamportsPerCall: 2200000,
      hasWallet: true
    },
    tags: ['credits', 'balance']
  },
  {
    id: 'claim-deposit-info',
    name: 'Deposit Info',
    suite: 'keys',
    method: 'GET',
    path: '/api/claim/deposit-info',
    summary: 'Where to send SOL, the price per call, and deposit options.',
    description: 'Returns the payout address, price per call in lamports and SOL, and preset deposit amounts. Credits are floor(deposit / price per call). Send from the wallet you will sign in with.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [],
    sampleResponse: {
      network: 'mainnet-beta',
      payout_address: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      price_per_call_lamports: 2200000,
      price_per_call_sol: 0.0022,
      free_calls_per_year: 110
    },
    tags: ['claim', 'deposit']
  },
  {
    id: 'claim-payment-status',
    name: 'Payment Status',
    suite: 'keys',
    method: 'GET',
    path: '/api/payments/status',
    summary: 'Checks whether a deposit from a wallet has been detected.',
    description: 'Shows whether the webhook has seen a deposit from this wallet, how many credits it earned, and whether a key has been issued yet.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: true, description: 'The wallet you deposited from (Base58)' }
    ],
    sampleResponse: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      deposit_detected: false,
      total_credits_ever: 0,
      total_sol_received_lamports: 0,
      has_key: false,
      first_paid_at: null
    },
    tags: ['claim', 'payment']
  },
  {
    id: 'auth-challenge',
    name: 'Sign-in Challenge',
    suite: 'keys',
    method: 'GET',
    path: '/api/auth/challenge',
    summary: 'Gets a one-time message for your wallet to sign.',
    description: 'Returns a message containing a nonce and timestamp. Sign it with your wallet, then submit the signature to /api/auth/login to receive a new personal API key. Challenges expire quickly and can only be used once.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [],
    sampleResponse: {
      message: 'Sign in to Solana Pulse\nNonce: 9f2c0e1b7a4d4c3e8b1a6d5f2e7c9a10\nTimestamp: 1790000000000'
    },
    tags: ['auth', 'claim']
  },
  {
    id: 'keys-verify',
    name: 'Verify My Key',
    suite: 'keys',
    method: 'GET',
    path: '/api/keys/verify',
    summary: 'Tests your API key and headers without spending a call.',
    description: 'Send your key as x-api-key or Authorization: Bearer. Reports whether it is valid, which header the server read, and your credits. Never returns the key itself. Claim a key above and it is attached automatically.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [],
    sampleResponse: {
      valid: true,
      headerUsed: 'x-api-key',
      address: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      paidCredits: 4545,
      totalCallsMade: 12
    },
    tags: ['keys', 'auth']
  },
  {
    id: 'keys-profile',
    name: 'My Profile',
    suite: 'keys',
    method: 'GET',
    path: '/api/profile',
    summary: 'Your wallet, credits and usage totals. Requires your key.',
    description: 'Returns the account tied to your API key: credits left, total calls made, total credits ever bought. Needs x-api-key or Authorization: Bearer.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [],
    sampleResponse: {
      address: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      display_name: null,
      email: null,
      paid_credits: 4545,
      total_calls_made: 12,
      total_paid_credits_ever: 4557
    },
    tags: ['keys', 'profile']
  },
  {
    id: 'keys-call-history',
    name: 'My Call History',
    suite: 'keys',
    method: 'GET',
    path: '/api/calls/history',
    summary: 'Your most recent calls and what each one cost. Requires your key.',
    description: 'Lists your latest calls with endpoint, method, credits charged, and whether the call used a free or paid credit. Needs x-api-key or Authorization: Bearer.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    queryParams: [],
    sampleResponse: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      calls: [
        { endpoint: '/api/solana/validate-and-simulate', method: 'POST', price_credits: 1, via: 'paid', created_at: '2026-10-05T17:00:00.000Z' }
      ]
    },
    tags: ['keys', 'history']
  }
];
