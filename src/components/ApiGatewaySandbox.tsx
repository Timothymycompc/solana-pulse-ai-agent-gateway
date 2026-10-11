import React, { useState } from 'react';
import { DeveloperHome } from './DeveloperHome';
import { ServiceUsagePanel } from './ServiceUsagePanel';
import { Playground } from './playground/Playground';
import { useReveal } from '../hooks/motion';

interface ApiGatewaySandboxProps {
  onOpenMcp: () => void;
}

// The questions people arrive with, each mapped to the tool that answers it.
const STARTER_TASKS = [
  { tool: 'preflight_transaction', title: 'Check before signing', detail: 'See what a transaction does to each wallet' },
  { tool: 'check_transaction_intent', title: 'Does it do what I meant?', detail: 'Compare a transaction to "send 0.01 SOL to X"' },
  { tool: 'token_verdict', title: 'Is this token safe?', detail: 'SAFE / CAUTION / AVOID with reasons' },
  { tool: 'explain_transaction', title: 'What happened?', detail: 'Plain-language account of a transaction' },
  { tool: 'convert_amount', title: 'Convert an amount', detail: '5 USDC into exact base units (free)' },
];

export const ApiGatewaySandbox: React.FC<ApiGatewaySandboxProps> = ({ onOpenMcp }) => {
  const revealRef = useReveal<HTMLDivElement>([]);
  const [startTool, setStartTool] = useState('preflight_transaction');
  const [playgroundKey, setPlaygroundKey] = useState(0);
  const jumpTo = (tool: string) => {
    setStartTool(tool);
    setPlaygroundKey((k) => k + 1);
    document.getElementById('playground-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={revealRef} className="space-y-8">
      <DeveloperHome onOpenMcp={onOpenMcp} onTryApi={() => document.getElementById('playground-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      <section id="playground-request" data-reveal className="scroll-mt-24 space-y-4">
        <div className="px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">Interactive playground</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Run a <span className="text-gradient">real request</span></h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">Every tool loads live mainnet inputs, so you can run it as-is or edit any field. Each response comes with a field guide explaining every value.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {STARTER_TASKS.map((task, i) => (
            <button key={task.tool} type="button" onClick={() => jumpTo(task.tool)} data-reveal data-reveal-index={i} aria-pressed={startTool === task.tool}
              className={`lift rounded-xl border p-3 text-left ${startTool === task.tool ? 'gradient-border border-transparent bg-indigo-500/10' : 'glass-inset hover:border-indigo-400/40 hover:bg-indigo-500/5'}`}>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Try it · live</span>
              <span className="mt-1 block text-xs font-semibold text-slate-100">{task.title}</span>
              <span className="mt-1 block text-[10px] leading-4 text-slate-300">{task.detail}</span>
            </button>
          ))}
        </div>
        <Playground key={playgroundKey} initialTool={startTool} />
      </section>

      <div data-reveal><ServiceUsagePanel /></div>
    </div>
  );
};

export default ApiGatewaySandbox;
