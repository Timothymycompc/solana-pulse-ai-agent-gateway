import React from "react";
import { Shield, Sparkles, Layers, Key } from "lucide-react";
import { API_ENDPOINTS } from "../../data/endpointsData";

type SuiteId = "all" | "safety" | "intel" | "free" | "keys";

interface SuiteOverviewProps {
  selectedSuite: string;
  setSelectedSuite: (suite: SuiteId) => void;
}

export const SuiteOverview: React.FC<SuiteOverviewProps> = ({ selectedSuite, setSelectedSuite }) => {
  const suites = [
    { id: "safety", name: "Transaction Toolkit", desc: "Validate and simulate, decode logs, priority fees", icon: Shield, color: "indigo" },
    { id: "intel", name: "Token Intelligence", desc: "Decimals, supply, mint and freeze authority flags", icon: Sparkles, color: "purple" },
    { id: "keys", name: "Claim & Keys", desc: "Deposit info, sign-in challenge, key check, usage history", icon: Key, color: "amber" },
    { id: "free", name: "Free RPC", desc: "Balances, blockhash, token accounts, history, ATA", icon: Layers, color: "cyan" },
  ] as const;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {suites.map((suite) => {
        const Icon = suite.icon;
        const isActive = selectedSuite === suite.id;
        const count = API_ENDPOINTS.filter((e) => (e.suite as string) === suite.id).length;
        const colorClass = {
          indigo: isActive ? "bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-500/10" : "bg-slate-900 border-slate-800 hover:border-slate-700",
          purple: isActive ? "bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-500/10" : "bg-slate-900 border-slate-800 hover:border-slate-700",
          amber: isActive ? "bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-500/10" : "bg-slate-900 border-slate-800 hover:border-slate-700",
          cyan: isActive ? "bg-cyan-950/40 border-cyan-500 shadow-lg shadow-cyan-500/10" : "bg-slate-900 border-slate-800 hover:border-slate-700",
        }[suite.color];
        const textClass = { indigo: "text-indigo-400", purple: "text-purple-400", amber: "text-amber-400", cyan: "text-cyan-400" }[suite.color];
        return (
          <button key={suite.id} onClick={() => setSelectedSuite(suite.id)} className={`p-4 rounded-2xl border text-left transition ${colorClass}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase ${textClass}`}>{suite.name}</span>
              <Icon className={`w-4 h-4 ${textClass}`} />
            </div>
            <p className="text-xl font-bold text-white mt-1">{count} Endpoint{count === 1 ? "" : "s"}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{suite.desc}</p>
          </button>
        );
      })}
    </div>
  );
};
