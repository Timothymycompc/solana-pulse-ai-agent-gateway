import React from 'react';
import { Link } from '../router';
import { CATEGORY_ORDER, toolPath } from '../nav';
import { CATEGORY_LABELS, type ToolDoc, type ToolsIndex } from '../lib/toolsApi';
import { PageHeader, P } from '../components/docs/DocParts';
import measured from '../data/tool-flows.json';

// Every tool in one table: what comes in, what goes out to the chain and outside services, and what comes back.
// "What goes out" is measured (scripts/measure-flows.ts runs each tool's live example), not written by hand.

type Lookup = { to: string; what: string; count: number; failed: number };
type Measured = { ok: boolean; ms?: number; calls?: number; lookups?: Lookup[]; error?: string };
const RUNS = measured.tools as Record<string, Measured>;
const measuredOn = new Date(measured.measuredAt).toISOString().slice(0, 10);

const SERVICE_TONE: Record<string, string> = { 'Solana RPC': 'bg-gold-400', Jupiter: 'bg-ink-200', RugCheck: 'bg-success-400' };

// Top-level response fields, in the order the tool documents them.
const responseFields = (tool: ToolDoc) => [...new Set(tool.outputs.map((o) => o.field.split(/[.[ ]/)[0]))];

function WentOut({ run }: { run: Measured | undefined }) {
  if (!run) return <span className="text-ink-500">Not measured yet.</span>;
  if (!run.ok) return <span className="text-warning-200">The measuring run failed: {run.error}</span>;
  if (!run.lookups?.length) return <span className="text-ink-400">Nothing. It answers from Pulse's own list.</span>;
  return (
    <ul className="space-y-0.5">
      {run.lookups.map((l, i) => (
        <li key={i} className="flex items-baseline gap-1.5">
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${SERVICE_TONE[l.to] ?? 'bg-ink-400'}`} />
          <span className="min-w-0"><span className="text-ink-400">{l.to}</span> <span className="font-mono text-[12px] text-ink-200">{l.what}</span>{l.count > 1 && <span className="text-ink-500"> ×{l.count}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export const FlowsPage: React.FC<{ index: ToolsIndex }> = ({ index }) => {
  const groups = CATEGORY_ORDER.map((c) => ({ category: c, tools: index.tools.filter((t) => t.category === c) })).filter((g) => g.tools.length);
  return (
    <article>
      <PageHeader title="How every tool answers" lead="One row per tool: what you send, what Pulse asks the chain and outside services, and what it sends back. Run any of them in the toolbox to see the same thing for your own inputs." />
      <P>The middle column is measured, not written by hand: each tool's live mainnet example was run once on {measuredOn} and every lookup it made was written down. A different input can need more or fewer lookups (a longer wallet history means more transactions to read).</P>

      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-400">
        {Object.entries(SERVICE_TONE).map(([name, tone]) => <span key={name} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${tone}`} />{name}</span>)}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line surface">
        <table className="data-table min-w-[56rem] text-[13px]">
          <thead className="text-[12.5px]">
            <tr>
              <th className="w-[13rem] px-4 py-3">Tool</th>
              <th className="px-4 py-3">What comes in</th>
              <th className="px-4 py-3">What goes out</th>
              <th className="px-4 py-3">Our response</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.category}>
              <tr className="!bg-transparent"><th colSpan={4} scope="colgroup" className="bg-wood-950/50 px-4 py-2 text-left text-[12.5px] font-semibold text-tan-300">{CATEGORY_LABELS[g.category]}</th></tr>
              {g.tools.map((t) => {
                const run = RUNS[t.name];
                return (
                  <tr key={t.name} className="align-top">
                    <td className="px-4 py-3">
                      <Link to={toolPath(t.name)} className="font-mono text-[13px] font-semibold text-gold-200 hover:text-gold-100">{t.name}</Link>
                      <p className="mt-0.5 text-[12.5px] leading-5 text-ink-400">{t.title}</p>
                      <Link to={`/toolbox?tool=${t.name}`} className="mt-1.5 inline-block text-[12.5px] font-medium text-accent-300 hover:text-accent-200">Run it</Link>
                    </td>
                    <td className="px-4 py-3">
                      {t.inputs.length ? (
                        <ul className="space-y-0.5 font-mono text-[12px]">
                          {t.inputs.map((i) => <li key={i.name} className={i.required ? 'text-ink-100' : 'text-ink-400'}>{i.name}{i.required ? '' : <span className="font-sans text-ink-500"> (optional)</span>}</li>)}
                        </ul>
                      ) : <span className="text-ink-500">No inputs.</span>}
                    </td>
                    <td className="px-4 py-3 text-[12.5px]">
                      <WentOut run={run} />
                      {run?.ok && run.ms !== undefined && <p className="mt-1 readout text-[11.5px] text-ink-500">{run.calls} {run.calls === 1 ? 'lookup' : 'lookups'} in {run.ms} ms</p>}
                    </td>
                    <td className="px-4 py-3">
                      <ul className="flex flex-wrap gap-1 font-mono text-[12px]">
                        {responseFields(t).map((f) => <li key={f} className="rounded border border-line px-1.5 py-0.5 text-ink-200">{f}</li>)}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <p className="mt-3 text-[12.5px] text-ink-500">{measured.how}. Refresh it with <code className="font-mono">npm run measure-flows</code>.</p>
    </article>
  );
};
