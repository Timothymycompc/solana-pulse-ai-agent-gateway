import React from 'react';
import { Shield, Sparkles, Layers } from 'lucide-react';

interface SuiteOverviewProps {
  selectedSuite: string;
  setSelectedSuite: (suite: 'all' | 'solana' | 'mcp' | 'dataweave') => void;
}

export const SuiteOverview: React.FC<SuiteOverviewProps> = ({ selectedSuite, setSelectedSuite }) => {
  const suites = [
    {
      id: 'solana',
      name: 'SolanaPulse Suite',
      count: '20 Endpoints',
      desc: 'Token risk score, holder clusters, PnL, gas fees',
      icon: Shield,
      color: 'indigo',
    },
    {
      id: 'mcp',
      name: 'MCP Agentic Core',
      count: '20 Endpoints',
      desc: 'Tool discovery, guardrails, JSON repair, session memory',
      icon: Sparkles,
      color: 'purple',
    },
    {
      id: 'dataweave',
      name: 'DataWeave ML Suite',
      count: '20 Endpoints',
      desc: 'Vector embeddings, cosine distance, RAG chunking',
      icon: Layers,
      color: 'cyan',
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {suites.map((suite) => {
        const Icon = suite.icon;
        const isActive = selectedSuite === suite.id;
        const colorClass = {
          indigo: isActive ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/10' : 'bg-slate-900 border-slate-800 hover:border-slate-700',
          purple: isActive ? 'bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-500/10' : 'bg-slate-900 border-slate-800 hover:border-slate-700',
          cyan: isActive ? 'bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-500/10' : 'bg-slate-900 border-slate-800 hover:border-slate-700',
        }[suite.color];

        const textClass = {
          indigo: 'text-indigo-400',
          purple: 'text-purple-400',
          cyan: 'text-cyan-400',
        }[suite.color];

        return (
          <button
            key={suite.id}
            onClick={() => setSelectedSuite(suite.id as any)}
            className={`p-4 rounded-2xl border text-left transition ${colorClass}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase ${textClass}`}>{suite.name}</span>
              <Icon className={`w-4 h-4 ${textClass}`} />
            </div>
            <p className="text-xl font-bold text-white mt-1">{suite.count}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{suite.desc}</p>
          </button>
        );
      })}
    </div>
  );
};
