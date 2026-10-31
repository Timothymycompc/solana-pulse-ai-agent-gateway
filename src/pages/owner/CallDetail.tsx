import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, TriangleAlert } from 'lucide-react';
import { loadOwnerCall, type CallRow } from '../../lib/ownerApi';
import { Solscan } from './ui';

// One call opened in the explorer, in four parts: when, where it came from, who made it (and why it got that label),
// and what happened; then its full input and output (loaded when opened).

// JSON with its keys, strings, numbers and literals in different colors. Plain text, so long answers stay fast.
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
export const JsonView: React.FC<{ value: unknown }> = ({ value }) => {
  if (value === null || value === undefined) return <p className="text-[12px] text-ink-500">Not saved (empty, or past the 30-day limit).</p>;
  const text = JSON.stringify(value, null, 2);
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const cls = m[1] ? (m[2] ? 'text-ink-300' : 'text-accent-200') : m[3] ? 'text-kind-other' : 'text-kind-bot';
    parts.push(<span key={m.index} className={cls}>{m[1] ?? m[0]}</span>);
    if (m[2]) parts.push(m[2]);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <pre className="max-h-96 overflow-auto rounded-lg bg-black/35 p-3 font-mono text-[11.5px] leading-5 text-ink-100">{parts}</pre>;
};

const CopyButton: React.FC<{ value: unknown }> = ({ value }) => {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <button onClick={copy} disabled={value === null || value === undefined} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-400 transition hover:bg-white/5 hover:text-white disabled:opacity-30">
      {done ? <Check className="h-3 w-3 text-success-400" /> : <Copy className="h-3 w-3" />}{done ? 'Copied' : 'Copy'}
    </button>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode; wide?: boolean }> = ({ label, children, wide }) => (
  <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}><dt className="text-[11px] text-ink-500">{label}</dt><dd className="break-words font-mono text-[11.5px] text-ink-200">{children}</dd></div>
);
// One part of the drop-down (when, where from, who, what), with its own heading.
const Part: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="min-w-0 rounded-lg border border-white/10 bg-black/15 p-3">
    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{title}</h4>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
  </section>
);

const VIA: Record<string, string> = { free_call: 'One of the 25 free calls a day', owner: 'Your owner key', x402: 'x402: asked to pay in USDC', free: 'Free tool' };
const CHANNEL: Record<string, string> = { site: 'Website', web: 'Another web page', telegram: 'Telegram', mcp: 'MCP', api: 'HTTP API' };
const utc = (iso: string) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export const CallDetail: React.FC<{ call: CallRow; ownerKey: string; onCaller?: (call: CallRow) => void }> = ({ call, ownerKey, onCaller }) => {
  const [io, setIo] = useState<{ input: unknown; output: unknown } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    loadOwnerCall(ownerKey, call.id).then((r) => live && setIo(r)).catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load this call.'));
    return () => { live = false; };
  }, [call.id, ownerKey]);
  const c = call.caller;
  const at = new Date(call.at);
  return (
    <div className="animate-fade-in space-y-4 px-1 py-2">
      {c.rotatesBrowsers && <p className="flex items-start gap-2 rounded-lg border border-warning-400/30 bg-warning-500/10 px-3 py-2 text-[12px] text-warning-200">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />This network answered as more than one desktop browser in this period (for example Chrome on Windows and Safari on a Mac). People don't do that; crawlers that fake browser names do.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Part title="When">
          <Fact label="Date">{at.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</Fact>
          <Fact label="Time">{at.toLocaleTimeString()}</Fact>
          <Fact label="In UTC" wide>{utc(call.at)}</Fact>
          <Fact label="Call id">#{call.id}</Fact>
        </Part>
        <Part title="Where it came from">
          <Fact label="Channel">{CHANNEL[call.from.channel]}</Fact>
          <Fact label="Through">{call.transport.toUpperCase()}</Fact>
          <Fact label="From" wide>{call.from.label}</Fact>
          {call.from.channel === 'api' || call.from.channel === 'mcp'
            ? <Fact label="Web page" wide><span className="font-sans text-ink-400">none sent (pages are recorded from 31 Oct 2026)</span></Fact>
            : call.from.page ? <Fact label="Web page" wide>{call.from.page}</Fact> : null}
        </Part>
        <Part title="Who made it">
          <Fact label="Made by">{call.madeBy === 'test' ? `Test (you) · ${call.test}` : call.madeBy === 'you' ? 'You' : call.madeBy === 'bot' ? 'Bot' : 'Outside'}</Fact>
          <Fact label="Caller">{c.name}{c.homepage && <a href={c.homepage} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 font-sans text-accent-300 hover:text-accent-200">site<ExternalLink className="h-3 w-3" /></a>}</Fact>
          <Fact label="Why" wide><span className="font-sans">{call.madeByWhy}</span></Fact>
          <Fact label="Network">{c.network ?? 'bots are counted across networks'}</Fact>
          {c.mcpClient && <Fact label="MCP client">{c.mcpClient}</Fact>}
          <Fact label="User agent" wide>{c.userAgent ?? '(none sent)'}</Fact>
          {onCaller && <div className="col-span-2"><button onClick={() => onCaller(call)} className="text-[12px] text-accent-300 hover:text-accent-200">Show every call by this caller →</button></div>}
        </Part>
        <Part title="What happened">
          <Fact label="Tool">{call.tool}</Fact>
          <Fact label="HTTP status">{call.status}</Fact>
          <Fact label="Let in by" wide><span className="font-sans">{call.via ? VIA[call.via] ?? call.via : 'not recorded'}</span></Fact>
          <Fact label="Paid">{call.paidUsdc ? `$${call.paidUsdc}` : 'nothing'}</Fact>
          <Fact label="Input">{call.inputKind === 'own' ? 'typed by caller' : call.inputKind === 'example' ? "this site's example" : 'empty'}</Fact>
          {call.paymentTx && <Fact label="Payment" wide><Solscan kind="tx" id={call.paymentTx} /></Fact>}
          {call.headline && <Fact label="Answer" wide><span className="font-sans">{call.headline}</span></Fact>}
        </Part>
      </div>
      {call.noteSent && <p className="text-[12px] text-ink-400">This answer also carried your note from the developer; the output below was saved before the note was added.</p>}
      {error ? <p className="text-[12px] text-danger-300">{error}</p> : !io ? <div className="h-24 animate-shimmer rounded-lg bg-white/5" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {([['Full input', io.input], ['Full output', io.output]] as const).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between"><p className="text-[12.5px] font-semibold text-ink-300">{label}</p><CopyButton value={value} /></div>
              <JsonView value={value} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
