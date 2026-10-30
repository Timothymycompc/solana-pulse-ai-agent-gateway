import React, { useState } from 'react';
import { KeyRound, Lock, RefreshCw } from 'lucide-react';
import type { ToolsIndex } from '../lib/toolsApi';
import { H2, P, PageHeader } from '../components/docs/DocParts';
import { ReportView, type Live } from '../components/report/ReportView';
import type { Report } from '../../server/reports/types';
import { button } from '../components/ui/button';
import { ToolboxPage } from './ToolboxPage';

// A trial-key holder's private page (POST /api/mine, server/reports): what we found in their project, the on-chain
// numbers behind it, their addresses re-read live, and the full toolbox running every call under their key.
// The key is typed into the form and sent as a header; it is kept for this browser tab only, never in the address.

type Mine = { name: string; keyValidUntil: string; report: Report; live: Live[] };

const TAB_KEY = 'pulse.mine.key';
const readTab = () => { try { return sessionStorage.getItem(TAB_KEY) ?? ''; } catch { return ''; } };
const writeTab = (v: string | null) => { try { if (v) sessionStorage.setItem(TAB_KEY, v); else sessionStorage.removeItem(TAB_KEY); } catch { /* blocked storage: the page still works */ } };

// ?as=<name> lets the owner preview a report with the owner key; for everyone else it is ignored by the server.
async function fetchMine(key: string): Promise<Mine> {
  const as = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('as');
  const r = await fetch(`/api/mine${as ? `?as=${encodeURIComponent(as)}` : ''}`, { method: 'POST', headers: { 'x-api-key': key }, cache: 'no-store' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `The server answered ${r.status}.`);
  return body as Mine;
}

export const MinePage: React.FC<{ index: ToolsIndex | null }> = ({ index }) => {
  const [key, setKey] = useState(readTab);
  const [typed, setTyped] = useState('');
  const [data, setData] = useState<Mine | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const open = async (k: string) => {
    setLoading(true); setError('');
    try { const d = await fetchMine(k.trim()); setData(d); setKey(k.trim()); writeTab(k.trim()); }
    catch (e) { setData(null); setError((e as Error).message); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { if (key && !data) void open(key); }, []); // reopen within the same tab
  const lock = () => { writeTab(null); setKey(''); setData(null); setTyped(''); };

  if (!data) {
    return (
      <article className="max-w-xl">
        <PageHeader kicker={<span className="inline-flex items-center gap-1.5"><Lock size={14} /> Private</span>} title="Your report" lead="Paste the Pulse key you were given. It opens the findings for your project only, with the numbers re-read from the chain, and a toolbox that runs every call under your key." />
        <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) void open(typed); }} className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="mine-key">Your Pulse key</label>
          <input id="mine-key" type="password" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="pulse_trial_…"
            className="min-w-0 flex-1 rounded-md border border-line bg-code px-3 py-2 font-mono text-[14px] text-white outline-none focus:border-white/40" />
          <button type="submit" disabled={loading || !typed.trim()} className={button('primary')}><KeyRound size={15} /> {loading ? 'Opening…' : 'Open'}</button>
        </form>
        {error && <p role="alert" className="mt-4 rounded-lg border border-danger-400/30 bg-danger-500/10 px-4 py-3 text-[14px] text-danger-100">{error}</p>}
        <p className="mt-6 text-[13px] text-ink-400">Your key is sent as a header and kept only for this browser tab. It never goes in the page address.</p>
      </article>
    );
  }

  const r = data.report;
  return (
    <article>
      <div className="max-w-4xl">
        <PageHeader kicker={<span className="inline-flex items-center gap-1.5"><Lock size={14} /> Private to your key · {data.keyValidUntil === 'owner preview' ? 'owner preview' : `valid until ${new Date(data.keyValidUntil).toLocaleDateString()}`}</span>}
          title={`${r.project}: what we found`} lead={r.summary}
          aside={<div className="flex gap-2"><button onClick={() => void open(key)} className={button('secondary')}><RefreshCw size={14} /> Re-check</button><button onClick={lock} className={button('secondary')}><Lock size={14} /> Lock</button></div>} />
        <ReportView report={r} live={data.live} apiKey={key} />
      </div>

      <H2>Your toolbox</H2>
      <P>Every Pulse tool, grouped as on the main toolbox. Calls here run under your key.</P>
      {index ? <ToolboxPage index={index} apiKey={key} startTool="tx_version" /> : <p className="text-ink-400">Loading the tools…</p>}
    </article>
  );
};
