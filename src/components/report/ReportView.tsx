import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { runTool } from '../../lib/toolsApi';
import { button } from '../ui/button';
import type { Report } from '../../../server/reports/types';
import { Code, CodeBlock, H2, P, Table } from '../docs/DocParts';

// One project's findings, shared by the public page (/reports/<name>) and the key holder's page (/mine).
// `live` is the newest transactions of each watched address, read from the chain when the page opened (null while loading
// or when a read failed).

export type Live = { label: string; address: string; newest: number; legacy: number; v0: number; v1: number; unknown: number; latest: string | null; checkedAt: string } | null;

// A date-only value ("2026-10-21") was checked that day at no recorded time, so it shows as a date only.
const when = (iso: string | null) => (!iso ? 'unknown' : iso.length === 10 ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' }) : new Date(iso).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC');
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;
const danger = 'border-danger-400/40 text-danger-100';
const warning = 'border-warning-300/40 text-warning-100';
const tone: Record<string, string> = { 'breaks money': danger, trap: danger, security: danger, 'breaks accuracy': warning, 'warning sign': warning, info: 'border-line text-ink-300' };

// Report text: `code` in backticks, paragraphs split by a blank line, and "- " lines as a list.
const inline = (text: string) => text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <Code key={i}>{part}</Code> : part));
const Text: React.FC<{ text: string; className?: string }> = ({ text, className = 'mb-3 text-[15px] leading-[1.65] text-ink-300' }) => (
  <>
    {text.split(/\n{2,}/).map((block, i) => {
      const lines = block.split('\n');
      return lines.every((l) => l.startsWith('- '))
        ? <ul key={i} className={`${className} list-disc pl-5`}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>
        : <p key={i} className={className}>{inline(block)}</p>;
    })}
  </>
);

// Re-runs a proof on mainnet right now with the tx_version tool (under the holder's key on /mine, a free call elsewhere).
const RerunProof: React.FC<{ signature: string; apiKey?: string }> = ({ signature, apiKey }) => {
  const [state, setState] = useState<{ running: boolean; text: string; ok?: boolean }>({ running: false, text: '' });
  const run = async () => {
    setState({ running: true, text: '' });
    try {
      const res = await runTool('tx_version', { tx_id: signature }, 'http', apiKey);
      const b: any = res.body;
      if (res.status !== 200) return setState({ running: false, text: `The check answered ${res.status}: ${b?.error ?? 'see the toolbox below'}`, ok: false });
      setState({ running: false, ok: true, text: `Just now: version ${b.version}; readable with max version 0: ${b.readable_with_max_version_0 === null ? 'unknown' : b.readable_with_max_version_0 ? 'yes' : 'no'}${b.slot ? ` (slot ${b.slot})` : ''}.` });
    } catch (e) {
      setState({ running: false, text: `Couldn't run the check: ${(e as Error).message}`, ok: false });
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 font-sans">
      <button onClick={() => void run()} disabled={state.running} className={button('secondary', 'sm')}><Play size={13} /> {state.running ? 'Checking…' : 'Run this check now'}</button>
      {state.text && <span role="status" className={`text-[13px] ${state.ok ? 'text-success-200' : 'text-danger-100'}`}>{state.text}</span>}
    </div>
  );
};

export const ReportView: React.FC<{ report: Report; live: Live[] | null; liveState?: 'loading' | 'failed' | 'ready'; apiKey?: string }> = ({ report: r, live, liveState = 'ready', apiKey }) => (
  <>
    {r.repo && <P>Code: <a className="underline" href={r.repo} target="_blank" rel="noreferrer">{r.repo.replace('https://github.com/', '')}</a>{r.commit && <>, {r.commit.startsWith('their ') ? r.commit : <>commit <Code>{r.commit}</Code></>}</>}.{r.issue && <> Reported to them: <a className="underline" href={r.issue} target="_blank" rel="noreferrer">{r.issue.replace('https://github.com/', '')}</a>.</>}</P>}
    {r.site && <P>Site: <Code>{r.site}</Code> (written out, not linked: don't open it with a wallet connected).</P>}
    {r.status && <p className="mb-6 rounded-lg border border-line bg-code px-4 py-3 text-[15px] text-ink-200"><span className="font-semibold text-white">Status:</span> {r.status}</p>}

    <H2>Findings</H2>
    {r.findings.map((f) => (
      <section key={f.title} className={`mb-4 rounded-xl border p-5 ${tone[f.severity] ?? tone.info}`}>
        <p className="mb-1 text-[12px] uppercase tracking-wide opacity-80">{f.severity}</p>
        <h3 className="mb-2 text-[17px] font-semibold text-white">{f.title}</h3>
        <Text text={f.what} />
        <ul className="mb-3 flex flex-wrap gap-1.5">{f.where.map((w) => <li key={w}><Code>{w}</Code></li>)}</ul>
        {f.example && <div className="mb-3"><CodeBlock code={f.example} /></div>}
        {f.fix && <p className="text-[14px] text-ink-200"><span className="font-semibold">{r.kind === 'scam' ? 'What to do:' : 'Fix:'}</span> {inline(f.fix)}</p>}
      </section>
    ))}

    {r.watched.length > 0 && <>
    <H2>{r.kind === 'scam' ? 'Its Solana wallet, read live' : 'Their addresses, read live'}</H2>
    <P>The newest transactions of each address, read from the chain when this page opened (refreshed at most every 5 minutes). A read that fails counts as unknown, never as a version.</P>
    <Table head={['Address', 'Newest read', 'Version 1', 'Version 0', 'Legacy', 'Unknown', 'Latest activity']} rows={r.watched.map((w, i) => {
      const l = live?.[i] ?? null;
      const empty = liveState === 'loading' ? 'reading…' : '—';
      return [<span key="a"><span className="block text-white">{w.label}</span><a className="font-mono text-[12px] underline" href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noreferrer">{short(w.address)}</a></span>,
        l ? l.newest : empty, l ? <strong key="v1" className="text-warning-100">{l.v1}</strong> : empty, l ? l.v0 : empty, l ? l.legacy : empty, l ? l.unknown : empty,
        l ? when(l.latest) : liveState === 'loading' ? 'reading…' : "Couldn't read right now"];
    })} />
    </>}

    <H2>What we measured</H2>
    <Table head={['What', 'Result', 'How', 'Checked']} rows={r.facts.map((f) => [f.label, <strong key="v" className="text-white">{f.value}</strong>, f.source, when(f.checkedAt)])} />

    {r.proof.length > 0 && <H2>Proof you can repeat</H2>}
    {r.proof.map((p) => (
      <div key={p.signature} className="mb-4 rounded-xl border border-line bg-code p-4 font-mono text-[12.5px] leading-[1.7] text-ink-200">
        <p className="break-all text-white">{p.signature} <span className="text-ink-400">(slot {p.slot})</span></p>
        <p>maxSupportedTransactionVersion: 0 → {p.withMaxVersion0}</p>
        <p>maxSupportedTransactionVersion: 1 → {p.withMaxVersion1}</p>
        <p className="text-ink-400">checked {when(p.checkedAt)}</p>
        <RerunProof signature={p.signature} apiKey={apiKey} />
      </div>
    ))}
  </>
);
