import React from 'react';
import { Search } from 'lucide-react';
import { ApiEndpoint } from '../../types';

interface EndpointBrowserProps {
  filteredEndpoints: ApiEndpoint[];
  selectedEndpoint: ApiEndpoint;
  selectedSuite: string;
  setSelectedSuite: (suite: 'all' | 'solana' | 'mcp' | 'dataweave') => void;
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
    <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[740px]">
      {/* Filters */}
      <div className="space-y-3 pb-3 border-b border-slate-800">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search endpoints by name, path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(['all', 'solana', 'mcp', 'dataweave'] as const).map((suite) => (
              <button
                key={suite}
                onClick={() => setSelectedSuite(suite)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                  selectedSuite === suite
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {suite}
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
                    ? 'bg-slate-700 text-white'
                    : 'bg-slate-950 text-slate-500 hover:text-slate-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Endpoint List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 pt-2 space-y-1 pr-1">
        {filteredEndpoints.map((ep) => {
          const isSelected = selectedEndpoint.id === ep.id;
          return (
            <button
              key={ep.id}
              onClick={() => handleSelectEndpoint(ep)}
              className={`w-full text-left p-3 rounded-xl transition flex flex-col gap-1 group ${
                isSelected
                  ? 'bg-indigo-950/40 border border-indigo-500/50 shadow-md shadow-indigo-950'
                  : 'hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      ep.method === 'GET'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    }`}
                  >
                    {ep.method}
                  </span>
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-white line-clamp-1">
                    {ep.name}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono capitalize">
                  {ep.suite}
                </span>
              </div>

              <p className="text-[11px] font-mono text-slate-400 line-clamp-1">{ep.path}</p>
              <p className="text-[11px] text-slate-500 line-clamp-1">{ep.summary}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
