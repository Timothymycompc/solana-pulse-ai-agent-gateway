import React, { useState } from 'react';
import {
  Coins,
  Bot,
  Key,
  ShieldCheck,
  Zap,
  TrendingUp,
  DollarSign,
  Copy,
  Check,
  QrCode,
  Sparkles,
  Cpu,
  Layers,
  ArrowUpRight,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Eye,
  AlertCircle,
  BarChart3,
  Globe2,
  Flame,
  Search,
  Lock,
  Radio,
  FileCode,
  CheckSquare,
  Clock,
  Send
} from 'lucide-react';

interface ApiTier {
  id: string;
  name: string;
  priceSol: number;
  priceUsd: number;
  requestAllowance: number;
  rateLimitRps: number;
  features: string[];
  recommended?: boolean;
}

interface MarketInsight {
  metric: string;
  value: string;
  change: string;
  details: string;
}

const SOLANA_AI_MARKET_DATA: MarketInsight[] = [
  {
    metric: 'Daily Non-Vote Transactions',
    value: '112M - 169.9M / day',
    change: '+142% YoY',
    details: 'Real application & agent activity on Solana without validator voting noise.'
  },
  {
    metric: 'AI Agent Payment Volume',
    value: '$31 Billion+',
    change: 'Exponential',
    details: 'Autonomous trading bots, sniper tools, and agent launchpads transacting on-chain.'
  },
  {
    metric: 'Average Network Latency',
    value: '150ms - 400ms',
    change: 'Sub-second',
    details: 'With Firedancer upgrades, Solana executes agent tool calls faster than Ethereum or L2s.'
  },
  {
    metric: 'Avg Transaction Cost',
    value: '$0.00025 - $0.001',
    change: 'Cost leader',
    details: 'Enables profitable micro-metering per endpoint call without burning user margins.'
  }
];

const PRICING_TIERS: ApiTier[] = [
  {
    id: 'starter',
    name: 'AI Agent Micro-Tier',
    priceSol: 0.05,
    priceUsd: 8.50,
    requestAllowance: 2500,
    rateLimitRps: 10,
    features: [
      'Access to all 20 Solana Pulse Endpoints',
      'Standard Slot Height & Risk Scoring',
      'JSON RPC 2.0 & REST support',
      'Termux / Python native headers'
    ]
  },
  {
    id: 'pro',
    name: 'Autonomous Agent Pro (x402)',
    priceSol: 0.25,
    priceUsd: 42.50,
    requestAllowance: 25000,
    rateLimitRps: 50,
    features: [
      'Full 60-Endpoint Master Suite (Solana, MCP, DataWeave)',
      'x402 Auto-Payment Protocol Support',
      'Sub-50ms priority websocket stream',
      'Live Gemini-assisted Prompt Optimizer',
      'Zero-rate-limit surge bursts'
    ],
    recommended: true
  },
  {
    id: 'enterprise',
    name: 'AI Swarm / Institutional',
    priceSol: 1.20,
    priceUsd: 204.00,
    requestAllowance: 200000,
    rateLimitRps: 200,
    features: [
      'Unlimited AI agent worker connections',
      'Dedicated private RPC load-balancer',
      'Custom MCP custom tool registration',
      'SLA guarantee & autonomous webhook alerts'
    ]
  }
];

