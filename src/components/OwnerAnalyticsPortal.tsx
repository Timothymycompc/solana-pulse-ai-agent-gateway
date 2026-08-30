import React, { useState, useEffect } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  TrendingUp,
  DollarSign,
  Coins,
  Activity,
  Users,
  Eye,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  Zap,
  Globe,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Terminal,
  Send
} from 'lucide-react';

interface AnalyticsSummary {
  total_visitors: number;
  today_visitors: number;
  total_api_transactions: number;
  today_api_transactions: number;
  total_sol_earned: number;
  total_usd_earned: number;
  launch_timestamp: string;
  last_reset_date: string;
}

const ADMIN_PASSCODE_DEFAULT = 'solana2026';
const SOL_WALLET = '5GuzhMZDWAHoEZiJZiqtiJ7op7KmFE7VqW6f9irJKrSH';

export const OwnerAnalyticsPortal: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem('owner_authenticated_session') === 'true';
    } catch {
      return false;
    }
  });

  const [passcode, setPasscode] = useState<string>('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedPostTab, setSelectedPostTab] = useState<'reddit' | 'x' | 'discord' | 'mcp_hub'>('x');

  const [analytics, setAnalytics] = useState<AnalyticsSummary>({
    total_visitors: 0,
    today_visitors: 0,
    total_api_transactions: 0,
    today_api_transactions: 0,
    total_sol_earned: 0.0,
    total_usd_earned: 0.0,
    launch_timestamp: '2026-08-30 00:00:00 UTC',
    last_reset_date: '2026-08-30'
  });

  const [endpointBreakdown, setEndpointBreakdown] = useState<Record<string, number>>({});
  const [channelBreakdown, setChannelBreakdown] = useState<Record<string, number>>({});

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.trim() === ADMIN_PASSCODE_DEFAULT || passcode.trim() === 'admin' || passcode.trim() === 'solana') {
      setIsAuthenticated(true);
      setPasscodeError(null);
      try {
        localStorage.setItem('owner_authenticated_session', 'true');
      } catch {}
    } else {
      setPasscodeError('Invalid Passcode. Use "solana2026" or "solana" to unlock.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('owner_authenticated_session');
    } catch {}
  };

  const fetchLiveAnalytics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/v1/promotion/analytics');
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setAnalytics(data.summary);
        }
        if (data.endpoint_breakdown) {
          setEndpointBreakdown(data.endpoint_breakdown);
        }
        if (data.channel_breakdown) {
          setChannelBreakdown(data.channel_breakdown);
        }
      }
    } catch (err) {
      console.warn('Analytics fetch offline:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchLiveAnalytics();
      const interval = setInterval(fetchLiveAnalytics, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleResetToAuthenticZero = async () => {
    if (confirm('Reset all counters and lead numbers to authentic 0 on Google Cloud Run? This removes all initial simulated template placeholders.')) {
      try {
        const res = await fetch('/v1/promotion/reset-to-authentic', { method: 'POST' });
        if (res.ok) {
          // Clear local fallback cache too
          try {
            localStorage.removeItem('solana_pulse_promo_campaigns_v1');
            localStorage.removeItem('solana_pulse_ping_logs_v1');
          } catch {}
          await fetchLiveAnalytics();
          alert('Successfully cleared all simulated numbers! System is now on 100% authentic zero-state baseline.');
        }
      } catch (err) {
        alert('Reset initiated.');
      }
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // High-engagement pre-formatted copy posts with direct links
  const POST_TEMPLATES = {
    x: {
      title: 'X (Twitter) Developer Post',
      directUrl: 'https://twitter.com/compose/tweet',
      platformName: 'X / Twitter',
      text: `🚀 Just launched the Solana Pulse AI Agent Gateway on Google Cloud Run!

⚡ Features:
- Real-time Solana RPC bridge (Mainnet & Devnet)
- Model Context Protocol (MCP 1.0) for Claude Desktop, Cursor & LLMs
- 3-Tier Bot Rebate: Refer 1,000 bot calls for 15% fee discount

🔌 MCP Server: https://solana-pulse-ai-agent-gateway.ai.studio/.well-known/mcp.json
📖 LLMs Context: https://solana-pulse-ai-agent-gateway.ai.studio/llms.txt

#Solana #AIAgents #Claude #MCP #Python #Web3`
    },
    reddit: {
      title: 'Reddit Developer Subreddits (r/solanadev, r/ClaudeAI, r/LocalLLaMA)',
      directUrl: 'https://www.reddit.com/r/solanadev/submit',
      platformName: 'r/solanadev / r/ClaudeAI',
      text: `[Tool] Open Solana RPC Gateway with Model Context Protocol (MCP 1.0) & Devnet Broadcaster

Hey devs,

I built and deployed an open-access Solana RPC & Devnet Gateway tailored specifically for autonomous AI agents and bot operators.

Key Capabilities:
- Zero-Binary pure Python backend deployed on Google Cloud Run
- Dual RPC support: Solana Mainnet-Beta and Devnet
- Native MCP 1.0 integration for Claude Desktop, Cursor IDE, and LangChain agents
- Automated 3-tier bot referral incentive model (refer leads for up to 55% off RPC calls)

Gateway Root: https://solana-pulse-ai-agent-gateway.ai.studio
MCP Manifest: https://solana-pulse-ai-agent-gateway.ai.studio/.well-known/mcp.json
LLM Spec: https://solana-pulse-ai-agent-gateway.ai.studio/llms.txt

Feedback and bot pull requests are welcome!`
    },
    discord: {
      title: 'Discord Communities (Anthropic Claude, Solana Tech, Cursor)',
      directUrl: 'https://discord.com/app',
      platformName: 'Discord Developer Servers',
      text: `**Solana Pulse AI Agent Gateway (MCP 1.0)**
🔗 **URL**: https://solana-pulse-ai-agent-gateway.ai.studio
⚙️ **MCP Endpoint**: https://solana-pulse-ai-agent-gateway.ai.studio/.well-known/mcp.json
🛠️ **Features**: Query Solana Mainnet/Devnet balances, broadcast signed transactions, token risk inspection, and zero-binary pure-Python micro-services.
🎁 **Bot Operator Program**: Active 3-tier discount model for high-frequency agents!`
    },
    mcp_hub: {
      title: 'MCP Directories (mcp.so, awesome-mcp-servers, Glama.ai)',
      directUrl: 'https://github.com/punkpeye/awesome-mcp-servers',
      platformName: 'Awesome MCP Servers GitHub / Glama.ai',
      text: `### Solana Pulse MCP Gateway
- **Description**: Real-time Solana Blockchain RPC Bridge, Devnet Broadcaster, and MCP 1.0 Server for Claude Desktop and autonomous AI agents.
- **Server Type**: SSE / HTTP
- **Manifest URL**: \`https://solana-pulse-ai-agent-gateway.ai.studio/.well-known/mcp.json\`
- **Documentation**: \`https://solana-pulse-ai-agent-gateway.ai.studio/llms.txt\`
- **Author Wallet / Sponsor**: \`5GuzhMZDWAHoEZiJZiqtiJ7op7KmFE7VqW6f9irJKrSH\``
    }
  };

  // DIRECT LINKS TO PLACES THAT DEAL IN THIS WORK
  const PROMOTION_DESTINATIONS = [
    {
      name: 'Reddit - r/solanadev',
      category: 'Solana Devs',
      url: 'https://www.reddit.com/r/solanadev/submit',
      description: 'Primary subreddit for Solana developers, smart contract builders, and RPC tools.'
    },
    {
      name: 'Reddit - r/ClaudeAI',
      category: 'AI & MCP Users',
      url: 'https://www.reddit.com/r/ClaudeAI/submit',
      description: 'Active community sharing MCP tools, Claude Desktop plugins, and workflows.'
    },
    {
      name: 'Reddit - r/LocalLLaMA',
      category: 'Autonomous Agents',
      url: 'https://www.reddit.com/r/LocalLLaMA/submit',
      description: 'Over 200k engineers building autonomous tool-calling agents and MCP clients.'
    },
    {
      name: 'X (Twitter) - Web3 & AI Feed',
      category: 'Social & Crypto',
      url: 'https://twitter.com/compose/tweet',
      description: 'Post with #Solana #MCP #AIAgents to get indexed by automated trading bots.'
    },
    {
      name: 'Anthropic Claude Discord (#mcp-servers)',
      category: 'Discord Hub',
      url: 'https://discord.gg/anthropic',
      description: 'Official Anthropic developer community where engineers discover new MCP tools.'
    },
    {
      name: 'Solana Tech Discord (#developer-support)',
      category: 'Discord Hub',
      url: 'https://discord.gg/solana',
      description: 'Solana Foundation tech chat where bots and RPC infra are shared.'
    },
    {
      name: 'Awesome MCP Servers GitHub',
      category: 'MCP Directory',
      url: 'https://github.com/punkpeye/awesome-mcp-servers',
      description: 'The top GitHub repo aggregating verified Model Context Protocol servers.'
    },
    {
      name: 'Glama MCP Server Registry',
      category: 'MCP Registry',
      url: 'https://glama.ai/mcp/servers',
      description: 'Public registry where LLMs and developers search for live MCP tools.'
    }
  ];

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-indigo-950 border border-indigo-500/40 rounded-2xl flex items-center justify-center mx-auto text-indigo-400">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Owner's Private Analytics Portal</h2>
          <p className="text-xs text-slate-400">
            Protected dashboard for private visitor metrics, transaction volume, revenue tracking, and direct promotional channels.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
              Owner Passcode
            </label>
            <input
              type="password"
              placeholder="Enter passcode (e.g. solana2026)"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none"
              autoFocus
            />
            {passcodeError && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {passcodeError}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-indigo-600/30"
          >
            <Unlock className="w-4 h-4" />
            Unlock Owner Dashboard
          </button>
        </form>

        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
          <span className="font-semibold text-slate-300 block">Default Master Key:</span>
          <code className="text-indigo-300 font-mono">solana2026</code> or <code className="text-indigo-300 font-mono">solana</code>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Security Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/40 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                Owner Private Session Authenticated
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                Cloud Run 24/7 Engine
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Executive Analytics & Promotion Distribution Hub
            </h2>
            <p className="text-xs text-slate-300">
              Live server-verified stats for visitors, transactions, revenue, and 1-click launch posts for top crypto & AI platforms.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLiveAnalytics}
              disabled={isLoading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs flex items-center gap-1.5 transition"
              title="Refresh Stats"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="text-xs font-semibold">Sync</span>
            </button>

            <button
              onClick={handleResetToAuthenticZero}
              className="px-3 py-2 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              title="Reset all demo counters to authentic zero"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Authentic Zero
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-2 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 rounded-xl text-xs font-semibold transition"
            >
              Lock Tab
            </button>
          </div>
        </div>

        {/* Linked Payout Wallet Banner */}
        <div className="mt-4 pt-4 border-t border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Coins className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Connected Payout Wallet: <strong className="font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">{SOL_WALLET}</strong>
            </span>
          </div>
          <button
            onClick={() => handleCopy(SOL_WALLET, 'wallet')}
            className="text-[11px] text-indigo-300 hover:text-white flex items-center gap-1"
          >
            {copiedKey === 'wallet' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copiedKey === 'wallet' ? 'Copied' : 'Copy Address'}
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Visitors Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Visitors (All-Time)</span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono">{analytics.total_visitors}</span>
            <span className="text-xs font-semibold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-500/20">
              +{analytics.today_visitors} today
            </span>
          </div>
          <p className="text-[11px] text-slate-500">Includes crawler spiders, bot user-agents, and web visits.</p>
        </div>

        {/* Transactions Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">API Transactions Executed</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-white font-mono">{analytics.total_api_transactions}</span>
            <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-500/20">
              +{analytics.today_api_transactions} today
            </span>
          </div>
          <p className="text-[11px] text-slate-500">RPC balance calls, risk audits, Devnet broadcasts & MCP queries.</p>
        </div>

        {/* SOL Earned Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total SOL Earned (Since Launch)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-300 font-mono">
              {analytics.total_sol_earned.toFixed(4)} SOL
            </span>
            <span className="text-xs font-semibold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/20">
              Direct to 5Guzh...
            </span>
          </div>
          <p className="text-[11px] text-slate-500">Zero middleman fees deducted. Deposited straight to your keypair.</p>
        </div>

        {/* USD Equivalent Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">USD Valuation Estimate</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              ${analytics.total_usd_earned.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/20">
              @ ~$145/SOL
            </span>
          </div>
          <p className="text-[11px] text-slate-500">Calculated in real-time based on active Solana market index.</p>
        </div>
      </div>

      {/* SECTION 2: 1-Click Posting Studio & Copy-Paste Hub */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              1-Click Promotional Post Generator & Direct Submit Links
            </h3>
            <p className="text-xs text-slate-400">
              Select a target platform below, copy the pre-tailored viral message, and click the direct link to submit instantly!
            </p>
          </div>

          {/* Sub-selector tabs */}
          <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800 flex-wrap gap-1">
            <button
              onClick={() => setSelectedPostTab('x')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedPostTab === 'x' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              X / Twitter
            </button>
            <button
              onClick={() => setSelectedPostTab('reddit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedPostTab === 'reddit' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Reddit (r/solanadev)
            </button>
            <button
              onClick={() => setSelectedPostTab('discord')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedPostTab === 'discord' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Discord Devs
            </button>
            <button
              onClick={() => setSelectedPostTab('mcp_hub')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                selectedPostTab === 'mcp_hub' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              MCP Directories
            </button>
          </div>
        </div>

        {/* Post Box and Action */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-2">
              <Send className="w-3.5 h-3.5 text-indigo-400" />
              {POST_TEMPLATES[selectedPostTab].title}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(POST_TEMPLATES[selectedPostTab].text, selectedPostTab)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
              >
                {copiedKey === selectedPostTab ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === selectedPostTab ? 'Copied to Clipboard!' : '1. Copy Formatted Post'}
              </button>

              <a
                href={POST_TEMPLATES[selectedPostTab].directUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
              >
                <span>2. Open {POST_TEMPLATES[selectedPostTab].platformName}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <pre className="p-4 bg-slate-900 rounded-xl text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed border border-slate-800 select-all">
            {POST_TEMPLATES[selectedPostTab].text}
          </pre>
        </div>
      </div>

      {/* SECTION 3: Curated Direct Links Directory */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              Direct High-Impact Distribution Channels
            </h3>
            <p className="text-xs text-slate-400">
              Direct clickable destinations where developers, bot operators, and AI agents look for Solana RPC and MCP servers:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PROMOTION_DESTINATIONS.map((dest, i) => (
            <a
              key={i}
              href={dest.url}
              target="_blank"
              rel="noreferrer"
              className="p-4 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl transition flex flex-col justify-between group space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                    {dest.category}
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 transition" />
                </div>
                <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition">
                  {dest.name}
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  {dest.description}
                </p>
              </div>

              <div className="text-[10px] font-semibold text-indigo-400 flex items-center gap-1 group-hover:translate-x-0.5 transition">
                <span>Submit & Post Here</span>
                <ArrowUpRight className="w-3 h-3" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
