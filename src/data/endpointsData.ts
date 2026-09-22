import { ApiEndpoint } from '../types';

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'solana-balance',
    name: 'Get SOL Balance',
    suite: 'solana',
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
    suite: 'solana',
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
    suite: 'solana',
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
    suite: 'solana',
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
    id: 'solana-simulate',
    name: 'Simulate Transaction',
    suite: 'solana',
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
    id: 'solana-validate-and-simulate',
    name: 'Validate & Simulate Transaction',
    suite: 'solana',
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
    id: 'solana-find-ata',
    name: 'Find Token ATA',
    suite: 'solana',
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
    id: 'solana-token-profile',
    name: 'Get Token Security Profile',
    suite: 'solana',
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
    id: 'solana-optimal-fee',
    name: 'Get Optimal Priority Fee',
    suite: 'solana',
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
    id: 'solana-decode-tx',
    name: 'Decode Transaction Events',
    suite: 'solana',
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
  }
];
