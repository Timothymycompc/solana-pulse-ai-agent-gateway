import React, { useState } from 'react';
import { Bot, Copy, Check, Terminal, Sparkles, PiggyBank, ShieldCheck } from 'lucide-react';

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
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp"]
      }
    }
  }, null, 2);

  const tools = [
    {
      name: "get_solana_balance",
      price: "1 credit after 3 free calls",
      description: "Returns the native SOL balance for a wallet on mainnet-beta or devnet.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8HoPo1d3Uiyo7kbERnjMqwLJJmbWxtwxHxzar6DU", network: "mainnet-beta", balance_sol: 1.45 },
      helps: { kind: "accuracy", text: "Before sending 2 SOL, the agent checks and sees 1.45 SOL, so it stops. Without the check, a model may reuse a balance from earlier in the chat and build a transfer that fails and still pays its fee." }
    },
    {
      name: "get_solana_blockhash",
      price: "1 credit after 3 free calls",
      description: "Fetches the latest finalized blockhash directly from the Solana cluster.",
      params: { network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { network: "mainnet-beta", blockhash: "4uQeVj5tqViQh7yWWGStvfEG1Zmhx6uasJtWCJziofM", timestamp: "2026-10-08T12:00:00.000Z" },
      helps: { kind: "accuracy", text: "A blockhash expires after about 150 blocks (roughly a minute), so a model cannot know a current one. An invented or stale blockhash gets the transaction rejected; fetch it right before signing." }
    },
    {
      name: "get_token_accounts",
      price: "1 credit after 3 free calls",
      description: "Lists every SPL token account, mint address, balance, and decimals owned by a wallet.",
      params: { wallet: "string (Base58 public key)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8...", tokenCount: 2, tokens: [{ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 250.5, decimals: 6 }] },
      helps: { kind: "accuracy", text: "Asked what a wallet holds, a model may list popular tokens it expects to see. This returns the real list with exact amounts and decimals, so it cannot invent a USDC balance that is not there." }
    },
    {
      name: "get_recent_transactions",
      price: "1 credit after 3 free calls",
      description: "Lists recent transaction signatures for a wallet, newest first.",
      params: { wallet: "string (Base58 public key)", limit: "integer (optional, default: 10, range: 1-1000)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "Brpc8...", count: 1, signatures: [{ signature: "5K7e...", slot: 28941000, err: null }] },
      helps: { kind: "accuracy", text: "Models can produce realistic-looking but fake transaction signatures. This returns real ones, so the next step (like decode_tx) looks up a transaction that actually exists." }
    },
    {
      name: "simulate_solana_transaction",
      price: "1 credit after 3 free calls",
      description: "Simulates a serialized base64 transaction against live chain state without broadcasting it.",
      params: { transaction: "string (Base64 serialized transaction)", network: "mainnet-beta | devnet" },
      exampleOutput: { network: "mainnet-beta", success: true, unitsConsumed: 450, error: null },
      helps: { kind: "money", text: "Failed Solana transactions still pay their fee. A dry run catches errors such as insufficient funds or a bad instruction before any network fee is spent." }
    },
    {
      name: "find_ata",
      price: "1 credit after 3 free calls",
      description: "Derives the associated token account for a wallet and mint, and checks whether it exists on-chain.",
      params: { wallet: "string (Base58 public key)", mint: "string (Base58 token mint)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { owner: "Brpc8...", mint: "EPjFW...", ataAddress: "9z...", exists: true, network: "mainnet-beta" },
      helps: { kind: "money", text: "Token account addresses are derived, and a model cannot compute one in its head. Sending to a made-up address can lose the tokens. It also says whether the account exists, so you only pay the roughly 0.002 SOL account deposit when one is needed." }
    },
    {
      name: "token_profile",
      price: "1 credit after 3 free calls",
      description: "Returns token mint details, freeze and mint authority status, and up to 10 largest holders. The freeze-authority risk flag is a heuristic, not honeypot detection.",
      params: { mint: "string (Base58 token mint)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { mint: "EPjFW...", decimals: 6, security: { isHoneypotRisk: false, riskLevel: "LOW" }, topHolders: [] },
      helps: { kind: "money", text: "Reports the real decimals. Getting them wrong is a 1,000x mistake: 1 USDC is 1,000,000 base units (6 decimals) while 1 SOL is 1,000,000,000 lamports (9). It also shows whether someone can still freeze the token or mint more." }
    },
    {
      name: "optimal_fee",
      price: "1 credit after 3 free calls",
      description: "Returns live low, medium, and high priority-fee recommendations based on recent network fees.",
      params: { network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { network: "mainnet-beta", current_congestion: "LOW", tiers: { low: { lamports: 0 }, medium: { lamports: 0 }, high: { lamports: 0 } } },
      helps: { kind: "money", text: "Instead of always paying a high fixed priority fee to be safe, pay the tier current congestion calls for. When the network is quiet, the low tier can be close to zero." }
    },
    {
      name: "decode_tx",
      price: "1 credit after 3 free calls",
      description: "Explains a confirmed transaction with category, status, fee, account SOL balance changes, and logs.",
      params: { signature: "string (Base58 transaction signature)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { signature: "5K7e...", category: "Transfer", details: { status: "SUCCESS" }, balance_changes: [] },
      helps: { kind: "accuracy", text: "Raw transaction logs are long and easy to misread, and a model may report a failed swap as successful. This returns the status, fee and balance changes straight from the chain." }
    },
    {
      name: "validate_transaction",
      price: "1 credit after 3 free calls",
      description: "Checks a transaction's fee payer balance and simulates it, returning a SAFE or UNSAFE verdict and fix hints. Does not broadcast.",
      params: { transaction: "string (Base64 serialized VersionedTransaction)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { verdict: "SAFE", safe: true, issues: [], simulation: { success: true, unitsConsumed: 450 } },
      helps: { kind: "money", text: "Catches common agent mistakes, such as a fee payer that cannot cover the fee, before sending, and says how to fix it. The agent fixes the transaction instead of retrying a failing one and paying fees each time." }
    },
    {
      name: "get_wallet_snapshot",
      price: "1 credit after 3 free calls",
      description: "Combines SOL balance, SPL and Token-2022 holdings, and five recent signatures into one wallet snapshot. Not an investment recommendation.",
      params: { wallet: "Base58 wallet address", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { wallet: "<address>", sol: { balance: 0 }, tokenAccountCount: 0, tokens: [], recentActivity: { checked: 0, latestSignature: null } },
      helps: { kind: "money", text: "One call instead of three (balance, tokens, recent activity): it uses 1 credit instead of 3 and gives the model fewer pieces to stitch together." }
    },
    {
      name: "summarize_wallet_activity",
      price: "1 credit after 3 free calls",
      description: "Counts successes and failures in a sample of recent wallet signatures and returns the newest activity. Does not decode instructions.",
      params: { wallet: "Base58 wallet address", limit: "integer 1–100 (optional, default 20)", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { examined: 0, successful: 0, failed: 0, latest: null, note: "Only the requested recent sample is counted." },
      helps: { kind: "accuracy", text: "Gives exact success and failure counts for the sample, instead of the model skimming a long list and estimating \"mostly successful.\"" }
    },
    {
      name: "resolve_token_symbol",
      price: "1 credit after 3 free calls",
      description: "Finds Solana token pair candidates for a ticker or name, ranked by reported liquidity, to help agents select a mint. Ticker matches can be ambiguous.",
      params: { query: "ticker, token name, or mint text (1–80 characters)" },
      exampleOutput: { query: "BONK", candidates: [{ mint: "<mint>", symbol: "BONK", liquidityUsd: 0, pairUrl: "<pair URL>" }], source: "DexScreener" },
      helps: { kind: "money", text: "Tickers are not unique; copycat tokens reuse names like BONK. A model picking a mint from memory can choose a fake one. This lists real candidates ranked by liquidity so the agent uses the right mint address." }
    },
    {
      name: "get_token_market_snapshot",
      price: "1 credit after 3 free calls",
      description: "Returns the most liquid matching DEX pair, token price, liquidity, volume, and pair link. Third-party market data; not an execution quote.",
      params: { mint: "Base58 token mint" },
      exampleOutput: { mint: "<mint>", found: true, priceUsd: null, liquidityUsd: 0, volume24hUsd: 0, source: "DexScreener" },
      helps: { kind: "accuracy", text: "A model's price knowledge is months old. This returns the current DEX price, liquidity and 24-hour volume with a source link. Low liquidity also warns that a trade could move the price a lot." }
    },
    {
      name: "analyze_token_concentration",
      price: "1 credit after 3 free calls",
      description: "Calculates the combined supply share in the ten largest token accounts and reports mint authorities. Token accounts are not unique beneficial owners.",
      params: { mint: "Base58 SPL token mint", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { mint: "<mint>", top10TokenAccountSharePct: 0, topTokenAccounts: [], mintAuthority: null, freezeAuthority: null },
      helps: { kind: "money", text: "If the ten largest accounts hold most of the supply, a few sellers can crash the price. The agent gets the real percentage instead of guessing that a token \"looks well distributed.\"" }
    },
    {
      name: "compare_tokens",
      price: "1 credit after 3 free calls",
      description: "Compares two token mints side by side across supply, decimals, mint and freeze authorities, and top-account concentration. Does not rank investments.",
      params: { mintA: "First Base58 SPL token mint", mintB: "Second Base58 SPL token mint", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { tokens: [{ mint: "<mint A>", decimals: 6 }, { mint: "<mint B>", decimals: 9 }], note: "Concentration is by token account, not beneficial owner." },
      helps: { kind: "accuracy", text: "Puts the real decimals, supply and authorities of two tokens side by side, so a model does not mix up the details of two similar-looking tokens." }
    },
    {
      name: "inspect_address",
      price: "1 credit after 3 free calls",
      description: "Classifies common account types from live owner, executable, parsed token, and lamport fields; custom accounts can remain inconclusive.",
      params: { address: "Base58 wallet, program, mint, or token account", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { exists: true, classification: "system_owned_wallet_or_account", ownerProgram: "11111111111111111111111111111111", token: null },
      helps: { kind: "money", text: "Says whether an address is a normal wallet, a token account, a mint or a program. Sending SOL to a mint or program address by mistake, thinking it is a wallet, can leave the funds stuck." }
    },
    {
      name: "explain_transaction_effects",
      price: "1 credit after 3 free calls",
      description: "Joins pre/post RPC balances into SOL and token changes, fee, status, and common program labels, avoiding manual transaction metadata joins.",
      params: { signature: "Base58 confirmed transaction signature", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { succeeded: true, feeLamports: 5000, solChanges: [], tokenChanges: [], programs: [] },
      helps: { kind: "accuracy", text: "Computes exact before-and-after balances. Doing it by hand means lining up long arrays of numbers by position, a step models often get wrong." }
    },
    {
      name: "analyze_wallet_portfolio",
      price: "1 credit after 3 free calls",
      description: "Joins live SOL and token balances with DEX prices for up to ten mints, reporting priced and unpriced assets separately and marking partial totals.",
      params: { wallet: "Base58 wallet address", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { sol: { balance: 0, priceUsd: null }, tokens: [], estimatedPricedValueUsd: 0, partial: true, marketSource: "DexScreener" },
      helps: { kind: "accuracy", text: "Marks which tokens had no price instead of silently counting them as $0 or inventing a value, and flags the total as partial when prices are missing." }
    },
    {
      name: "estimate_transaction_cost",
      price: "1 credit after 3 free calls",
      description: "Reads signer count and compute-budget instructions, estimates base and priority fees when possible, and simulates without signing or broadcasting.",
      params: { transaction: "Base64 serialized VersionedTransaction", network: "mainnet-beta | devnet (optional)" },
      exampleOutput: { baseFeeLamports: 5000, computeUnitLimit: null, priorityFeeLamports: null, unitsConsumed: 0, simulationSucceeded: false },
      helps: { kind: "money", text: "Shows the full cost (base fee, priority fee and compute used) before signing, so an accidentally huge priority-fee setting is noticed before it is paid." }
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
              Give Claude, Cursor, and agents typed Solana data tools. Try each tool 3 times without a wallet; add an API key to keep using a tool after its free calls.
            </p>
          </div>
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl min-w-[280px]">
            <div className="text-xs text-slate-400 font-medium mb-1">Live MCP Endpoint (Streamable HTTP):</div>
            <div className="text-xs text-indigo-400 font-mono break-all select-all">
              https://solana-pulse-gateway-1021990235790.us-central1.run.app/mcp
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
              <p className="text-xs text-slate-400">Add this snippet to <code className="text-indigo-300">claude_desktop_config.json</code> or Cursor's <code className="text-indigo-300">mcp.json</code> (requires Node.js) to enable all 20 tools, each with 3 free calls. Add an API key to keep using a tool after that.</p>
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
                  <p className={`mt-2 flex max-w-4xl gap-2 rounded-lg border px-3 py-2 text-xs leading-5 ${t.helps.kind === 'money' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100' : 'border-sky-500/20 bg-sky-500/5 text-sky-100'}`}>
                    {t.helps.kind === 'money' ? <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
                    <span><strong className="font-semibold">{t.helps.kind === 'money' ? 'Saves money: ' : 'Prevents hallucination: '}</strong>{t.helps.text}</span>
                  </p>
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
