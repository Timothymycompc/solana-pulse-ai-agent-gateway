import React, { useState } from 'react';
import { Bot, Copy, Check, Terminal, Zap, Shield, Sparkles } from 'lucide-react';

export const McpDocsView: React.FC = () => {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const claudeConfig = JSON.stringify({
    "mcpServers": {
      "solana-pulse": {
        "url": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp/sse"
      }
    }
  }, null, 2);

  const tools = [
    {
      name: "get_solana_balance",
      price: "1 credit after 27-call trial",
      description: "Returns the native SOL balance for a wallet on mainnet-beta or devnet.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU", network: "mainnet-beta", balance_sol: 1.45 }
    },
    {
      name: "get_solana_blockhash",
      price: "1 credit after 27-call trial",
      description: "Fetches the latest finalized blockhash directly from the Solana cluster.",
      params: { network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { network: "mainnet-beta", blockhash: "4uQeVj5tqViQh7yWWGStvfEG1Zmhx6uasJtWCJziofM", timestamp: "2026-10-08T12:00:00.000Z" }
    },
    {
      name: "get_token_accounts",
      price: "1 credit after 27-call trial",
      description: "Lists every SPL token account, mint address, balance, and decimals owned by a wallet.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8...", tokenCount: 2, tokens: [{ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 250.5, decimals: 6 }] }
    },
    {
      name: "get_recent_transactions",
      price: "1 credit after 27-call trial",
      description: "Lists recent transaction signatures for a wallet, newest first.",
      params: { wallet: "string (Base58 public key)", limit: "integer (optional, default: 10, range: 1-1000)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8...", count: 1, signatures: [{ signature: "5K7e...", slot: 28941000, err: null }] }
    },
    {
      name: "simulate_solana_transaction",
      price: "1 credit after 27-call trial",
      description: "Simulates a serialized base64 transaction against live chain state without broadcasting it.",
      params: { transaction: "string (Base64 serialized transaction)", network: "mainnet-beta | devnet" },
      exampleOutput: { network: "mainnet-beta", success: true, unitsConsumed: 450, error: null }
    },
    {
      name: "find_ata",
      price: "1 credit after 27-call trial",
      description: "Derives the associated token account for a wallet and mint, and checks whether it exists on-chain.",
      params: { wallet: "string (Base58 public key)", mint: "string (Base58 token mint)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { owner: "Brpc8...", mint: "EPjFW...", ataAddress: "9z...", exists: true, network: "mainnet-beta" }
    },
    {
      name: "token_profile",
      price: "1 credit after 27-call trial",
      description: "Returns token mint details, freeze and mint authority status, and up to 10 largest holders. The freeze-authority risk flag is a heuristic, not honeypot detection. Cached for 60 seconds.",
      params: { mint: "string (Base58 token mint)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { mint: "EPjFW...", decimals: 6, security: { isHoneypotRisk: false, riskLevel: "LOW" }, topHolders: [] }
    },
    {
      name: "optimal_fee",
      price: "1 credit after 27-call trial",
      description: "Returns live low, medium, and high priority-fee recommendations based on recent network fees.",
      params: { network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { network: "mainnet-beta", current_congestion: "LOW", tiers: { low: { lamports: 0 }, medium: { lamports: 0 }, high: { lamports: 0 } } }
    },
    {
      name: "decode_tx",
      price: "1 credit after 27-call trial",
      description: "Explains a confirmed transaction with category, status, fee, account SOL balance changes, and logs.",
      params: { signature: "string (Base58 transaction signature)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { signature: "5K7e...", category: "Transfer", details: { status: "SUCCESS" }, balance_changes: [] }
    },
    {
      name: "validate_transaction",
      price: "1 credit after 27-call trial",
      description: "Checks a transaction's fee payer balance and simulates it, returning a SAFE or UNSAFE verdict and fix hints. Does not broadcast.",
      params: { transaction: "string (Base64 serialized VersionedTransaction)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { verdict: "SAFE", safe: true, issues: [], simulation: { success: true, unitsConsumed: 450 } }
    },
    {
      name: "get_wallet_snapshot",
      price: "1 credit after 27-call trial",
      description: "Combines SOL balance, SPL and Token-2022 holdings, and five recent signatures into one wallet snapshot. Not an investment recommendation.",
      params: { wallet: "Base58 wallet address", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "<address>", sol: { balance: 0 }, tokenAccountCount: 0, tokens: [], recentActivity: { checked: 0, latestSignature: null } }
    },
    {
      name: "summarize_wallet_activity",
      price: "1 credit after 27-call trial",
      description: "Counts successes and failures in a sample of recent wallet signatures and returns the newest activity. Does not decode instructions.",
      params: { wallet: "Base58 wallet address", limit: "integer 1–100 (optional, default 20)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { examined: 0, successful: 0, failed: 0, latest: null, note: "Only the requested recent sample is counted." }
    },
    {
      name: "resolve_token_symbol",
      price: "1 credit after 27-call trial",
      description: "Finds Solana token pair candidates for a ticker or name, ranked by reported liquidity, to help agents select a mint. Ticker matches can be ambiguous.",
      params: { query: "ticker, token name, or mint text (1–80 characters)" },
      exampleOutput: { query: "BONK", candidates: [{ mint: "<mint>", symbol: "BONK", liquidityUsd: 0, pairUrl: "<pair URL>" }], source: "DexScreener" }
    },
    {
      name: "get_token_market_snapshot",
      price: "1 credit after 27-call trial",
      description: "Returns the most liquid matching DEX pair, token price, liquidity, volume, and pair link. Third-party market data; not an execution quote.",
      params: { mint: "Base58 token mint" },
      exampleOutput: { mint: "<mint>", found: true, priceUsd: null, liquidityUsd: 0, volume24hUsd: 0, source: "DexScreener" }
    },
    {
      name: "analyze_token_concentration",
      price: "1 credit after 27-call trial",
      description: "Calculates the combined supply share in the ten largest token accounts and reports mint authorities. Token accounts are not unique beneficial owners.",
      params: { mint: "Base58 SPL token mint", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { mint: "<mint>", top10TokenAccountSharePct: 0, topTokenAccounts: [], mintAuthority: null, freezeAuthority: null }
    },
    {
      name: "compare_tokens",
      price: "1 credit after 27-call trial",
      description: "Compares two token mints side by side across supply, decimals, mint and freeze authorities, and top-account concentration. Does not rank investments.",
      params: { mintA: "First Base58 SPL token mint", mintB: "Second Base58 SPL token mint", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { tokens: [{ mint: "<mint A>", decimals: 6 }, { mint: "<mint B>", decimals: 9 }], note: "Concentration is by token account, not beneficial owner." }
    },
    {
      name: "inspect_address",
      price: "1 credit after 27-call trial",
      description: "Classifies common account types from live owner, executable, parsed token, and lamport fields; custom accounts can remain inconclusive.",
      params: { address: "Base58 wallet, program, mint, or token account", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { exists: true, classification: "system_owned_wallet_or_account", ownerProgram: "11111111111111111111111111111111", token: null }
    },
    {
      name: "explain_transaction_effects",
      price: "1 credit after 27-call trial",
      description: "Joins pre/post RPC balances into SOL and token changes, fee, status, and common program labels, avoiding manual transaction metadata joins.",
      params: { signature: "Base58 confirmed transaction signature", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { succeeded: true, feeLamports: 5000, solChanges: [], tokenChanges: [], programs: [] }
    },
    {
      name: "analyze_wallet_portfolio",
      price: "1 credit after 27-call trial",
      description: "Joins live SOL and token balances with DEX prices for up to ten mints, reporting priced and unpriced assets separately and marking partial totals.",
      params: { wallet: "Base58 wallet address", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { sol: { balance: 0, priceUsd: null }, tokens: [], estimatedPricedValueUsd: 0, partial: true, marketSource: "DexScreener" }
    },
    {
      name: "estimate_transaction_cost",
      price: "1 credit after 27-call trial",
      description: "Reads signer count and compute-budget instructions, estimates base and priority fees when possible, and simulates without signing or broadcasting.",
      params: { transaction: "Base64 serialized VersionedTransaction", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { baseFeeLamports: 5000, computeUnitLimit: null, priorityFeeLamports: null, unitsConsumed: 0, simulationSucceeded: false }
    }
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 lg:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Model Context Protocol (MCP)</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Connect Autonomous LLMs to Solana
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Give Claude, Cursor, and agents typed Solana data tools. Try 27 calls as a visitor without a wallet; add an API key after the trial to keep calling.
            </p>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl min-w-[280px]">
            <div className="text-xs text-slate-400 font-medium mb-1">Live MCP SSE Endpoint:</div>
            <div className="text-xs text-indigo-400 font-mono break-all select-all">
              https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp/sse
            </div>
          </div>
        </div>
      </div>

      {/* Claude Desktop & Cursor Integration */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
      <h3 className="text-base font-bold text-white">Claude Desktop & Cursor Configuration</h3>
              <p className="text-xs text-slate-400">Add this snippet to your <code className="text-indigo-300">claude_desktop_config.json</code> to enable all 20 tools and start the 27-call visitor trial. Configure an API key after the trial.</p>
            </div>
          </div>
          <button
            onClick={() => copyToClipboard(claudeConfig, 'claude')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
          >
            {copied === 'claude' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied === 'claude' ? 'Copied!' : 'Copy Config'}</span>
          </button>
        </div>
        <pre className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 text-xs font-mono text-slate-300 overflow-x-auto">
          {claudeConfig}
        </pre>
      </div>

      {/* Structured Tool Schemas */}
      <div>
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-indigo-400" />
          <span>Available MCP Tools & Schemas</span>
        </h3>

        <div className="space-y-4">
          {tools.map((t, idx) => (
            <details key={idx} className="group rounded-xl border border-slate-800 bg-slate-900/60 transition-colors hover:border-slate-700">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-300">{t.name}</span>
                    <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-slate-300">{t.price}</span>
                  </div>
                  <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-400">{t.description}</p>
                </div>
                <span className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 group-open:hidden">Details</span>
                <span className="hidden shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 group-open:inline">Close</span>
              </summary>
              <div className="grid grid-cols-1 gap-4 border-t border-slate-800 p-4 text-xs font-mono lg:grid-cols-2 sm:p-5">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Parameters (Zod / JSON Schema)</div>
                  <pre className="text-indigo-300 whitespace-pre-wrap">{JSON.stringify(t.params, null, 2)}</pre>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Example Output Shape · Live values vary</div>
                  <pre className="text-emerald-400 whitespace-pre-wrap">{JSON.stringify(t.exampleOutput, null, 2)}</pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
};
