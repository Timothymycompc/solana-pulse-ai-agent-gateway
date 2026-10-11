import { ApiEndpoint } from '../types';

const mcpToolEndpoint = (
  name: string,
  summary: string,
  description: string,
  args: Record<string, unknown>,
  tags: string[],
): ApiEndpoint => ({
  id: `mcp-${name}`,
  name,
  suite: 'intel',
  method: 'POST',
  path: '/mcp',
  summary,
  description: `${description} This is an MCP tools/call request sent to /mcp. Edit the JSON arguments before running.`,
  category: 'MCP Tool',
  isLive: true,
  readOnly: true,
  requestBodySchema: { jsonrpc: '2.0', id: 'number', method: 'tools/call', params: { name, arguments: args } },
  sampleRequestBody: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  sampleResponse: { result: { content: [{ type: 'text', text: 'Live response returned by the MCP tool.' }] } },
  tags: ['mcp', 'intelligence', ...tags],
});

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'solana-validate-and-simulate',
    name: 'Pre-Flight Safety Check',
    suite: 'safety',
    method: 'POST',
    path: '/api/solana/validate-and-simulate',
    summary: 'Checks a transaction for common mistakes before you send it and returns a clear Safe or Unsafe verdict with a fix hint.',
    description: 'Runs your transaction against the live Solana network without sending it or spending anything, flags common mistakes, and returns a Safe or Unsafe verdict with a hint on how to fix it. Built for agents that should never send a transaction blind.',
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
    name: 'Transaction Preview',
    suite: 'safety',
    method: 'POST',
    path: '/api/solana/simulate',
    summary: 'Shows what a transaction would do on the live network, without sending it.',
    description: 'A read-only test run of your transaction against the current state of the live chain. Nothing is sent and nothing is spent. Returns the network own result, including logs, compute used, and the error if it would fail.',
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
    name: 'Explain Transaction',
    suite: 'safety',
    method: 'GET',
    path: '/api/solana/decode-tx',
    summary: 'Turns a transaction signature into plain English: what happened and who paid what.',
    description: 'Fetches a real transaction from the chain and translates its logs and instructions into a readable summary. Give a signature, or just a wallet to explain its latest transaction, or add a time to explain the one closest to then.',
    category: 'Translator',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: false, default: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', description: 'Wallet whose latest transaction will be explained if no signature is supplied' },
      { name: 'at', type: 'string', required: false, description: 'ISO time or unix seconds. Picks the transaction closest to then.' },
      { name: 'signature', type: 'string', required: false, default: '3wAtt2GXZN5C4CHfmuT18j5eWhy95pzgqb2PTC4kagd7rSFaPqxoMUrF4LN9uyMBGmpTBX9C5AX8Em4njGt5SKyA', description: 'A confirmed transaction signature' },
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
    name: 'Priority Fee Advisor',
    suite: 'safety',
    method: 'GET',
    path: '/api/solana/optimal-fee',
    summary: 'Recommends a priority fee tier based on current network conditions.',
    description: 'Reads recent fees paid on the live network and recommends low, medium and high priority fee levels so your transaction lands without overpaying.',
    category: 'Pre-Flight',
    isLive: true,
    queryParams: [
      { name: 'network', type: 'string', required: false, description: 'Network to query' }
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
    name: 'Token Profile',
    suite: 'intel',
    method: 'GET',
    path: '/api/solana/token-profile',
    summary: 'On-chain mint details, supply, authorities, and top holders for a token.',
    description: 'Reports mint decimals, supply, mint and freeze authorities, and top holders. The freeze-authority risk field is a heuristic; this endpoint does not detect honeypots or guarantee trading safety.',
    category: 'Simplifier',
    isLive: true,
    queryParams: [
      { name: 'symbol', type: 'string', required: false, description: 'Ticker such as BONK. The mint is looked up for you.' },
      { name: 'mint', type: 'string', required: false, default: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', description: 'A valid token mint address' },
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

    tags: ['simplifier', 'security', 'freeze-authority'],
    presets: [
      {
        label: 'Test USDC',
        params: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }
      }
    ]
  },
  {
    id: 'solana-balance',
    name: 'SOL Balance',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/balance',
    summary: 'Live SOL balance of any wallet.',
    description: 'Returns the current SOL balance of a wallet in lamports and SOL, straight from the network.',
    category: 'Core Solana',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: false, default: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', description: 'A valid Solana wallet address (Base58)' },
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
    name: 'Latest Blockhash',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/blockhash',
    summary: 'The newest finalized blockhash and how long it stays valid.',
    description: 'Returns the latest finalized blockhash and its last valid block height, needed to build any transaction.',
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
    name: 'Token Holdings',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/token-accounts',
    summary: 'Every token a wallet holds, with amounts.',
    description: 'Lists token accounts owned by a wallet with mint, balance, and decimals, read live from the chain.',
    category: 'SPL Tokens',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: false, default: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', description: 'A valid Solana wallet address (Base58)' },
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
    name: 'Recent Activity',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/transactions',
    summary: 'A wallet most recent transactions, newest first.',
    description: 'Returns recent transaction signatures for a wallet, newest first.',
    category: 'History',
    isLive: true,
    queryParams: [
      { name: 'wallet', type: 'string', required: false, default: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', description: 'A valid Solana wallet address' },
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
    name: 'Find Token Account Address',
    suite: 'free',
    method: 'GET',
    path: '/api/solana/find-ata',
    summary: 'Works out the token account address for a wallet and a token, and whether it exists yet.',
    description: 'Derives the associated token account for a wallet and mint and checks whether it exists on chain.',
    category: 'Simplifier',
    isLive: true,
    queryParams: [
      { name: 'symbol', type: 'string', required: false, description: 'Token symbol; pass the mint to avoid ticker ambiguity' },
      { name: 'wallet', type: 'string', required: false, default: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', description: 'A valid Solana wallet address' },
      { name: 'mint', type: 'string', required: false, default: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', description: 'USDC mint address on mainnet' },
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
    id: 'trial-status',
    name: 'Check Free Calls and Prices',
    suite: 'keys',
    method: 'GET',
    path: '/api/trial/status',
    summary: 'Shows how many free calls each paid tool has used for this caller, and every tool price.',
    description: 'Shows free calls used per paid tool for this caller (counted by IP address) and the USDC price of every tool. Basic reads are free; other tools have 3 free calls, then a per-call price paid with x402. Does not consume a call.',
    category: 'Account',
    isLive: true,
    queryParams: [],
    sampleResponse: { scope: 'caller_ip', freeCallsPerTool: 3, freeCallsUsedByTool: { token_profile: 1 }, prices: { get_solana_balance: null, token_profile: '$0.005' }, network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', asset: 'USDC' },
    tags: ['trial', 'pricing']
  },







  mcpToolEndpoint('get_wallet_snapshot', 'Wallet snapshot', 'Combines SOL balance, token accounts, and recent activity in one response.', { wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', network: 'mainnet-beta' }, ['wallet', 'portfolio']),
  mcpToolEndpoint('summarize_wallet_activity', 'Wallet activity summary', 'Counts recent successful and failed transactions and returns recent signatures.', { wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', limit: 20, network: 'mainnet-beta' }, ['wallet', 'activity']),
  mcpToolEndpoint('resolve_token_symbol', 'Resolve token symbol', 'Searches token pairs by ticker or name and ranks matching Solana mints by reported liquidity.', { query: 'BONK' }, ['token', 'search']),
  mcpToolEndpoint('get_token_market_snapshot', 'Token market snapshot', 'Returns the most liquid matching DEX pair, price, liquidity, 24-hour volume, and pair link.', { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }, ['token', 'market']),
  mcpToolEndpoint('analyze_token_concentration', 'Token concentration', 'Measures the top ten token accounts’ combined share of supply and reports mint authorities.', { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', network: 'mainnet-beta' }, ['token', 'holders']),
  mcpToolEndpoint('compare_tokens', 'Compare tokens', 'Compares two mints by supply, authorities, and top-account concentration.', { mintA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', mintB: 'So11111111111111111111111111111111111111112', network: 'mainnet-beta' }, ['token', 'compare']),
  mcpToolEndpoint('inspect_address', 'Inspect Solana address', 'Classifies an address using account owner, executable status, parsed token data, and balance.', { address: '11111111111111111111111111111111', network: 'mainnet-beta' }, ['address', 'account']),
  mcpToolEndpoint('explain_transaction_effects', 'Explain transaction effects', 'Summarizes a confirmed transaction’s status, fees, SOL and token balance changes, and programs touched.', { signature: '<paste a confirmed 88-character transaction signature>', network: 'mainnet-beta' }, ['transaction', 'explain']),
  mcpToolEndpoint('analyze_wallet_portfolio', 'Estimate wallet portfolio value', 'Combines wallet balances with available DEX prices and marks missing prices in the estimate.', { wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU', network: 'mainnet-beta' }, ['wallet', 'portfolio', 'market']),
  mcpToolEndpoint('estimate_transaction_cost', 'Estimate transaction cost', 'Estimates base and configured priority fees, then simulates a serialized transaction without broadcasting.', { transaction: '<paste base64 serialized VersionedTransaction>', network: 'devnet' }, ['transaction', 'fees', 'simulation']),
];
