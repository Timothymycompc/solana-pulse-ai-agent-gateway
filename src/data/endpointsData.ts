export interface ApiEndpoint {
  id: string;
  name: string;
  suite: 'Solana Live' | 'AI & MCP';
  method: 'GET' | 'POST';
  path: string;
  description: string;
  priceLamports: number;
  category: string;
  isLive: boolean;
  requestSchema?: Record<string, any>;
  defaultParams?: Record<string, any>;
}

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: 'solana-balance',
    name: 'Get SOL Balance',
    suite: 'Solana Live',
    method: 'GET',
    path: '/api/solana/balance',
    description: 'Fetches the real-time native SOL balance of any wallet on Solana mainnet or devnet.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    defaultParams: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      network: 'mainnet-beta'
    }
  },
  {
    id: 'solana-blockhash',
    name: 'Get Latest Blockhash',
    suite: 'Solana Live',
    method: 'GET',
    path: '/api/solana/blockhash',
    description: 'Retrieves the latest finalized blockhash and valid block height directly from the Solana cluster.',
    priceLamports: 0,
    category: 'Core Solana',
    isLive: true,
    defaultParams: {
      network: 'mainnet-beta'
    }
  },
  {
    id: 'solana-token-accounts',
    name: 'Get Token Accounts',
    suite: 'Solana Live',
    method: 'GET',
    path: '/api/solana/token-accounts',
    description: 'Scans all SPL Token accounts and token balances owned by a wallet address.',
    priceLamports: 5000,
    category: 'SPL Tokens',
    isLive: true,
    defaultParams: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      network: 'mainnet-beta'
    }
  },
  {
    id: 'solana-transactions',
    name: 'Get Transaction History',
    suite: 'Solana Live',
    method: 'GET',
    path: '/api/solana/transactions',
    description: 'Fetches recent confirmed transaction signatures, confirmation statuses, and slot timestamps.',
    priceLamports: 5000,
    category: 'History',
    isLive: true,
    defaultParams: {
      wallet: 'Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU',
      network: 'mainnet-beta',
      limit: 10
    }
  },
  {
    id: 'solana-simulate',
    name: 'Simulate Transaction',
    suite: 'Solana Live',
    method: 'POST',
    path: '/api/solana/simulate',
    description: 'Simulates a base64 encoded serialized transaction without broadcasting to evaluate gas/logs.',
    priceLamports: 10000,
    category: 'Simulation',
    isLive: true,
    defaultParams: {
      network: 'mainnet-beta',
      transaction: ''
    }
  }
,
  {
    id: 'rent-calculator',
    name: 'Rent Calculator',
    suite: 'Solana Live',
    path: '/api/solana/rent',
    method: 'POST',
    description: 'Calculate the minimum balance needed for rent exemption on Solana.',
    queryParams: [],
    bodyTemplate: JSON.stringify({ bytes: 165 }, null, 2),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    id: 'token-metadata',
    name: 'Token Metadata',
    suite: 'Solana Live',
    path: '/api/solana/metadata',
    method: 'GET',
    description: 'Retrieve metadata details for any SPL token mint address.',
    queryParams: [
      { key: 'mint', value: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', required: true, description: 'Token Mint Address' }
    ]
  },
  {
    id: 'block-scanner',
    name: 'Block Scanner',
    suite: 'Solana Live',
    path: '/api/solana/block',
    method: 'GET',
    description: 'Retrieve detailed information for a specific block slot.',
    queryParams: [
      { key: 'slot', value: '250000000', required: true, description: 'Block Slot Number' }
    ]
  },
  {
    id: 'tx-decoder',
    name: 'Transaction Decoder',
    suite: 'Solana Live',
    path: '/api/solana/decode',
    method: 'POST',
    description: 'Decode serialized base58/base64 transaction payloads.',
    queryParams: [],
    bodyTemplate: JSON.stringify({ payload: '...' }, null, 2),
    headers: { 'Content-Type': 'application/json' }
  },
  {
    id: 'gas-estimator',
    name: 'Gas Estimator',
    suite: 'Solana Live',
    path: '/api/solana/fees',
    method: 'GET',
    description: 'Estimate recent prioritization fees for transactions.',
    queryParams: []
  },
  {
    id: 'wallet-profiler',
    name: 'Wallet Profiler',
    suite: 'Solana Live',
    path: '/api/solana/profile',
    method: 'GET',
    description: 'Generate high-level profile analytics for a Solana address.',
    queryParams: [
      { key: 'address', value: 'DALhQZi19KhqerUWkwtmMAxCzi9Avur85kE57Cq8e4W', required: true, description: 'Solana Wallet Address' }
    ]
  }
];