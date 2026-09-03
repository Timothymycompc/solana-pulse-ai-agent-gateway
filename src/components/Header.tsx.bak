import React from 'react';
import { Shield, Activity, FileSearch, Terminal, Wrench, RefreshCw, Coins, Globe, Wallet, Bot, Sparkles, Lock } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scanner' | 'api' | 'solana_rpc' | 'devnet_wallet' | 'promo' | 'ai_discovery' | 'diagnostic' | 'scripts' | 'monetization' | 'owner_analytics';
  setActiveTab: (tab: 'scanner' | 'api' | 'solana_rpc' | 'devnet_wallet' | 'promo' | 'ai_discovery' | 'diagnostic' | 'scripts' | 'monetization' | 'owner_analytics') => void;
  gatewayStatus: 'online' | 'offline' | 'checking';
  isServerRunning: boolean;
  onToggleServer: () => void;
  onRefreshHealth: () => void;
  totalScannedFiles: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  gatewayStatus,
  isServerRunning,
  onToggleServer,
  onRefreshHealth,
  totalScannedFiles,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">
                Solana Pulse AI Agent Gateway
              </h1>
              <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                MCP 1.0 Ready
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Real-time Solana Blockchain RPC Bridge, Devnet Broadcaster, and MCP Tools for Autonomous LLMs.
            </p>
          </div>
        </div>

        {/* Navigation & Status */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Health Pill */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onRefreshHealth}
              title="Click to re-ping API Gateway"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition text-xs font-medium ${
                gatewayStatus === 'online'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/40'
                  : gatewayStatus === 'offline'
                  ? 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800'
                  : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-300'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {gatewayStatus === 'online' && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    gatewayStatus === 'online'
                      ? 'bg-emerald-400'
                      : gatewayStatus === 'offline'
                      ? 'bg-slate-500'
                      : 'bg-indigo-400'
                  }`}
                />
              </span>
              <span>
                Gateway:{' '}
                <strong
                  className={
                    gatewayStatus === 'online'
                      ? 'text-emerald-400 font-bold'
                      : gatewayStatus === 'offline'
                      ? 'text-slate-400 font-normal'
                      : 'text-indigo-300'
                  }
                >
                  {gatewayStatus === 'online' ? 'Active (:3000) • 60 Live' : gatewayStatus === 'offline' ? 'Standby (Offline)' : 'Pinging Gateway...'}
                </strong>
              </span>
              <RefreshCw className="w-3 h-3 text-slate-400 hover:text-slate-200 transition" />
            </button>
          </div>

          {/* Tab navigation */}
          <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl flex-wrap">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'scanner'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileSearch className="w-3.5 h-3.5" />
              File Visibility
              {totalScannedFiles > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-indigo-950 text-indigo-300 rounded text-[10px]">
                  {totalScannedFiles}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('api')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'api'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              60-Endpoint Sandbox
            </button>

            <button
              onClick={() => setActiveTab('solana_rpc')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'solana_rpc'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-purple-400 hover:text-purple-300'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Solana RPC
            </button>

            <button
              onClick={() => setActiveTab('devnet_wallet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'devnet_wallet'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-indigo-400 hover:text-indigo-300'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              Devnet Wallet & Broadcaster
            </button>

            <button
              onClick={() => setActiveTab('promo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'promo'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm ring-1 ring-purple-400/50'
                  : 'text-purple-300 hover:text-purple-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              Automated Promotion
            </button>

            <button
              onClick={() => setActiveTab('ai_discovery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'ai_discovery'
                  ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/50'
                  : 'text-blue-400 hover:text-blue-300'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-blue-300" />
              AI Agent Growth & SEO
            </button>

            <button
              onClick={() => setActiveTab('diagnostic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'diagnostic'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              Diagnostic Hub
            </button>

            <button
              onClick={() => setActiveTab('scripts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'scripts'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Bash Setup
            </button>

            <button
              onClick={() => setActiveTab('monetization')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'monetization'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              Monetize APIs
            </button>

            <button
              onClick={() => setActiveTab('owner_analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'owner_analytics'
                  ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-sm ring-1 ring-amber-400/50'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-300" />
              Owner Portal & Stats
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
