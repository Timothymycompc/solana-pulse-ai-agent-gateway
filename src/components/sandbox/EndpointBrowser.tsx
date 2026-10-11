import React from 'react';
import { Search } from 'lucide-react';
import { ApiEndpoint } from '../../types';
import { HTTP_ROUTE_TOOLS, priceOf } from '../../../pricing';

// Price badge for a playground entry; account and status routes are free.
const priceTag = (ep: ApiEndpoint) => {
  const tool = ep.id.startsWith('mcp-') ? ep.id.slice(4) : HTTP_ROUTE_TOOLS[ep.path];
  if (!tool) return 'Free';
  const price = priceOf(tool);
  return `${ep.id.startsWith('mcp-') ? 'MCP · ' : ''}${price ? `3 free, then ${price}` : 'Free'}`;
};

interface EndpointBrowserProps {
  filteredEndpoints: ApiEndpoint[];
  selectedEndpoint: ApiEndpoint;
  selectedSuite: string;
  setSelectedSuite: (suite: 'all' | 'safety' | 'intel' | 'free' | 'keys') => void;
  methodFilter: string;
  setMethodFilter: (method: 'all' | 'GET' | 'POST') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSelectEndpoint: (ep: ApiEndpoint) => void;
}

export const EndpointBrowser: React.FC<EndpointBrowserProps> = ({
  filteredEndpoints,
  selectedEndpoint,
  selectedSuite,
  setSelectedSuite,
  methodFilter,
  setMethodFilter,
  searchQuery,
  setSearchQuery,
  handleSelectEndpoint,
}) => {
  return (
    <div className="lg:col-span-5 glass border rounded-2xl p-4 flex flex-col h-[740px]">
      {/* Filters */}
      <div className="space-y-3 pb-3 border-b border-white/10">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search a question, e.g. wallet, token risk, fees"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full glass-inset border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 transition focus:outline-none focus:border-indigo-400/70 focus:ring-4 focus:ring-indigo-500/15"
          />
        </div>

        <p className="text-[10px] leading-4 text-slate-400">Pick a task. Examples have sample values and use the tool's 3 free calls first.</p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {(['all', 'safety', 'intel', 'free', 'keys'] as const).map((suite) => (
              <button
                key={suite}
                onClick={() => setSelectedSuite(suite)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                  selectedSuite === suite
                    ? 'bg-accent-gradient text-white shadow-md shadow-indigo-950/50'
                    : 'glass-inset text-slate-300 hover:text-white border border-white/10'
                }`}
              >
                {{ all: 'All', safety: 'Transactions', intel: 'Tokens', free: 'Core data', keys: 'Pricing' }[suite]}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {(['all', 'GET', 'POST'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethodFilter(m)}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition ${
                  methodFilter === m
                    ? 'bg-white/15 text-white'
                    : 'glass-inset text-slate-300 hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Endpoint List */}
      <div key={`${selectedSuite}-${methodFilter}-${searchQuery}`} className="flex-1 overflow-y-auto pt-2 space-y-1 pr-1">
        {filteredEndpoints.map((ep, i) => {
          const isSelected = selectedEndpoint.id === ep.id;
          return (
            <button
              key={ep.id}
              onClick={() => handleSelectEndpoint(ep)}
              aria-current={isSelected ? 'true' : undefined}
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              className={`animate-fade-up w-full text-left p-3 rounded-xl transition-all duration-300 flex flex-col gap-1 group ${
                isSelected
                  ? 'gradient-border bg-indigo-500/10 shadow-lg shadow-indigo-950/60 translate-x-0.5'
                  : 'hover:bg-white/5 hover:translate-x-0.5 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      ep.method === 'GET'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25'
                        : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/25'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="text-xs font-semibold text-slate-100 group-hover:text-white line-clamp-1">
                    {ep.name}
                  </span>
                </div>
                <span className={`text-[10px] font-medium ${priceTag(ep) === 'Free' ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {priceTag(ep)}
                </span>
              </div>

              <p className="text-[11px] font-mono text-slate-400 line-clamp-1">{ep.id.startsWith('mcp-') ? `POST /mcp · ${ep.id.slice(4)}` : ep.path}</p>
              <p className="text-[11px] text-slate-400 line-clamp-1">{ep.summary}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
