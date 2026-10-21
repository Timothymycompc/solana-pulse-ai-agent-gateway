import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, TriangleAlert } from 'lucide-react';
import { loadOwnerCall, type CallRow } from '../../lib/ownerApi';

// One call opened in the explorer: its full input and output (loaded when opened), and everything known about who made it.

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

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0"><dt className="text-[11px] text-ink-500">{label}</dt><dd className="truncate font-mono text-[11.5px] text-ink-200">{children}</dd></div>
);

export const CallDetail: React.FC<{ call: CallRow; ownerKey: string }> = ({ call, ownerKey }) => {
  const [io, setIo] = useState<{ input: unknown; output: unknown } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    loadOwnerCall(ownerKey, call.id).then((r) => live && setIo(r)).catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load this call.'));
    return () => { live = false; };
  }, [call.id, ownerKey]);
  const c = call.caller;
  return (
    <div className="animate-fade-in space-y-4 px-1 py-2">
      {c.rotatesBrowsers && <p className="flex items-start gap-2 rounded-lg border border-warning-400/30 bg-warning-500/10 px-3 py-2 text-[12px] text-warning-200">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />This network answered as more than one desktop browser in this period (for example Chrome on Windows and Safari on a Mac). People don't do that; crawlers that fake browser names do.</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Fact label="Call id">#{call.id}</Fact>
        <Fact label="When">{new Date(call.at).toLocaleString()}</Fact>
        <Fact label="Network">{c.network ?? 'bots are counted across networks'}</Fact>
        <Fact label="Via">{call.transport.toUpperCase()} · HTTP {call.status}{call.paidUsdc ? ` · paid $${call.paidUsdc}` : ''}</Fact>
        <div className="col-span-2 min-w-0 sm:col-span-4"><dt className="text-[11px] text-ink-500">User agent{c.mcpClient ? ' · MCP client' : ''}</dt>
          <dd className="break-all font-mono text-[11.5px] text-ink-200">{c.userAgent ?? '(none sent)'}{c.mcpClient ? ` · ${c.mcpClient}` : ''}
            {c.homepage && <a href={c.homepage} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-accent-300 hover:text-accent-200">site<ExternalLink className="h-3 w-3" /></a>}</dd></div>
      </dl>
      {call.noteSent && <p className="text-[12px] text-ink-400">This answer also carried your note from the developer; the output below was saved before the note was added.</p>}
      {error ? <p className="text-[12px] text-danger-300">{error}</p> : !io ? <div className="h-24 animate-shimmer rounded-lg bg-white/5" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {([['Input', io.input], ['Output', io.output]] as const).map(([label, value]) => (
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
