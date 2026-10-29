import React, { useEffect, useState } from 'react';
import { groupTrail, type TrailStep } from '../../lib/flow';

type Props = { tool: string; args: Record<string, unknown>; transport: 'http' | 'mcp'; status: number; latencyMs: number; trail: TrailStep[] | null | undefined; verdict?: string | null };

const argText = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 28 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s;
};

// One station on the rail: a node, a heading, and what happened there.
const Station: React.FC<{ title: string; aside?: React.ReactNode; last?: boolean; children: React.ReactNode }> = ({ title, aside, last, children }) => (
  <li className="relative pl-6">
    {!last && <span aria-hidden className="absolute bottom-[-14px] left-[5px] top-4 w-px bg-gold-500/30" />}
    <span aria-hidden className="absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-gold-400 bg-wood-950" />
    <div className="flex items-baseline justify-between gap-3">
      <h4 className="text-[13px] font-semibold text-ink-100">{title}</h4>
      {aside && <span className="readout shrink-0 text-[12px] text-ink-500">{aside}</span>}
    </div>
    <div className="mt-1.5">{children}</div>
  </li>
);

// The lookups as a waterfall on one time axis: where each started and how long it took. The bars grow once, in order.
function Waterfall({ steps }: { steps: TrailStep[] }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGrown(true)); return () => cancelAnimationFrame(id); }, [steps]);
  const rows = groupTrail(steps);
  const span = Math.max(1, ...rows.map((r) => r.at + r.ms));
  return (
    <ol className="space-y-1" aria-label="Lookups in the order Pulse made them">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,11rem)_1fr_3.2rem] items-center gap-2 text-[12px] max-sm:grid-cols-[minmax(0,8.5rem)_1fr_3rem]">
          <span className="min-w-0 truncate" title={`${r.to}: ${r.what}`}>
            <span className={r.ok ? 'text-ink-200' : 'text-danger-300'}>{r.what}</span>
            {r.count > 1 && <span className="text-ink-500"> ×{r.count}</span>}
            <span className="block truncate text-[11px] text-ink-500">{r.to}{r.failed > 0 && <span className="text-danger-300">, {r.failed} failed</span>}</span>
          </span>
          <span className="relative h-2 rounded-full bg-white/[0.04]">
            <span className={`absolute inset-y-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${r.ok ? 'bg-gold-400/80' : 'bg-danger-400/80'}`}
              style={{ left: `${(r.at / span) * 100}%`, width: grown ? `max(${(r.ms / span) * 100}%, 3px)` : '0%', transitionDelay: `${Math.min(i * 60, 900)}ms` }} />
          </span>
          <span className="readout text-right text-ink-400">{r.ms} ms</span>
        </li>
      ))}
    </ol>
  );
}

// What came in, what went out, and our response, for one call.
export const CallFlow: React.FC<Props> = ({ tool, args, transport, status, latencyMs, trail, verdict }) => {
  const entries = Object.entries(args);
  const lookups = trail?.length ?? 0;
  return (
    <div className="rounded-xl border border-line surface p-4">
      <h3 className="mb-3 text-[13.5px] font-semibold text-tan-200">How this answer was made</h3>
      <ol className="space-y-[14px]">
        <Station title="What came in" aside={transport.toUpperCase()}>
          <p className="font-mono text-[12px] text-gold-200">{tool}</p>
          {entries.length ? (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[12px]">
              {entries.map(([k, v]) => <React.Fragment key={k}><dt className="text-ink-500">{k}</dt><dd className="min-w-0 truncate text-ink-300" title={typeof v === 'string' ? v : JSON.stringify(v)}>{argText(v)}</dd></React.Fragment>)}
            </dl>
          ) : <p className="text-[12px] text-ink-500">No inputs.</p>}
        </Station>
        <Station title="What went out" aside={trail ? `${lookups} ${lookups === 1 ? 'lookup' : 'lookups'}` : undefined}>
          {transport === 'mcp' ? <p className="text-[12.5px] text-ink-500">The list of lookups comes back on HTTP calls. Switch to HTTP and run it again to see them.</p>
            : !trail ? <p className="text-[12.5px] text-ink-500">This answer came back without the list of lookups.</p>
            : lookups === 0 ? <p className="text-[12.5px] text-ink-500">Nothing. Pulse answered from what it already knew{status >= 400 ? ', or stopped at the inputs' : ''}.</p>
            : <Waterfall steps={trail} />}
        </Station>
        <Station title="Our response" aside={`${latencyMs} ms`} last>
          <p className="text-[12.5px] text-ink-300">
            <span className={`readout font-semibold ${status >= 200 && status < 300 ? 'text-success-300' : status === 402 ? 'text-warning-200' : 'text-danger-300'}`}>HTTP {status}</span>
            {verdict && <> with verdict <span className="font-semibold text-ink-100">{verdict}</span></>}
          </p>
        </Station>
      </ol>
    </div>
  );
};
