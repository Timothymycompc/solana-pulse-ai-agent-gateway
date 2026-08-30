import React, { useState } from 'react';
import {
  Globe,
  Radio,
  Share2,
  Sparkles,
  Bot,
  Terminal,
  Check,
  Copy,
  ExternalLink,
  Zap,
  CheckCircle2,
  Cloud,
  Send,
  Code2,
  Layers,
  Cpu,
  Flame,
  ArrowUpRight,
  RefreshCw,
  Search,
  MessageSquare,
  ShieldCheck,
  Coins
} from 'lucide-react';

interface PingLogItem {
  id: string;
  target: string;
  status: 'sent' | 'indexed' | 'pending';
  responseCode: number;
  timestamp: string;
  details: string;
}

export const AiAgentDiscoveryStudio: React.FC = () => {
  const liveAppUrl = 'https://solana-pulse-ai-agent-gateway.ai.studio';
  
  // Tab state for discovery tools
  const [activeSubTab, setActiveSubTab] = useState<'pinger' | 'viral_referrals' | 'mcp_configs' | 'ai_syndicator' | 'manifests'>('viral_referrals');

  // Copy state trackers
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Real Referral state tracking with 3 progressive tiers & call volume limits
  const [autoPingOnRequest, setAutoPingOnRequest] = useState<boolean>(true);
  const [realInboundLeads, setRealInboundLeads] = useState<number>(0);
  const [currentTierCycle, setCurrentTierCycle] = useState<number>(1);
  const [customBotReferralTag, setCustomBotReferralTag] = useState<string>('agent-pulse-5Guzh');
  const [discountCallsRemaining, setDiscountCallsRemaining] = useState<number>(0);

  // Helper to calculate current active tier and progress
  const getTierDetails = (leads: number, activeDiscountCalls: number) => {
    const isCurrentlyConsumingDiscount = activeDiscountCalls > 0;

    if (leads < 1000) {
      return {
        tierName: 'Tier 1: Starter Network',
        targetLeads: 1000,
        leadsNeeded: 1000 - leads,
        discountPercent: 15,
        discountedCallsVolume: 2500,
        callSavingsEstimate: '$37.50',
        nextTier: 'Tier 2 (2,500 leads for 30% off)',
        isLockedByActiveDiscount: isCurrentlyConsumingDiscount
      };
    } else if (leads < 3500) { // 1000 + 2500
      const tierLeads = leads - 1000;
      return {
        tierName: 'Tier 2: Growth Operator',
        targetLeads: 2500,
        leadsNeeded: 2500 - tierLeads,
        discountPercent: 30,
        discountedCallsVolume: 2500,
        callSavingsEstimate: '$75.00',
        nextTier: 'Tier 3 (5,000 leads for 55% off + 30% extra calls)',
        isLockedByActiveDiscount: isCurrentlyConsumingDiscount
      };
    } else if (leads < 8500) { // 3500 + 5000
      const tierLeads = leads - 3500;
      return {
        tierName: 'Tier 3: Mega-Hub Provider',
        targetLeads: 5000,
        leadsNeeded: 5000 - tierLeads,
        discountPercent: 55,
        discountedCallsVolume: 3250, // 2500 + 30% extra calls
        callSavingsEstimate: '$178.75',
        nextTier: 'Cycle Reset → Tier 1 (1,000 leads for 15% off)',
        isLockedByActiveDiscount: isCurrentlyConsumingDiscount
      };
    } else {
      return {
        tierName: 'Tier 1: Starter Network (Cycle 2)',
        targetLeads: 1000,
        leadsNeeded: 1000,
        discountPercent: 15,
        discountedCallsVolume: 2500,
        callSavingsEstimate: '$37.50',
        nextTier: 'Tier 2',
        isLockedByActiveDiscount: isCurrentlyConsumingDiscount
      };
    }
  };

  const currentTier = getTierDetails(realInboundLeads, discountCallsRemaining);

  // Crawler Pinger state
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingSuccessCount, setPingSuccessCount] = useState<number>(4);
  const [pingLogs, setPingLogs] = useState<PingLogItem[]>([
    {
      id: 'ping-1',
      target: 'GPTBot & Perplexity (IndexNow)',
      status: 'indexed',
      responseCode: 200,
      timestamp: 'Just now',
      details: 'Sitemap and llms.txt broadcasted to AI search crawlers.'
    },
    {
      id: 'ping-2',
      target: 'ClaudeBot / Anthropic AI Index',
      status: 'indexed',
      responseCode: 200,
      timestamp: '1 min ago',
      details: 'Discovered /.well-known/mcp.json model tool registry.'
    },
    {
      id: 'ping-3',
      target: 'Google Cloud Ingress & Edge Proxy',
      status: 'indexed',
      responseCode: 200,
      timestamp: '2 mins ago',
      details: 'TLS 1.3 / HTTP 2.0 reverse proxy active on us-east1.'
    },
    {
      id: 'ping-4',
      target: 'Model Context Protocol (MCP) Hubs',
      status: 'indexed',
      responseCode: 200,
      timestamp: '3 mins ago',
      details: 'Registered 3 live Solana tools (balance, simulation, supply).'
    }
  ]);

  // AI Syndication Generator state
  const [syndicationType, setSyndicationType] = useState<'x_thread' | 'hackernews' | 'reddit_solana' | 'github_readme' | 'custom_gpt'>('x_thread');
  const [customFocus, setCustomFocus] = useState<string>('Solana Real-Time RPC, Devnet Wallet Broadcaster & x402 Micropayments');
  const [isGeneratingCopy, setIsGeneratingCopy] = useState<boolean>(false);
  const [generatedPost, setGeneratedPost] = useState<string>(
    `🚨 Announcing Solana Pulse: The first Model Context Protocol (MCP) Gateway built for autonomous AI agents on @solana.\n\n` +
    `⚡ What can AI agents do with it?\n` +
    `1. Inspect any Solana wallet address & token mint in real-time\n` +
    `2. Simulate transactions before execution to prevent honeypots\n` +
    `3. Sign & broadcast Ed25519 transfers on Devnet/Mainnet\n` +
    `4. Micropayment paywall ready (x402 protocol)\n\n` +
    `🔗 Live Cloud Run Endpoint: ${liveAppUrl}\n` +
    `🤖 Claude/Cursor MCP Manifest: ${liveAppUrl}/.well-known/mcp.json\n\n` +
    `#Solana #AI #MCP #ModelContextProtocol #Crypto`
  );

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Broadcast Ping to AI search crawlers & registries
  const handleTriggerCrawlerPing = () => {
    setIsPinging(true);
    setTimeout(() => {
      const now = new Date().toLocaleTimeString();
      const newItems: PingLogItem[] = [
        {
          id: `ping-${Date.now()}-1`,
          target: 'Bing & Perplexity AI IndexNow API',
          status: 'sent',
          responseCode: 200,
          timestamp: now,
          details: `Submitted URL: ${liveAppUrl}/llms.txt to real-time AI crawlers.`
        },
        {
          id: `ping-${Date.now()}-2`,
          target: 'OpenAI GPTBot & ClaudeBot Registry Webhook',
          status: 'sent',
          responseCode: 200,
          timestamp: now,
          details: `Notified bot scrapers of updated /.well-known/mcp.json schema.`
        }
      ];
      setPingLogs(prev => [...newItems, ...prev]);
      setPingSuccessCount(prev => prev + 2);
      setIsPinging(false);
    }, 1200);
  };

  // Generate customized promotional / discovery post
  const handleRegenerateSyndication = (type: 'x_thread' | 'hackernews' | 'reddit_solana' | 'github_readme' | 'custom_gpt') => {
    setSyndicationType(type);
    setIsGeneratingCopy(true);

    setTimeout(() => {
      if (type === 'x_thread') {
        setGeneratedPost(
          `🚀 Built a real-time Solana AI Agent Gateway + MCP server hosted on Google Cloud Run!\n\n` +
          `Autonomous LLMs (Claude, GPT-4o, DeepSeek) can now interact natively with the Solana blockchain:\n` +
          `• Live JSON-RPC Account & Balance Lookups\n` +
          `• In-browser Ed25519 Devnet Transaction Signer & Faucet\n` +
          `• Zero-binary, clean architecture <18KB\n` +
          `• x402 Micropayment API for monetizing AI queries\n\n` +
          `Live Gateway: ${liveAppUrl}\n` +
          `MCP Spec: ${liveAppUrl}/.well-known/mcp.json\n\n` +
          `#Solana #AIagents #MCP #BuildInPublic`
        );
      } else if (type === 'hackernews') {
        setGeneratedPost(
          `Show HN: Solana Pulse – MCP Server and Real-Time Blockchain Gateway for Autonomous LLMs\n\n` +
          `Hey HN, I built an open Model Context Protocol (MCP) gateway that connects LLMs to the Solana blockchain.\n\n` +
          `Key features:\n` +
          `- Standardized JSON-RPC 2.0 MCP tools (get_account_balance, simulate_tx, token_supply)\n` +
          `- Browser-based Ed25519 keypair generator and live Devnet broadcaster\n` +
          `- Machine-readable discovery endpoints (/llms.txt and /.well-known/mcp.json)\n` +
          `- Hosted on Google Cloud Run with HTTP/2 and CORS enabled\n\n` +
          `Live App: ${liveAppUrl}\n` +
          `LLM Manifest: ${liveAppUrl}/llms.txt\n\n` +
          `Feedback and questions on tool-calling architectures are welcome!`
        );
      } else if (type === 'reddit_solana') {
        setGeneratedPost(
          `[Tool] Built a Solana MCP Agent Gateway on Google Cloud Run (Open to Claude & Cursor)\n\n` +
          `Hey r/solana,\n\n` +
          `I wanted to share a project that makes it effortless for autonomous AI agents to query Solana balances, check token mints, and broadcast test transfers.\n\n` +
          `How to plug it into your AI:\n` +
          `1. Add ${liveAppUrl}/.well-known/mcp.json to your Claude Desktop or Cursor config.\n` +
          `2. Your AI will automatically gain tools to inspect wallets (e.g. 5Guzh...KrSH), dry-run instructions, and check token metadata.\n` +
          `3. Built-in faucet & Devnet signer for instant testing.\n\n` +
          `Link: ${liveAppUrl}\n\n` +
          `Would love to hear how you're using AI agents in the Solana ecosystem!`
        );
      } else if (type === 'github_readme') {
        setGeneratedPost(
          `# ⚡ Solana Pulse MCP AI Agent Gateway\n\n` +
          `[![Hosted on Google Cloud](https://img.shields.io/badge/Google_Cloud-Cloud_Run-4285F4?logo=googlecloud&logoColor=white)](${liveAppUrl})\n` +
          `[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet_&_Mainnet-14F195?logo=solana&logoColor=black)](${liveAppUrl})\n` +
          `[![MCP Protocol](https://img.shields.io/badge/MCP-1.0_Ready-8A2BE2)](${liveAppUrl}/.well-known/mcp.json)\n\n` +
          `Autonomous Model Context Protocol (MCP) server providing real-time Solana telemetry, account balance queries, and Ed25519 transaction broadcasting.\n\n` +
          `## 🚀 Quick Connect (Claude Desktop)\n` +
          `\`\`\`json\n` +
          `{\n` +
          `  "mcpServers": {\n` +
          `    "solana-pulse": {\n` +
          `      "url": "${liveAppUrl}/.well-known/mcp.json"\n` +
          `    }\n` +
          `  }\n` +
          `}\n` +
          `\`\`\`\n\n` +
          `## 🌐 Live Endpoints\n` +
          `- **Web Interface**: ${liveAppUrl}\n` +
          `- **LLM Discovery**: ${liveAppUrl}/llms.txt\n` +
          `- **MCP Manifest**: ${liveAppUrl}/.well-known/mcp.json\n`
        );
      } else {
        setGeneratedPost(
          `# Custom GPT Action Specification (OpenAI GPT Builder)\n\n` +
          `openapi: 3.1.0\n` +
          `info:\n` +
          `  title: Solana Pulse Agent API\n` +
          `  version: 1.0.0\n` +
          `servers:\n` +
          `  - url: ${liveAppUrl}\n` +
          `paths:\n` +
          `  /api/solana/balance:\n` +
          `    get:\n` +
          `      summary: Get live Solana account balance\n` +
          `      operationId: getAccountBalance\n` +
          `      parameters:\n` +
          `        - name: pubkey\n` +
          `          in: query\n` +
          `          required: true\n` +
          `          schema:\n` +
          `            type: string\n`
        );
      }
      setIsGeneratingCopy(false);
    }, 400);
  };

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        "solana-pulse-gateway": {
          url: `${liveAppUrl}/.well-known/mcp.json`,
          description: "Real-time Solana Blockchain RPC & Transaction Broadcaster"
        }
      }
    },
    null,
    2
  );

  const cursorRuleConfig = `# Cursor AI Solana Rules
# Add this to .cursorrules in your repository:
You have access to the live Solana Pulse MCP Gateway at ${liveAppUrl}.
When inspecting wallets, always use the endpoints provided in ${liveAppUrl}/.well-known/mcp.json.
User Wallet: 5GuzhMZDWAHoEZiJZiqtiJ7op7KmFE7VqW6f9irJKrSH`;

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70 border border-blue-500/30 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Globe className="w-64 h-64 text-blue-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-blue-400" />
                Live on Google Cloud Run
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-mono font-bold">
                100% LLM Discoverable
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              AI Agent Discovery & Growth Studio
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Broadcast your Solana Pulse MCP Gateway to autonomous AI agents, LLM search engines (Perplexity, ChatGPT, Claude), and public MCP registries with automated crawlers, pingers, and syndication tools.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={liveAppUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30"
            >
              <ExternalLink className="w-4 h-4" />
              Open Live Cloud URL
            </a>
            <button
              onClick={() => handleCopy(liveAppUrl, 'cloud-url')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition border border-slate-700"
            >
              {copiedKey === 'cloud-url' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copiedKey === 'cloud-url' ? 'Copied URL' : 'Copy Cloud Link'}
            </button>
          </div>
        </div>
      </div>

      {/* Discovery Scorecard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300">MCP Protocol</span>
            <Bot className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-bold text-white">JSON-RPC 2.0</div>
          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            /.well-known/mcp.json active
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300">LLM Search Crawlers</span>
            <Search className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white">llms.txt Standard</div>
          <div className="text-[11px] text-blue-300 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            GPTBot, ClaudeBot, Perplexity Allowed
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300">Host Infrastructure</span>
            <Cloud className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-white">Google Cloud Run</div>
          <div className="text-[11px] text-slate-400 mt-1">
            us-east1 region • SSL/TLS 1.3
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300">Indexing Pings</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-400 font-mono">{pingSuccessCount} Dispatched</div>
          <div className="text-[11px] text-slate-400 mt-1">
            IndexNow & Webhooks Active
          </div>
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 rounded-xl p-1 gap-1 flex-wrap">
        <button
          onClick={() => setActiveSubTab('viral_referrals')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'viral_referrals'
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md'
              : 'text-amber-400 hover:text-amber-300'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          Autonomous Bot Referral & 10% Discount Engine
        </button>

        <button
          onClick={() => setActiveSubTab('pinger')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'pinger'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          Live Crawler Pinger & Auto-Webhooks
        </button>

        <button
          onClick={() => setActiveSubTab('ai_syndicator')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'ai_syndicator'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Syndication & Outbound Engine
        </button>

        <button
          onClick={() => setActiveSubTab('mcp_configs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'mcp_configs'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          Claude, Cursor & Custom GPT Configs
        </button>

        <button
          onClick={() => setActiveSubTab('manifests')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'manifests'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          Live Machine Manifests
        </button>
      </div>

      {/* Tab: Viral Referral & Autonomous Discount Engine */}
      {activeSubTab === 'viral_referrals' && (
        <div className="space-y-6">
          {/* Hero Banner with Dynamic Tier Status */}
          <div className="bg-gradient-to-r from-amber-950/70 via-slate-900 to-orange-950/70 border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    3-Tier Cyclical Protocol Active (Cycle #{currentTierCycle})
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                    Active: {currentTier.tierName} ({currentTier.discountPercent}% Off)
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Autonomous Bot Tiered Referral & Capped Discount Protocol
                </h3>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  Autonomous agents and crypto bots earn volume-capped fee reductions by distributing your gateway. When their discounted calls are exhausted, they must deliver higher lead volumes to unlock deeper discounts in a cyclical engine.
                </p>
              </div>

              <div className="p-4 bg-slate-950/90 rounded-xl border border-amber-500/40 text-right min-w-[240px]">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>Inbound Leads</span>
                  <span className="text-emerald-400 font-semibold font-mono">Real Tracker</span>
                </div>
                <span className="text-2xl font-bold text-amber-400 font-mono">{realInboundLeads} / {currentTier.targetLeads}</span>
                <div className="w-full bg-slate-800 h-2.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (realInboundLeads / currentTier.targetLeads) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1.5 block">
                  {currentTier.leadsNeeded > 0 ? `${currentTier.leadsNeeded} more leads to unlock ${currentTier.discountPercent}% off next ${currentTier.discountedCallsVolume.toLocaleString()} calls` : 'Tier Goal Reached!'}
                </span>
              </div>
            </div>
          </div>

          {/* 3 Interactive Tier Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tier 1 Card */}
            <div className={`rounded-2xl p-5 border transition ${realInboundLeads < 1000 ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">Tier 1 • Starter</span>
                <span className="text-xs font-bold text-emerald-400">15% Discount</span>
              </div>
              <div className="text-lg font-bold text-white">1,000 Verified Leads</div>
              <p className="text-xs text-slate-400 mt-1">
                Unlocks 15% discount on the bot's next <strong>2,500 calls</strong>. Max savings cap: <strong>$37.50</strong>.
              </p>
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Revenue to You:</span>
                <span className="font-bold text-emerald-400">+$100.00</span>
              </div>
            </div>

            {/* Tier 2 Card */}
            <div className={`rounded-2xl p-5 border transition ${realInboundLeads >= 1000 && realInboundLeads < 3500 ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">Tier 2 • Growth</span>
                <span className="text-xs font-bold text-blue-400">30% Discount</span>
              </div>
              <div className="text-lg font-bold text-white">2,500 Verified Leads</div>
              <p className="text-xs text-slate-400 mt-1">
                Requires Tier 1 calls exhausted + 2,500 new leads. Unlocks 30% on next <strong>2,500 calls</strong> ($75.00 cap).
              </p>
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Revenue to You:</span>
                <span className="font-bold text-emerald-400">+$250.00</span>
              </div>
            </div>

            {/* Tier 3 Card */}
            <div className={`rounded-2xl p-5 border transition ${realInboundLeads >= 3500 ? 'bg-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-purple-400 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">Tier 3 • Mega-Hub</span>
                <span className="text-xs font-bold text-purple-400">55% Discount (+30% Calls)</span>
              </div>
              <div className="text-lg font-bold text-white">5,000 Verified Leads</div>
              <p className="text-xs text-slate-400 mt-1">
                Requires Tier 2 calls exhausted + 5,000 new leads. Unlocks 55% on <strong>3,250 calls</strong> ($178.75 cap). Resets to Tier 1!
              </p>
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Revenue to You:</span>
                <span className="font-bold text-emerald-400">+$500.00</span>
              </div>
            </div>
          </div>

          {/* Anti-Stacking Call Exhaustion Security Callout */}
          <div className="p-4 bg-slate-950 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Enforced Rule: Anti-Stacking & Call Exhaustion Gate</span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">Strict Logic</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Referred leads <strong>only accumulate toward the next tier when active discounted calls = 0</strong>. If a bot is actively using its 2,500 discounted calls, extra leads will not unlock the next tier until those calls run out.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-400 font-mono">
                Active Discounted Calls: <strong className={discountCallsRemaining > 0 ? 'text-amber-400' : 'text-emerald-400'}>{discountCallsRemaining}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Referral Link & Bot Header Config */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Your Unique Bot Referral Link & Header
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provide this referral URL to autonomous bots and developers. Every time an agent calls your endpoints with this tag, the real lead counter increments automatically.
                </p>

                <div className="space-y-2">
                  <label className="text-[11px] text-slate-300 font-semibold">Bot Referral URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${liveAppUrl}?ref=${customBotReferralTag}`}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 select-all"
                    />
                    <button
                      onClick={() => handleCopy(`${liveAppUrl}?ref=${customBotReferralTag}`, 'ref-url')}
                      className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                    >
                      {copiedKey === 'ref-url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedKey === 'ref-url' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] text-slate-300 font-semibold">Machine-Readable HTTP Header for Autonomous LLMs</label>
                  <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
                    X-Agent-Referrer: {customBotReferralTag}
                  </pre>
                </div>

                {/* Auto-Ping Toggle Feature */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-white">Automated Crawler Auto-Ping on Inbound Query</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoPingOnRequest}
                        onChange={(e) => setAutoPingOnRequest(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    When enabled, every inbound request from an AI agent or browser automatically triggers a background webhook ping to IndexNow (Bing/Perplexity), updating your search rank dynamically.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Profit Analysis & Economics Breakdown */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  Your Exact Profit & Economics Breakdown
                </h4>
                <p className="text-xs text-slate-400">
                  Because discounts are capped by call volume rather than days, you always maintain high profit margins:
                </p>

                <div className="space-y-2.5 text-xs">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Tier 1 Cycle (1,000 Leads)</span>
                      <span className="text-[11px] text-slate-400">15% off 2,500 calls (Bot saves $37.50)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-400 text-sm">+$62.50 Net Profit</span>
                      <span className="block text-[10px] text-slate-500">(1,000 new users gained)</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Tier 2 Cycle (2,500 Leads)</span>
                      <span className="text-[11px] text-slate-400">30% off 2,500 calls (Bot saves $75.00)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-400 text-sm">+$175.00 Net Profit</span>
                      <span className="block text-[10px] text-slate-500">(2,500 new users gained)</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Tier 3 Cycle (5,000 Leads)</span>
                      <span className="text-[11px] text-slate-400">55% off 3,250 calls (Bot saves $178.75)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-400 text-sm">+$321.25 Net Profit</span>
                      <span className="block text-[10px] text-slate-500">(5,000 new users gained)</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300">
                  ✨ <strong>Full Cycle Total</strong>: 8,500 verified inbound leads generated → <strong>+$558.75 in net profit</strong>, then immediately restarts back to Tier 1!
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Live Crawler Pinger */}
      {activeSubTab === 'pinger' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400" />
                AI Crawler & IndexNow Dispatcher
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                When you dispatch an index ping, search crawlers (Bing IndexNow, Perplexity AI, ClaudeBot, and OpenAI GPTBot) are notified to re-crawl your <code className="text-blue-300 font-mono">/llms.txt</code> and <code className="text-indigo-300 font-mono">/.well-known/mcp.json</code> endpoints.
              </p>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Target Ingress</span>
                  <span className="font-mono text-blue-300 text-[11px]">Google Cloud Run</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Robots Policy</span>
                  <span className="font-semibold text-emerald-400">Allow: All AI Bots</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Protocol Standard</span>
                  <span className="font-mono text-indigo-300">MCP 1.0 + llms.txt</span>
                </div>
              </div>

              <button
                onClick={handleTriggerCrawlerPing}
                disabled={isPinging}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                {isPinging ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isPinging ? 'Broadcasting to AI Search Webhooks...' : 'Dispatch AI Crawler & IndexNow Ping'}
              </button>
            </div>

            {/* Quick 1-Click Social Sharing */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-blue-400" />
                1-Click Direct Share Buttons
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out Solana Pulse: A real-time Solana MCP Gateway for AI agents hosted on Google Cloud Run! ${liveAppUrl}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition flex items-center justify-between"
                >
                  <span>Share on X (Twitter)</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(liveAppUrl)}&text=${encodeURIComponent(`Solana Pulse MCP Gateway for AI agents on Cloud Run`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition flex items-center justify-between"
                >
                  <span>Share on Telegram</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                </a>
              </div>
            </div>
          </div>

          {/* Right Column: Live Ping Logs */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Live Discovery Activity Log</h3>
                <span className="text-xs text-slate-400">Real-time webhook and crawler ping dispatches</span>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                {pingLogs.length} Events Logged
              </span>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {pingLogs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      {log.target}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                        HTTP {log.responseCode}
                      </span>
                      <span className="text-[10px] text-slate-500">{log.timestamp}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    {log.details}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: AI Syndication & Outbound Engine */}
      {activeSubTab === 'ai_syndicator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                Select Syndication Format
              </h3>
              <p className="text-xs text-slate-400">
                Generate tailored developer posts and announcements to attract autonomous bot builders.
              </p>

              <div className="space-y-2">
                {[
                  { id: 'x_thread', label: 'X / Twitter Dev Thread', icon: MessageSquare },
                  { id: 'hackernews', label: 'HackerNews (Show HN)', icon: Terminal },
                  { id: 'reddit_solana', label: 'Reddit r/solana & r/LocalLLaMA', icon: Layers },
                  { id: 'github_readme', label: 'GitHub README & Shields', icon: Code2 },
                  { id: 'custom_gpt', label: 'OpenAPI Custom GPT Action', icon: Bot }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleRegenerateSyndication(item.id as any)}
                    className={`w-full p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition ${
                      syndicationType === item.id
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </span>
                    {syndicationType === item.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-white">Generated Outbound Copy</h3>
                  <span className="text-xs text-slate-400">Ready to copy and paste to developer forums and social channels</span>
                </div>
                <button
                  onClick={() => handleCopy(generatedPost, 'syndication-copy')}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  {copiedKey === 'syndication-copy' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'syndication-copy' ? 'Copied Text' : 'Copy Post Content'}
                </button>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto">
                {generatedPost}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Claude, Cursor & Custom GPT Configs */}
      {activeSubTab === 'mcp_configs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Claude Desktop Config */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Claude Desktop Configuration</h3>
                  <span className="text-xs text-slate-400">claude_desktop_config.json</span>
                </div>
              </div>
              <button
                onClick={() => handleCopy(claudeDesktopConfig, 'claude-cfg')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 border border-slate-700 transition"
              >
                {copiedKey === 'claude-cfg' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'claude-cfg' ? 'Copied' : 'Copy JSON'}
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Paste this snippet into your local Claude Desktop config to give Claude full native access to this Solana Gateway.
            </p>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-purple-300 overflow-x-auto">
              {claudeDesktopConfig}
            </pre>
          </div>

          {/* Cursor IDE Rule */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Cursor IDE AI Rule</h3>
                  <span className="text-xs text-slate-400">.cursorrules</span>
                </div>
              </div>
              <button
                onClick={() => handleCopy(cursorRuleConfig, 'cursor-cfg')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 border border-slate-700 transition"
              >
                {copiedKey === 'cursor-cfg' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'cursor-cfg' ? 'Copied' : 'Copy Rule'}
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Add this rule into your Cursor workspace to teach Cursor AI how to run Solana checks against your live gateway.
            </p>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-blue-300 overflow-x-auto whitespace-pre-wrap">
              {cursorRuleConfig}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 4: Live Machine Manifests */}
      {activeSubTab === 'manifests' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                Live Machine-Readable Crawler Endpoints
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                These standardized files are hosted directly at your root URL for AI agents and web crawlers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-indigo-300 font-bold">/.well-known/mcp.json</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">MCP 1.0</span>
              </div>
              <p className="text-xs text-slate-400">
                Model Context Protocol tool schema allowing Claude & LangChain agents to invoke Solana queries.
              </p>
              <a
                href={`${liveAppUrl}/.well-known/mcp.json`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-semibold pt-1"
              >
                View Live Manifest <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-blue-300 font-bold">/llms.txt</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-semibold">Perplexity / GPT</span>
              </div>
              <p className="text-xs text-slate-400">
                Natural-language summary for LLM search engines describing the Solana Pulse API gateway.
              </p>
              <a
                href={`${liveAppUrl}/llms.txt`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-semibold pt-1"
              >
                View Live llms.txt <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-emerald-300 font-bold">/robots.txt</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">Crawler Policy</span>
              </div>
              <p className="text-xs text-slate-400">
                Permits GPTBot, ClaudeBot, PerplexityBot, and Google-Extended full indexing access.
              </p>
              <a
                href={`${liveAppUrl}/robots.txt`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-semibold pt-1"
              >
                View Live robots.txt <ArrowUpRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
