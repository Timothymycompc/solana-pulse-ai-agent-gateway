import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { publishedReports } from '../../server/reports/list';
import type { Report } from '../../server/reports/types';
import { Link } from '../router';
import { H2, P, PageHeader } from '../components/docs/DocParts';
import { ReportView, type Live } from '../components/report/ReportView';
import type { ToolsIndex } from '../lib/toolsApi';
import { ToolboxPage } from './ToolboxPage';

// Public findings: every project we checked and told, searchable, and rendered on the server so search engines read it.
// Reports go public only after the project has been told (server/reports, `published`).

const haystack = (r: Report) => [r.project, r.name, r.repo, r.site, r.summary, r.status, ...r.findings.flatMap((f) => [f.title, f.what, f.fix, ...f.where]), ...r.watched.flatMap((w) => [w.label, w.address]), ...r.proof.map((p) => p.signature)].join(' ').toLowerCase();

const GROUPS: { kind: Report['kind']; title: string }[] = [
  { kind: 'code', title: 'Code we checked' },
  { kind: 'scam', title: 'Casinos and earn apps we checked' },
];
const where = (r: Report) => r.repo?.replace('https://github.com/', '') ?? r.site ?? '';

export const ReportsPage: React.FC = () => {
  const all = publishedReports();
  const [q, setQ] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? ''));
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((r) => words.every((w) => haystack(r).includes(w)));
  }, [q, all]);
  return (
    <article className="max-w-4xl">
      <PageHeader title="Reports" lead="Every check we've run: Solana code that breaks on version 1 transactions, with the fix, and casino and earn apps that take players' money. Every report names its sources and says what is and isn't proven. A code report goes public only after the project has been told." />
      <label className="mb-6 flex items-center gap-2 rounded-lg border border-line bg-code px-3 py-2">
        <Search size={16} className="text-ink-400" />
        <span className="sr-only">Search reports</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Project, repo, wallet or token address, file, problem…" className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none" />
      </label>
      {!all.length && <p className="text-ink-400">No reports are public yet. Each one goes up after the project has been told about it.</p>}
      {all.length > 0 && !shown.length && <p className="text-ink-400">No report matches “{q}”.</p>}
      {GROUPS.map((g) => {
        const group = shown.filter((r) => r.kind === g.kind);
        return group.length > 0 && (
          <section key={g.kind}>
            <H2>{g.title} ({group.length})</H2>
            <ul className="space-y-3">
              {group.map((r) => (
                <li key={r.name} className="rounded-xl border border-line p-5">
                  <Link to={`/reports/${r.name}`} className="text-[18px] font-semibold text-white underline-offset-4 hover:underline">{r.project}</Link>
                  <p className="mt-1 text-[13px] text-ink-400">{r.findings.length} findings · {where(r)} · public since {r.published ? r.published.at.slice(0, 10) : ''}</p>
                  {r.status && <p className="mt-1 text-[13px] text-ink-300">{r.status}</p>}
                  <p className="mt-2 text-[15px] leading-[1.6] text-ink-300">{r.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </article>
  );
};

// The same page a key holder sees on /mine: findings, live numbers, proofs you can re-run, and the live toolbox.
export const ReportPage: React.FC<{ name: string; index: ToolsIndex | null }> = ({ name, index }) => {
  const report = publishedReports().find((r) => r.name === name)!;
  const [live, setLive] = useState<Live[] | null>(null);
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading');
  useEffect(() => {
    fetch(`/api/reports/${name}/live`, { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(); setLive((await r.json()).live); setState('ready'); })
      .catch(() => setState('failed'));
  }, [name]);
  return (
    <article>
      <PageHeader kicker={<Link to="/reports" className="underline">Reports</Link>} title={`${report.project}: what we found`} lead={report.summary} />
      {report.published && <p className="mb-6 text-[13px] text-ink-400">Public since {report.published.at.slice(0, 10)}. {report.published.told}.</p>}
      <ReportView report={report} live={live} liveState={state} />
      <H2>Check it yourself</H2>
      <P>{report.kind === 'scam' ? 'Every Pulse tool, live on mainnet, starting with whats_this. Paste a Solana address a casino or game asks you to pay, before you pay it.' : 'Every Pulse tool, live on mainnet, starting with tx_version. Paste any signature from this report, or your own.'}</P>
      {index ? <ToolboxPage index={index} startTool={report.kind === 'scam' ? 'whats_this' : 'tx_version'} /> : <p className="text-ink-400">Loading the tools…</p>}
    </article>
  );
};
