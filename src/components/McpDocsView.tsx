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
        "url": "https://solana-pulse-gateway-x23jefx3zq-uc.a.run.app/mcp/sse",
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
      description: "Returns the native SOL balance for any Solana wallet address across mainnet-beta or devnet.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU", network: "mainnet-beta", balance_sol: 1.45 }
    },
    {
      name: "get_solana_blockhash",
      price: "FREE",
      description: "Fetches the latest finalized blockhash and valid block height directly from the Solana cluster.",
      params: { network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { network: "mainnet-beta", blockhash: "4uQeVj5tqViQh7yWWGStvfEG1Zmhx6uasJtWCJziofM", lastValidBlockHeight: 289410294 }
    },
    {
      name: "get_token_accounts",
      price: "5,000 lamports (~$0.00075)",
      description: "Scans all SPL Token accounts, token mint addresses, and balances owned by a wallet address.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8...", tokenCount: 2, tokens: [{ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 250.5, decimals: 6 }] }
    },
    {
      name: "get_recent_transactions",
      price: "5,000 lamports (~$0.00075)",
      description: "Fetches recent confirmed transaction signatures, confirmation statuses, and timestamps for an address.",
      params: { wallet: "string (Base58 public key)", limit: "number (optional, default: 10)", network: "mainnet-beta | devnet" },
      exampleOutput: { wallet: "Brpc8...", count: 1, signatures: [{ signature: "5K7e...", slot: 28941000, err: null }] }
    },
    {
      name: "simulate_solana_transaction",
      price: "10,000 lamports (~$0.0015)",
      description: "Simulates a serialized base64 transaction on Solana to evaluate gas units and verify execution success before broadcasting.",
      params: { transaction: "string (Base64 serialized transaction)", network: "mainnet-beta | devnet" },
      exampleOutput: { network: "mainnet-beta", success: true, unitsConsumed: 450, error: null }
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
              <span>Standard Model Context Protocol (MCP 1.0)</span>
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
              https://solana-pulse-gateway-x23jefx3zq-uc.a.run.app/mcp/sse
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
              <p className="text-xs text-slate-400">Add this snippet to your <code className="text-indigo-300">claude_desktop_config.json</code> to enable all 5 tools instantly.</p>
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
