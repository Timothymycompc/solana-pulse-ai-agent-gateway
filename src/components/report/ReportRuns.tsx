import React, { useEffect, useState } from 'react';
import { BookOpen, Play } from 'lucide-react';
import { runTool, type ToolsIndex } from '../../lib/toolsApi';
import { button } from '../ui/button';
import { Code, H2, P, Table } from '../docs/DocParts';
import type { Report } from '../../../server/reports/types';

// Every Pulse tool run on this report's own addresses (GET /api/reports/<name>/runs): the first one and every later one,
// ours or a visitor's. "What we ran" explains each tool from its own documentation; "Run it yourself" runs the whole
// group again, live, with the same inputs. With no runs yet, it offers the checks that fit the report's own addresses
// and says plainly that nobody has run them.

type Run = { tool: string; channel: string; at: string; field: string; value: string; ok: boolean; by: 'us' | 'a visitor' };
type Step = { tool: string; args: Record<string, string> };

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC';
const short = (v: string) => (v.length > 16 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v);
const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

// Checks that fit the report's own addresses, for when no one has run a tool on them yet.
export function suggested(r: Report): Step[] {
  const steps: Step[] = r.proof.map((p) => ({ tool: 'tx_version', args: { tx_id: p.signature } }));
  for (const w of r.watched) steps.push(w.kind === 'token' ? { tool: 'token_safety', args: { token: w.address } } : { tool: 'whats_this', args: { address: w.address } });
  for (const f of r.findings) for (const where of f.where) {
    const m = where.startsWith('Solana ') ? where.slice(7).match(BASE58) : null;
    if (m && !steps.some((s) => Object.values(s.args).includes(m[0]))) steps.push({ tool: 'whats_this', args: { address: m[0] } });
  }
  return steps;
}

export const ReportRuns: React.FC<{ report: Report; index: ToolsIndex | null }> = ({ report, index }) => {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [explain, setExplain] = useState(false);
  const [results, setResults] = useState<Record<number, { running?: boolean; status?: number; body?: unknown; error?: string }>>({});
  useEffect(() => {
    fetch(`/api/reports/${report.name}/runs`, { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(); setRuns((await r.json()).runs); })
      .catch(() => setFailed(true));
  }, [report.name]);

  const ran = runs ?? [];
  const fromRuns: Step[] = [];
  for (const r of ran) if (!fromRuns.some((s) => s.tool === r.tool && s.args[r.field] === r.value)) fromRuns.push({ tool: r.tool, args: { [r.field]: r.value } });
  const group = fromRuns.length ? fromRuns : suggested(report);
  const tools = [...new Set(group.map((s) => s.tool))].map((n) => index?.tools.find((t) => t.name === n)).filter(Boolean);

  const runAll = async () => {
    for (let i = 0; i < group.length; i++) {
      setResults((x) => ({ ...x, [i]: { running: true } }));
      try {
        const res = await runTool(group[i].tool, group[i].args, 'http');
        setResults((x) => ({ ...x, [i]: { status: res.status, body: res.body } }));
      } catch (e) {
        setResults((x) => ({ ...x, [i]: { error: (e as Error).message } }));
      }
    }
  };

  return (
    <>
      <H2>Tools run on this project</H2>
      {failed && <P>The run history can't be loaded right now.</P>}
      {runs && !ran.length && <P>No Pulse tool has been run on this project's addresses yet. The findings above came from reading its code and public records, each with its source.</P>}
      {ran.length > 0 && <>
        <P>First run: <Code>{ran[0].tool}</Code> on {when(ran[0].at)}, by {ran[0].by}. {ran.length > 1 ? `${ran.length - 1} more since.` : 'None since.'}</P>
        <Table head={['When', 'Tool', 'On', 'Via', 'By', 'Result']} minWidth={640}
          rows={ran.map((r) => [when(r.at), <Code key="t">{r.tool}</Code>, `${r.field} ${short(r.value)}`, r.channel, r.by, r.ok ? 'worked' : 'failed'])} />
      </>}

      <div className="mb-6 mt-4 flex flex-wrap gap-3 font-sans">
        <button onClick={() => setExplain((x) => !x)} aria-expanded={explain} className={button('secondary', 'sm')}><BookOpen size={13} /> What we ran</button>
        <button onClick={() => void runAll()} disabled={!group.length} className={button('primary', 'sm')}><Play size={13} /> Run it yourself{group.length ? ` (${group.length})` : ''}</button>
      </div>

      {explain && <section className="mb-6 rounded-xl border border-line p-5">
        {!fromRuns.length && <p className="mb-3 text-[14px] text-ink-400">Nobody has run a tool on this project yet, so these are the checks that fit its addresses.</p>}
        {!tools.length && <p className="text-[14px] text-ink-400">{index ? 'This report has no Solana address or transaction a tool can check.' : 'Loading the tools…'}</p>}
        {tools.map((t) => t && (
          <div key={t.name} className="mb-5 last:mb-0">
            <h3 className="mb-1 text-[16px] font-semibold text-white"><Code>{t.name}</Code> {t.title}</h3>
            <p className="mb-2 text-[14px] leading-[1.6] text-ink-300">{t.description}</p>
            <p className="mb-1 text-[13px] font-semibold text-ink-200">How it works out each answer:</p>
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-[1.55] text-ink-300">{t.outputs.map((o) => <li key={o.field}><Code>{o.field}</Code>: {o.howWorkedOut}</li>)}</ul>
          </div>
        ))}
      </section>}

      {group.some((_, i) => results[i]) && <ul className="mb-6 space-y-3">{group.map((s, i) => {
        const r = results[i];
        return r && (
          <li key={i} className="rounded-xl border border-line bg-code p-4 font-mono text-[12.5px] text-ink-200">
            <p className="text-white">{s.tool} {Object.entries(s.args).map(([k, v]) => `${k} ${short(v)}`).join(', ')} <a className="ml-2 font-sans text-[12px] underline" href={`/toolbox?tool=${s.tool}`}>open in the toolbox</a></p>
            {r.running ? <p>Running…</p> : r.error ? <p className="text-danger-100">Couldn't run: {r.error}</p> : <details><summary className={r.status === 200 ? 'text-success-200' : 'text-danger-100'}>Answered {r.status}</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(r.body, null, 2)}</pre></details>}
          </li>
        );
      })}</ul>}
    </>
  );
};
