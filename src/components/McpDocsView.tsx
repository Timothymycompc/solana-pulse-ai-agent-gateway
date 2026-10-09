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
        "url": "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp/sse",
        "headers": {
          "x-api-key": "<YOUR_API_KEY>"
        }
      }
    }
  }, null, 2);

  const tools = [
    {
      name: "get_solana_balance",
      price: "FREE",
      description: "Free. Returns the native SOL balance for a wallet on mainnet-beta or devnet.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU", network: "mainnet-beta", balance_sol: 1.45 }
    },
    {
      name: "get_solana_blockhash",
      price: "FREE",
      description: "Free. Fetches the latest finalized blockhash directly from the Solana cluster.",
      params: { network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { network: "mainnet-beta", blockhash: "4uQeVj5tqViQh7yWWGStvfEG1Zmhx6uasJtWCJziofM", timestamp: "2026-10-08T12:00:00.000Z" }
    },
    {
      name: "get_token_accounts",
      price: "FREE",
      description: "Lists every SPL token account, mint address, balance, and decimals owned by a wallet.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8...", tokenCount: 2, tokens: [{ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 250.5, decimals: 6 }] }
    },
    {
      name: "get_recent_transactions",
      price: "FREE",
      description: "Lists recent transaction signatures for a wallet, newest first.",
      params: { wallet: "string (Base58 public key)", limit: "integer (optional, default: 10, range: 1-1000)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8...", count: 1, signatures: [{ signature: "5K7e...", slot: 28941000, err: null }] }
    },
    {
      name: "simulate_solana_transaction",
      price: "0.0022 SOL (1 credit)",
      description: "Simulates a serialized base64 transaction against live chain state without broadcasting it.",
      params: { transaction: "string (Base64 serialized transaction)", network: "mainnet-beta | devnet" },
      exampleOutput: { network: "mainnet-beta", success: true, unitsConsumed: 450, error: null }
    },
    {
      name: "find_ata",
      price: "FREE",
      description: "Derives the associated token account for a wallet and mint, and checks whether it exists on-chain.",
      params: { wallet: "string (Base58 public key)", mint: "string (Base58 token mint)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { owner: "Brpc8...", mint: "EPjFW...", ataAddress: "9z...", exists: true, network: "mainnet-beta" }
    },
    {
      name: "token_profile",
      price: "0.0022 SOL (1 credit)",
      description: "Returns token mint details, freeze and mint authority status, and up to 10 largest holders. The freeze-authority risk flag is a heuristic, not honeypot detection. Cached for 60 seconds.",
      params: { mint: "string (Base58 token mint)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { mint: "EPjFW...", decimals: 6, security: { isHoneypotRisk: false, riskLevel: "LOW" }, topHolders: [] }
    },
    {
      name: "optimal_fee",
      price: "0.0022 SOL (1 credit)",
      description: "Returns live low, medium, and high priority-fee recommendations based on recent network fees.",
      params: { network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { network: "mainnet-beta", current_congestion: "LOW", tiers: { low: { lamports: 0 }, medium: { lamports: 0 }, high: { lamports: 0 } } }
    },
    {
      name: "decode_tx",
      price: "0.0022 SOL (1 credit)",
      description: "Explains a confirmed transaction with category, status, fee, account SOL balance changes, and logs.",
      params: { signature: "string (Base58 transaction signature)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { signature: "5K7e...", category: "Transfer", details: { status: "SUCCESS" }, balance_changes: [] }
    },
    {
      name: "validate_transaction",
      price: "0.0022 SOL (1 credit)",
      description: "Checks a transaction's fee payer balance and simulates it, returning a SAFE or UNSAFE verdict and fix hints. Does not broadcast.",
      params: { transaction: "string (Base64 serialized VersionedTransaction)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { verdict: "SAFE", safe: true, issues: [], simulation: { success: true, unitsConsumed: 450 } }
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
              Give Claude, Cursor, ChatGPT, and autonomous Python/TypeScript agents real-time access to the Solana blockchain with automated microtransaction billing.
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
              <p className="text-xs text-slate-400">Add this snippet to your <code className="text-indigo-300">claude_desktop_config.json</code> to enable all 10 tools instantly.</p>
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
            <div key={idx} className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-indigo-400">{t.name}</span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    {t.price}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 mb-4">{t.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Parameters (Zod / JSON Schema)</div>
                  <pre className="text-indigo-300 whitespace-pre-wrap">{JSON.stringify(t.params, null, 2)}</pre>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Sample Live Output</div>
                  <pre className="text-emerald-400 whitespace-pre-wrap">{JSON.stringify(t.exampleOutput, null, 2)}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