export const AgentMonetizationStudio: React.FC = () => {
  const [selectedTier, setSelectedTier] = useState<string>('pro');
  const [walletAddress, setWalletAddress] = useState<string>('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
  const [generatedKey, setGeneratedKey] = useState<string>('gw_live_agent_8f992a10e4b7c61d5e3');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [activeTab, setActiveTab] = useState<'tiers' | 'headers_inspector' | 'market_research' | 'x402_protocol' | 'ai_optimizer' | 'mcp_manifest'>('headers_inspector');

  // Header Sandbox Interactive State
  const [inputApiKey, setInputApiKey] = useState('gw_live_agent_8f992a10e4b7c61d5e3');
  const [inputAgentId, setInputAgentId] = useState('claude-desktop-trader-01');
  const [inputSolSignature, setInputSolSignature] = useState('');
  const [testEndpoint, setTestEndpoint] = useState('/v1/solana/token/risk-score?mint=So11111111111111111111111111111111111111112');
  const [headerValidationResult, setHeaderValidationResult] = useState<{
    status: number;
    authorized: boolean;
    tier: string;
    rateLimitRemaining: number;
    responsePayload: string;
  } | null>({
    status: 200,
    authorized: true,
    tier: 'Autonomous Agent Pro (x402)',
    rateLimitRemaining: 24982,
    responsePayload: JSON.stringify({
      status: "success",
      authorized_agent: "claude-desktop-trader-01",
      token: "SOL (Wrapped SOL)",
      risk_score: 4.2,
      risk_level: "LOW_RISK",
      liquidity_pool_depth_usd: 124800000,
      slot_height: 314892104,
      cost_deducted_sol: 0.00001
    }, null, 2)
  });

  // AI Optimizer State
  const [targetTask, setTargetTask] = useState<string>('Audit a newly minted Solana meme token on Raydium for freeze authority and rug risks');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [aiOptimizedPlan, setAiOptimizedPlan] = useState<{
    bestEndpoints: string[];
    estimatedCredits: number;
    recommendedPricingSol: number;
    generatedMcpPayload: string;
    revenueProjection: string;
  } | null>({
    bestEndpoints: [
      'GET /v1/solana/token/risk-score?mint=...',
      'GET /v1/solana/liquidity/pool-depth?pair=...',
      'POST /v1/solana/tx/simulate-trade'
    ],
    estimatedCredits: 3,
    recommendedPricingSol: 0.0003,
    generatedMcpPayload: JSON.stringify({
      name: "solana_token_safety_bundle",
      description: "Executes instant risk scoring, liquidity depth check, and live transaction simulation in 1 atomic pipeline.",
      parameters: {
        type: "object",
        properties: {
          token_mint: { type: "string", description: "Solana Base58 Mint Address" },
          slippage_bps: { type: "number", default: 100 }
        },
        required: ["token_mint"]
      }
    }, null, 2),
    revenueProjection: "$480 - $1,850 / month based on 15,000 automated autonomous agent calls."
  });

  const handleTestHeaders = () => {
    if (!inputApiKey && !inputSolSignature) {
      setHeaderValidationResult({
        status: 402,
        authorized: false,
        tier: 'UNAUTHENTICATED',
        rateLimitRemaining: 0,
        responsePayload: JSON.stringify({
          error: "Payment Required (HTTP 402)",
          message: "No valid X-API-Key or X-Solana-Signature header provided.",
          payout_wallet: walletAddress,
          unlock_price_sol: 0.0022,
          instructions: "Transmit on-chain payment or provide valid X-API-Key header to proceed."
        }, null, 2)
      });
    } else {
      setHeaderValidationResult({
        status: 200,
        authorized: true,
        tier: 'Autonomous Agent Pro (x402)',
        rateLimitRemaining: 24981,
        responsePayload: JSON.stringify({
          status: "success",
          authorized_agent: inputAgentId || "anonymous-agent",
          api_key_valid: true,
          endpoint: testEndpoint,
          slot_height: 314892104,
          data: {
            mint: "So11111111111111111111111111111111111111112",
            is_freeze_disabled: true,
            is_mint_revoked: true,
            top_10_holders_percent: "14.2%",
            overall_safety_rating: "A+"
          }
        }, null, 2)
      });
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(generatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  const handleGenerateAiMonetizationPlan = () => {
    setIsGeneratingPlan(true);
    setTimeout(() => {
      setIsGeneratingPlan(false);
      setAiOptimizedPlan({
        bestEndpoints: [
          'GET /v1/solana/token/risk-score',
          'GET /v1/solana/slot/height',
          'POST /v1/mcp/invoke-tool',
          'POST /v1/dataweave/ml/predict-volatility'
        ],
        estimatedCredits: 4,
        recommendedPricingSol: 0.00045,
        generatedMcpPayload: JSON.stringify({
          name: "autonomous_agent_market_intelligence",
          description: `Custom AI pipeline tuned for: ${targetTask}`,
          parameters: {
            task_context: targetTask,
            max_risk_tolerance: "low",
            execution_speed: "instant"
          }
        }, null, 2),
        revenueProjection: "$750 - $2,400 / month with 25 autonomous AI trading agents connected."
      });
    }, 900);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950/70 via-slate-900 to-cyan-950/70 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Coins className="w-64 h-64 text-indigo-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                Autonomous AI Agent Monetization
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                HTTP 402 / Solana Pay Ready
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Sell Your 60 API Endpoints to Autonomous AI Agents
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              AI agents (Claude, AutoGPT, LangChain, Solana sniper bots) can automatically discover your tools, pay you in SOL or USDC micro-payments via the x402 protocol, and query your master gateway 24/7.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => setActiveTab('x402_protocol')}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-600/30"
            >
              <Coins className="w-4 h-4" />
              Configure Solana Paywall
            </button>
            <button
              onClick={() => setActiveTab('ai_optimizer')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              AI Pricing Optimizer
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex border-b border-slate-800 space-x-6 text-sm font-medium overflow-x-auto">
        <button
          onClick={() => setActiveTab('headers_inspector')}
          className={`pb-3 flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === 'headers_inspector'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="w-4 h-4 text-emerald-400" />
          API Key & Headers Live Lab
        </button>

        <button
          onClick={() => setActiveTab('market_research')}
          className={`pb-3 flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === 'market_research'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe2 className="w-4 h-4 text-cyan-400" />
          Solana Market Research & Client Timelines
        </button>

        <button
          onClick={() => setActiveTab('tiers')}
          className={`pb-3 flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === 'tiers'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Pricing Tiers & Subscriptions
        </button>

        <button
          onClick={() => setActiveTab('x402_protocol')}
          className={`pb-3 flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === 'x402_protocol'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          HTTP 402 Autonomous Paywall
        </button>

        <button
          onClick={() => setActiveTab('ai_optimizer')}
          className={`pb-3 flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === 'ai_optimizer'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          AI Feature Bundler & Profit Estimator
        </button>

        <button
          onClick={() => setActiveTab('mcp_manifest')}
          className={`pb-3 flex items-center gap-2 border-b-2 whitespace-nowrap transition ${
            activeTab === 'mcp_manifest'
              ? 'border-indigo-500 text-indigo-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bot className="w-4 h-4 text-indigo-400" />
          MCP Agent Discovery (mcp.json)
        </button>
      </div>

      {/* TAB 0: API KEY & HEADERS LIVE LAB */}
      {activeTab === 'headers_inspector' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-400" />
                  API Key & Request Headers Inspector
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Test and inspect incoming authentication headers (<code className="text-emerald-300 font-mono">X-API-Key</code>, <code className="text-cyan-300 font-mono">X-Agent-ID</code>, and <code className="text-amber-300 font-mono">X-Solana-Signature</code>) that gate your 60 endpoints.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-mono font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Header Guard: ACTIVE
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
              {/* Left Column: Configurable Headers Form */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>1. API Key Header (`X-API-Key`)</span>
                    <button
                      onClick={() => setInputApiKey(generatedKey)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Fill Generated Key
                    </button>
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={inputApiKey}
                      onChange={(e) => setInputApiKey(e.target.value)}
                      placeholder="e.g. gw_live_agent_..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => setInputApiKey('')}
                      className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 text-xs transition"
                      title="Clear to test 402 Unauthorized"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">
                    2. AI Agent Identifier (`X-Agent-ID`)
                  </label>
                  <input
                    type="text"
                    value={inputAgentId}
                    onChange={(e) => setInputAgentId(e.target.value)}
                    placeholder="e.g. claude-desktop-agent-v1"
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">
                    3. Solana On-Chain Payment Signature (`X-Solana-Signature`)
                  </label>
                  <input
                    type="text"
                    value={inputSolSignature}
                    onChange={(e) => setInputSolSignature(e.target.value)}
                    placeholder="e.g. 5x8Q... (used for instant x402 pay-per-call unlock)"
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">
                    Target Endpoint to Verify
                  </label>
                  <select
                    value={testEndpoint}
                    onChange={(e) => setTestEndpoint(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="/v1/solana/token/risk-score?mint=So11111111111111111111111111111111111111112">
                      GET /v1/solana/token/risk-score
                    </option>
                    <option value="/v1/solana/slot/height">GET /v1/solana/slot/height</option>
                    <option value="/v1/mcp/discover-tools">GET /v1/mcp/discover-tools</option>
                    <option value="/v1/dataweave/ml/predict-volatility">POST /v1/dataweave/ml/predict-volatility</option>
                  </select>
                </div>

                <button
                  onClick={handleTestHeaders}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                >
                  <Send className="w-3.5 h-3.5" />
                  Simulate Authorized Header Request
                </button>
              </div>

              {/* Right Column: Live Header Validation Results & cURL */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-300">
                      Incoming Header Validation Result
                    </span>
                    {headerValidationResult && (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                          headerValidationResult.status === 200
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        HTTP {headerValidationResult.status} {headerValidationResult.authorized ? 'AUTHORIZED' : 'UNAUTHORIZED'}
                      </span>
                    )}
                  </div>

                  {headerValidationResult && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 block uppercase">Identified Tier</span>
                          <span className="font-bold text-indigo-300 text-xs">{headerValidationResult.tier}</span>
                        </div>
                        <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                          <span className="text-[10px] text-slate-400 block uppercase">Remaining Credits</span>
                          <span className="font-bold text-emerald-400 text-xs">
                            {headerValidationResult.rateLimitRemaining.toLocaleString()} reqs
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">
                          Gateway Response Payload:
                        </span>
                        <pre className="p-3 bg-slate-900 rounded-lg text-[11px] font-mono text-slate-200 overflow-x-auto max-h-48 border border-slate-800">
                          {headerValidationResult.responsePayload}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>

                {/* Generated cURL with Headers */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-300">Generated cURL for AI Agent integration</span>
                    <button
                      onClick={() => {
                        const curl = `curl -X GET "http://localhost:3000${testEndpoint}" \\\n  -H "X-API-Key: ${inputApiKey}" \\\n  -H "X-Agent-ID: ${inputAgentId}" \\\n  -H "Accept: application/json"`;
                        navigator.clipboard.writeText(curl);
                        alert('cURL command copied!');
                      }}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                    >
                      <Copy className="w-3 h-3" />
                      Copy cURL
                    </button>
                  </div>
                  <pre className="p-2.5 bg-slate-900 rounded-lg text-[10px] font-mono text-indigo-300 overflow-x-auto border border-slate-800">
{`curl -X GET "http://localhost:3000${testEndpoint}" \\
  -H "X-API-Key: ${inputApiKey || '<YOUR_KEY>'}" \\
  -H "X-Agent-ID: ${inputAgentId}" \\
  -H "Accept: application/json"`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: SOLANA MARKET RESEARCH & CLIENT TIMELINES */}
      {activeTab === 'market_research' && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SOLANA_AI_MARKET_DATA.map((item, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    {item.metric}
                  </span>
                  <h4 className="text-xl font-extrabold text-white mt-1">
                    {item.value}
                  </h4>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-300 font-medium">
                    {item.details}
                  </span>
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-bold shrink-0">
                    {item.change}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Timeline & Strategy Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-400" />
                How Long It Takes to Build Up the 15,000+ AI Agent Client Base
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Unlike human consumers who take months of sales cycles, <strong>autonomous AI agents integrate and consume APIs via automated discovery within hours to days</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-slate-950 p-5 rounded-xl border border-indigo-500/30 space-y-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                  Phase 1: Week 1 - 2
                </span>
                <h4 className="text-sm font-bold text-white">Direct Agent Integration (1 - 5 Clients)</h4>
                <p className="text-xs text-slate-400">
                  Connect your own local Claude Desktop, Telegram sniping bots, and automated trading scripts using your generated <code className="text-indigo-300 font-mono">X-API-Key</code>.
                </p>
                <div className="pt-2 text-xs font-bold text-indigo-400">
                  Target: ~500 - 1,500 daily test calls (~$15 - $45/mo)
                </div>
              </div>

              <div className="bg-slate-950 p-5 rounded-xl border border-cyan-500/30 space-y-2">
                <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
                  Phase 2: Week 3 - 5
                </span>
                <h4 className="text-sm font-bold text-white">Public MCP Directory Listing (10 - 50 AI Swarms)</h4>
                <p className="text-xs text-slate-400">
                  Publish your <code className="text-cyan-300 font-mono">mcp.json</code> manifest on GitHub MCP registries, LangChain Tool Hubs, and Solana developer Discords.
                </p>
                <div className="pt-2 text-xs font-bold text-cyan-400">
                  Target: 5,000 - 15,000 automated calls (~$480 - $1,200/mo)
                </div>
              </div>

              <div className="bg-slate-950 p-5 rounded-xl border border-emerald-500/30 space-y-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                  Phase 3: Month 2+
                </span>
                <h4 className="text-sm font-bold text-white">Autonomous x402 On-Chain Flywheel</h4>
                <p className="text-xs text-slate-400">
                  Autonomous agents discover your endpoints via on-chain indexers and automatically pay micro-transactions in SOL without any human sales friction.
                </p>
                <div className="pt-2 text-xs font-bold text-emerald-400">
                  Target: 25,000 - 100,000+ monthly calls ($1,850 - $5,000+/mo)
                </div>
              </div>
            </div>

            {/* Why Solana AI Agents Pay For These 60 Endpoints */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" />
                Why AI Agents Specifically Pay For These 3 Route Clusters:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <strong className="text-indigo-300 block mb-1">1. Solana Pulse (20 routes)</strong>
                  <span className="text-slate-400">Instant rug-score & transaction simulation saves traders thousands in failed slippage and honeypots.</span>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <strong className="text-cyan-300 block mb-1">2. MCP Core (20 routes)</strong>
                  <span className="text-slate-400">Gives autonomous LLMs an instant execution sandbox to run code and validate tool schemas.</span>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                  <strong className="text-emerald-300 block mb-1">3. DataWeave ML (20 routes)</strong>
                  <span className="text-slate-400">High-speed volatility prediction and sentiment classification without heavy GPU overhead.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: PRICING TIERS */}
      {activeTab === 'tiers' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.id}
                onClick={() => setSelectedTier(tier.id)}
                className={`relative rounded-2xl p-6 cursor-pointer border transition flex flex-col justify-between ${
                  selectedTier === tier.id
                    ? 'bg-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                {tier.recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-[11px] font-bold shadow-md">
                    Most Popular for AI Agents
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                    <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-indigo-400">
                      <Coins className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-white">{tier.priceSol} SOL</span>
                    <span className="text-xs text-slate-400">/ mo (~${tier.priceUsd})</span>
                  </div>

                  <p className="text-xs text-slate-400 mt-2 font-medium">
                    Allowance: <strong className="text-indigo-300">{tier.requestAllowance.toLocaleString()} requests</strong> ({tier.rateLimitRps} req/s)
                  </p>

                  <div className="border-t border-slate-800 my-4" />

                  <ul className="space-y-2.5">
                    {tier.features.map((feature, idx) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800">
                  <button
                    className={`w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      selectedTier === tier.id
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {selectedTier === tier.id ? 'Selected Tier' : 'Select Plan'}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick API Key Generator Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-400" />
              Direct Agent API Key Provisioning
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Issue an authentication token for client AI bots or use the automated x402 on-chain paywall.
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Your Solana Payout Wallet</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={walletAddress}
                    onChange={(e) => setWalletAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleCopyWallet}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-xs font-semibold transition flex items-center gap-1 shrink-0"
                  >
                    {copiedWallet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedWallet ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Active Test API Key (Header: X-API-Key)</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedKey}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none"
                  />
                  <button
                    onClick={handleCopyKey}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white text-xs font-semibold transition flex items-center gap-1 shrink-0"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HTTP 402 AUTONOMOUS PAYWALL PROTOCOL */}
      {activeTab === 'x402_protocol' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  How the Autonomous x402 Solana Paywall Works
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  AI agents operate without human credit cards. When an AI hits your API with no credits, your server responds with HTTP 402 and your Solana address. The agent pays automatically on-chain.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-xs font-bold text-indigo-400">Step 1: AI Agent Request</span>
                <p className="text-xs text-slate-300 mt-2">
                  An AI agent invokes:
                  <br />
                  <code className="text-slate-400 text-[11px]">GET /v1/solana/token/risk-score</code>
                </p>
                <div className="mt-3 p-2 bg-slate-900 rounded font-mono text-[10px] text-slate-400">
                  Headers: {'{'} "X-Agent-ID": "claude-trader-01" {'}'}
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30">
                <span className="text-xs font-bold text-amber-400">Step 2: HTTP 402 Challenge</span>
                <p className="text-xs text-slate-300 mt-2">
                  Gateway returns 402 with price (e.g. 0.001 SOL) and your recipient wallet.
                </p>
                <div className="mt-3 p-2 bg-slate-900 rounded font-mono text-[10px] text-amber-300">
                  HTTP/1.1 402 Payment Required
                  <br />
              payto: {walletAddress.slice(0, 10)}... price: 0.0022 SOL
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30">
                <span className="text-xs font-bold text-emerald-400">Step 3: Instant Execution</span>
                <p className="text-xs text-slate-300 mt-2">
                  Agent broadcasts micro-tx, passes signature, and receives live 60-endpoint payload.
                </p>
                <div className="mt-3 p-2 bg-slate-900 rounded font-mono text-[10px] text-emerald-300">
                  HTTP/1.1 200 OK
                  <br />
                  status: "settled_on_chain"
                </div>
              </div>
            </div>

            {/* Python FastAPI Implementation Code */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300">
                  FastAPI x402 Middleware Code (`middleware/x402_paywall.py`)
                </span>
                <span className="text-[11px] text-indigo-400 font-mono">Pure Python • Zero Rust</span>
              </div>
              <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto">
{`from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse

WALLET_RECIPIENT = "${walletAddress}"
PRICE_PER_REQUEST_SOL = 0.0022

async def x402_solana_paywall_middleware(request: Request, call_next):
    # Check if request has pre-paid API key or on-chain tx signature
    api_key = request.headers.get("X-API-Key")
    sol_tx_sig = request.headers.get("X-Solana-Signature")

    if not api_key and not sol_tx_sig:
        return JSONResponse(
            status_code=402,
            content={
                "error": "Payment Required",
                "message": "Autonomous Agent Access: Please send micro-payment to unlock 60 endpoints.",
                "recipient_wallet": WALLET_RECIPIENT,
                "amount_sol": PRICE_PER_REQUEST_SOL,
                "currency": "SOL",
                "payment_standard": "x402_solana_pay"
            },
            headers={"WWW-Authenticate": f'SolanaPay recipient="{WALLET_RECIPIENT}" amount="{PRICE_PER_REQUEST_SOL}"'}
        )

    response = await call_next(request)
    return response`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AI FEATURE BUNDLER & PRICING OPTIMIZER */}
      {activeTab === 'ai_optimizer' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              AI Prompt-to-API Bundle Optimizer
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Tell the optimizer what type of AI agents you want to sell to (e.g. trading bots, Telegram agent assistants, data scrapers). It will bundle your 60 endpoints into high-margin packages.
            </p>

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={targetTask}
                onChange={(e) => setTargetTask(e.target.value)}
                placeholder="e.g. Autonomous Solana arbitrage bot seeking real-time pool depth"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleGenerateAiMonetizationPlan}
                disabled={isGeneratingPlan}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 shrink-0"
              >
                {isGeneratingPlan ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Optimizing Bundle...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Monetization Bundle
                  </>
                )}
              </button>
            </div>

            {aiOptimizedPlan && (
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                  <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    Recommended Endpoint Bundle
                  </h4>
                  <ul className="space-y-2">
                    {aiOptimizedPlan.bestEndpoints.map((ep, i) => (
                      <li key={i} className="text-xs font-mono bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 text-emerald-400 flex items-center justify-between">
                        <span>{ep}</span>
                        <span className="text-[10px] text-slate-400">1 Credit</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Suggested Price per Bundle Run:</span>
                    <strong className="text-amber-400 font-bold">{aiOptimizedPlan.recommendedPricingSol} SOL (~$0.07)</strong>
                  </div>

                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4" />
                      Projected Revenue Potential
                    </span>
                    <p className="text-xs text-slate-300 mt-1">
                      {aiOptimizedPlan.revenueProjection}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      Generated MCP Agent Tool Definition
                    </h4>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800 font-mono">
                      Claude / Cursor Compatible
                    </span>
                  </div>
                  <pre className="p-3 bg-slate-900 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64">
                    {aiOptimizedPlan.generatedMcpPayload}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: MCP MANIFEST (mcp.json) */}
      {activeTab === 'mcp_manifest' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-indigo-400" />
                Live Model Context Protocol (MCP) Manifest
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Save this manifest as <code className="text-indigo-300 font-mono">mcp.json</code> or query <code className="text-indigo-300 font-mono">GET /v1/mcp/discover-tools</code> so any AI client connects instantly.
              </p>
            </div>
            <button
              onClick={() => {
                const manifest = JSON.stringify({
                  mcpServers: {
                    master_gateway: {
                      url: "http://localhost:3000/v1/mcp",
                      transport: "http",
                      auth: {
                        type: "bearer_or_x402",
                        wallet: walletAddress
                      }
                    }
                  }
                }, null, 2);
                navigator.clipboard.writeText(manifest);
                alert('Copied MCP manifest to clipboard!');
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy mcp.json
            </button>
          </div>

          <pre className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto">
{`{
  "mcpVersion": "1.0.0",
  "gateway": "Enterprise Master Suite (Solana, MCP, DataWeave)",
  "baseUrl": "http://localhost:3000",
  "totalEndpoints": 60,
  "monetization": {
    "protocol": "x402_solana_pay",
    "payoutWallet": "${walletAddress}",
    "currency": "SOL",
    "pricePerCall": 0.0022
  },
  "toolGroups": [
    {
      "name": "SolanaPulse",
      "count": 20,
      "description": "On-chain token risk scoring, live slot height, liquidity depth, and transaction simulation"
    },
    {
      "name": "MCPCore",
      "count": 20,
      "description": "Agent tool discovery, schema validation, session execution, and autonomous dispatch"
    },
    {
      "name": "DataWeaveML",
      "count": 20,
      "description": "Pure-Python vectorization, volatility prediction, sentiment analysis, and payload transformation"
    }
  ]
}`}
          </pre>
        </div>
      )}
    </div>
  );
};
