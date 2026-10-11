import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const PageHeader: React.FC<{ eyebrow?: string; title: React.ReactNode; lead?: React.ReactNode; aside?: React.ReactNode }> = ({ eyebrow, title, lead, aside }) => (
  <header className="mb-8 space-y-3 border-b border-white/[0.06] pb-8">
    {eyebrow && <p className="text-xs font-medium uppercase tracking-[0.14em] text-indigo-300">{eyebrow}</p>}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.1rem]">{title}</h1>
      {aside}
    </div>
    {lead && <p className="max-w-3xl text-[15px] leading-7 text-slate-300">{lead}</p>}
  </header>
);

export const H2: React.FC<{ id?: string; children: React.ReactNode }> = ({ id, children }) => (
  <h2 id={id} className="mb-3 mt-10 scroll-mt-20 text-lg font-semibold tracking-tight text-white first:mt-0">{children}</h2>
);

export const P: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="mb-4 max-w-3xl text-sm leading-7 text-slate-300">{children}</p>;

export const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[0.85em] text-slate-100">{children}</code>
);

export const CodeBlock: React.FC<{ code: string; title?: string }> = ({ code, title }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div className="mb-5 overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
        <span className="text-[11px] text-slate-400">{title ?? ''}</span>
        <button onClick={() => void copy()} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label="Copy code">
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[12px] leading-6 text-slate-200">{code}</pre>
    </div>
  );
};

export const Table: React.FC<{ head: string[]; rows: React.ReactNode[][]; minWidth?: number }> = ({ head, rows, minWidth = 560 }) => (
  <div className="mb-6 overflow-x-auto rounded-lg border border-white/10">
    <table className="w-full text-left text-[13px]" style={{ minWidth }}>
      <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wider text-slate-400">
        <tr>{head.map((h) => <th key={h} className="px-3.5 py-2.5 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i} className="border-t border-white/[0.06] align-top">{cells.map((c, j) => <td key={j} className="px-3.5 py-3 leading-6 text-slate-300">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);
