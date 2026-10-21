import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronDown, Radio, Search, TriangleAlert, User } from 'lucide-react';
import { loadOwnerCalls, type CallFilters, type CallGroup, type CallRow, type GroupBy, type GroupSort, type OwnerCalls } from '../../lib/ownerApi';
import { ago, chip, Empty, Footnote, LABEL, num, plural, shown, Swatch, td, usd, type ShownKind } from './ui';
import { CallDetail } from './CallDetail';

// Explorer: every tool call in one place, straight from the database. Show the calls one by one, or fold them by
// caller, network, tool, caller kind or input kind; sort by most calls, most recent, own inputs, errors or money;
// open a group for its calls and a call for its full input and output. The calls list updates itself while open.

const PERIODS = [{ hours: 1, label: '1 hour' }, { hours: 24, label: '24 hours' }, { hours: 168, label: '7 days' }, { hours: 720, label: '30 days' }];
const VIEWS: { id: GroupBy | 'calls'; label: string }[] = [
  { id: 'calls', label: 'Every call' }, { id: 'caller', label: 'Callers' }, { id: 'network', label: 'Networks' },
  { id: 'tool', label: 'Tools' }, { id: 'kind', label: 'Caller types' }, { id: 'input', label: 'Input types' },
];
const SORTS: { id: GroupSort; label: string }[] = [
  { id: 'calls', label: 'Most calls' }, { id: 'recent', label: 'Most recent' }, { id: 'own', label: 'Most own inputs' },
  { id: 'errors', label: 'Most errors' }, { id: 'paid', label: 'Most paid' },
];
const INPUTS = { own: 'Own input', example: 'Example', empty: 'Empty' } as const;
const RESULTS = { ok: 'Answered', error: 'Error', payment: 'Payment' } as const;
const OUTCOME: Record<string, string> = { paid: 'Paid', payment_asked: 'Asked to pay', error: 'Error', free_call: 'Free call', owner_key: 'Owner key', ok: 'Answered' };
const LIVE_MS = 8000;

// Whether bots and the owner's own calls are hidden, remembered in this browser only (bots hidden by default).
const HIDE_KEY = 'owner-explorer-hide';
const readHide = (): { bots: boolean; mine: boolean } => {
  try { return { bots: true, mine: false, ...JSON.parse(localStorage.getItem(HIDE_KEY) || '{}') }; } catch { return { bots: true, mine: false }; }
};

const InputBadge: React.FC<{ kind: CallRow['inputKind'] }> = ({ kind }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-medium ${kind === 'own'
    ? 'bg-accent-500/20 text-accent-200 ring-1 ring-accent-400/40' : kind === 'example' ? 'bg-white/5 text-ink-300' : 'border border-dashed border-white/15 text-ink-500'}`}>
    {INPUTS[kind]}
  </span>
);
const ResultBadge: React.FC<{ call: CallRow }> = ({ call }) => {
  const tone = call.outcome === 'paid' ? 'text-success-300' : call.outcome === 'payment_asked' ? 'text-warning-300' : call.outcome === 'error' ? 'text-danger-300' : 'text-ink-300';
  return <span className={`whitespace-nowrap ${tone}`}>{OUTCOME[call.outcome] ?? call.outcome}{call.outcome === 'error' && <span className="font-mono text-ink-500"> {call.status}</span>}</span>;
};
const KindName: React.FC<{ kind: string; name: string; network?: string | null; rotates?: boolean }> = ({ kind, name, network, rotates }) => (
  <span className="flex min-w-0 items-center gap-1.5">
    <Swatch kind={shown(kind as any)} /><span className="truncate text-ink-100">{name}</span>
    {network && <span className="font-mono text-[10.5px] text-ink-500">{network}</span>}
    {rotates && <span title="Answers as several desktop browsers: a crawler" className="inline-flex items-center gap-0.5 rounded bg-warning-500/15 px-1 text-[10px] text-warning-300"><TriangleAlert className="h-2.5 w-2.5" />fake browser</span>}
  </span>
);

// One call: a row that opens to its full input and output.
const CallLine: React.FC<{ call: CallRow; ownerKey: string; fresh: boolean; delay: number }> = ({ call, ownerKey, fresh, delay }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={`row-button call-row-in ${fresh ? 'call-row-new' : ''} ${open ? 'row-open' : ''}`} style={{ animationDelay: `${delay}ms` }} onClick={() => setOpen((o) => !o)}>
        <td className={td}><span className="flex items-center gap-1.5 whitespace-nowrap"><ChevronDown className={`h-3.5 w-3.5 text-ink-500 transition ${open ? '' : '-rotate-90'}`} />
          <span title={new Date(call.at).toLocaleString()}>{ago(call.at)}</span></span></td>
        <td className={`${td} font-mono text-ink-100`}>{call.tool}<span className="ml-1.5 text-[10px] text-ink-500">{call.transport}</span></td>
        <td className={`${td} max-w-[220px]`}><KindName kind={call.caller.kind} name={call.caller.name} network={call.caller.network} rotates={call.caller.rotatesBrowsers} /></td>
        <td className={td}><InputBadge kind={call.inputKind} /></td>
        <td className={td}><ResultBadge call={call} /></td>
        <td className={`${td} max-w-[320px] truncate text-ink-400`} title={call.headline ?? ''}>{call.headline ?? '—'}</td>
      </tr>
      {open && <tr className="row-detail"><td colSpan={6} className="px-3 pb-3"><CallDetail call={call} ownerKey={ownerKey} /></td></tr>}
    </>
  );
};

// A list of calls for some filters: newest first, older pages on request, new calls slide in while live.
const CallList: React.FC<{ ownerKey: string; filters: CallFilters; live?: boolean; onData?: (d: OwnerCalls) => void }> = ({ ownerKey, filters, live, onData }) => {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [state, setState] = useState<'loading' | 'ready' | string>('loading');
  const key = JSON.stringify(filters);
  const top = useRef<number>(0);
  useEffect(() => {
    let alive = true;
    setState('loading');
    loadOwnerCalls(ownerKey, { ...filters, limit: 100 }).then((d) => {
      if (!alive) return;
      setRows(d.rows); setNext(d.nextBefore); setFresh(new Set()); top.current = d.rows[0]?.id ?? 0; setState('ready'); onData?.(d);
    }).catch((e) => alive && setState(e instanceof Error ? e.message : 'Could not load the calls.'));
    return () => { alive = false; };
  }, [key, ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const d = await loadOwnerCalls(ownerKey, { ...filters, after: top.current || undefined, limit: 100 });
        onData?.(d);
        if (!d.rows.length) return;
        top.current = d.rows[0].id;
        setRows((r) => [...d.rows, ...r]);
        setFresh(new Set(d.rows.map((c) => c.id)));
      } catch { /* try again next tick */ }
    }, LIVE_MS);
    return () => clearInterval(t);
  }, [live, key, ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const older = async () => {
    if (!next) return;
    const d = await loadOwnerCalls(ownerKey, { ...filters, before: next, limit: 100 });
    setRows((r) => [...r, ...d.rows]); setNext(d.nextBefore);
  };
  if (state === 'loading') return <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 animate-shimmer rounded-md bg-white/5" />)}</div>;
  if (state !== 'ready') return <Empty>{state}</Empty>;
  if (!rows.length) return <Empty>No calls match.</Empty>;
  return (
    <>
      <div className="table-scroll">
        <table className="data-table text-[12px] text-ink-300" style={{ minWidth: 860 }}>
          <thead><tr>{['When', 'Tool', 'Caller', 'Input', 'Result', 'Answer'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((c, i) => <CallLine key={c.id} call={c} ownerKey={ownerKey} fresh={fresh.has(c.id)} delay={Math.min(i, 20) * 18} />)}</tbody>
        </table>
      </div>
      {next && <div className="px-4 py-3"><button onClick={() => void older()} className={chip(false)}>Load older calls</button></div>}
    </>
  );
};

// One group (a caller, a network, a tool...): its numbers in a row that opens to its calls.
const GroupLine: React.FC<{ g: CallGroup; by: GroupBy; ownerKey: string; base: CallFilters; delay: number }> = ({ g, by, ownerKey, base, delay }) => {
  const [open, setOpen] = useState(false);
  const label = by === 'caller' ? <KindName kind={g.kind ?? 'other'} name={g.label} network={g.network} rotates={g.rotatesBrowsers} />
    : by === 'kind' ? <span className="flex items-center gap-1.5"><Swatch kind={g.key as ShownKind} />{LABEL[g.key as ShownKind] ?? g.key}</span>
    : by === 'input' ? <InputBadge kind={g.key as CallRow['inputKind']} />
    : by === 'network' ? <span className="flex items-center gap-1.5 font-mono text-ink-100">{g.key}{g.rotatesBrowsers && <span className="rounded bg-warning-500/15 px-1 font-sans text-[10px] text-warning-300">fake browser</span>}<span className="truncate font-sans text-[11px] text-ink-500">{g.names.slice(0, 3).join(', ')}</span></span>
    : <span className="font-mono text-ink-100">{g.label}</span>;
  return (
    <>
      <tr className={`row-button call-row-in ${open ? 'row-open' : ''}`} style={{ animationDelay: `${delay}ms` }} onClick={() => setOpen((o) => !o)}>
        <td className={`${td} max-w-[280px]`}><span className="flex items-center gap-1.5"><ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-500 transition ${open ? '' : '-rotate-90'}`} />{label}</span></td>
        <td className={`${td} text-right tabular-nums text-ink-100`}>{num.format(g.calls)}</td>
        <td className={`${td} text-right tabular-nums ${g.own ? 'text-accent-200' : 'text-ink-500'}`}>{num.format(g.own)}</td>
        <td className={`${td} text-right tabular-nums ${g.errors ? 'text-danger-300' : 'text-ink-500'}`}>{num.format(g.errors)}</td>
        <td className={`${td} text-right tabular-nums ${g.paidUsdc ? 'text-success-300' : 'text-ink-500'}`}>{g.paidUsdc ? usd(g.paidUsdc) : g.payments ? `${g.payments} asked` : '—'}</td>
        <td className={`${td} max-w-[260px] truncate font-mono text-[11px] text-ink-400`}>{g.tools.slice(0, 4).map((t) => `${t.tool} ${t.n}`).join(' · ')}</td>
        <td className={`${td} whitespace-nowrap`} title={new Date(g.lastAt).toLocaleString()}>{ago(g.lastAt)}</td>
      </tr>
      {open && <tr className="row-detail"><td colSpan={7} className="border-l-2 border-accent-500/40 bg-black/15 p-0"><CallList ownerKey={ownerKey} filters={{ ...base, ...g.filter, group: undefined }} /></td></tr>}
    </>
  );
};

const GroupTable: React.FC<{ data: OwnerCalls; ownerKey: string; base: CallFilters }> = ({ data, ownerKey, base }) => !data.groups?.length ? <Empty>No calls match.</Empty> : (
  <div className="table-scroll">
    <table className="data-table text-[12px] text-ink-300" style={{ minWidth: 820 }}>
      <thead><tr>{[VIEWS.find((v) => v.id === data.group)!.label, 'Calls', 'Own inputs', 'Errors', 'Paid', 'Tools', 'Last call'].map((h, i) =>
        <th key={h} className={`px-3 py-2 ${i > 0 && i < 5 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody>{data.groups.map((g, i) => <GroupLine key={g.key} g={g} by={data.group!} ownerKey={ownerKey} base={base} delay={Math.min(i, 20) * 18} />)}</tbody>
    </table>
  </div>
);

const Counter: React.FC<{ label: string; value: number; tone?: string; note?: string }> = ({ label, value, tone = 'text-white', note }) => (
  <div className="px-4 py-3">
    <div className="text-[11.5px] text-ink-400">{label}</div>
    <div key={value} className={`display mt-1 animate-fade-up text-[1.6rem] font-bold tabular-nums ${tone}`}>{num.format(value)}</div>
    {note && <div className="text-[10.5px] text-ink-500">{note}</div>}
  </div>
);

export const ExplorerTab: React.FC<{ ownerKey: string }> = ({ ownerKey }) => {
  const [hours, setHours] = useState(24);
  const [view, setView] = useState<GroupBy | 'calls'>('calls');
  const [sort, setSort] = useState<GroupSort>('calls');
  const [kind, setKind] = useState('');
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('');
  const [tool, setTool] = useState('');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [live, setLive] = useState(true);
  const [hide, setHide] = useState(readHide);
  const toggleHide = (which: 'bots' | 'mine') => setHide((h) => {
    const next = { ...h, [which]: !h[which] };
    try { localStorage.setItem(HIDE_KEY, JSON.stringify(next)); } catch { /* not remembered */ }
    return next;
  });
  const [data, setData] = useState<OwnerCalls | null>(null);
  const [grouped, setGrouped] = useState<OwnerCalls | null>(null);
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 350); return () => clearTimeout(t); }, [typed]);

  const base: CallFilters = useMemo(() => ({ hours, kind: kind || undefined, input: input || undefined, status: status || undefined, tool: tool || undefined, q: q || undefined,
    hideBots: hide.bots ? '1' : undefined, hideMine: hide.mine ? '1' : undefined } as CallFilters), [hours, kind, input, status, tool, q, hide]);
  // Grouped views load their groups here; the calls view loads through its CallList.
  const groupKey = JSON.stringify({ base, view, sort });
  useEffect(() => {
    if (view === 'calls') return;
    let alive = true;
    setGrouped(null);
    loadOwnerCalls(ownerKey, { ...base, group: view, sort, limit: 1 }).then((d) => { if (alive) { setGrouped(d); setData(d); } }).catch(() => {});
    return () => { alive = false; };
  }, [groupKey, ownerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const onData = useCallback((d: OwnerCalls) => setData(d), []);

  const s = data?.summary;
  const chips = <T extends string>(label: string, value: string, set: (v: string) => void, options: Record<T, string>, counts?: Record<string, number>) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] text-ink-500">{label}</span>
      <button className={chip(value === '')} onClick={() => set('')}>All</button>
      {(Object.keys(options) as T[]).map((k) => <button key={k} className={chip(value === k)} onClick={() => set(value === k ? '' : k)}>
        {options[k]}{counts?.[k] ? <span className="ml-1 tabular-nums text-ink-500">{num.format(counts[k])}</span> : null}</button>)}
    </div>
  );
  const kinds = Object.fromEntries((['you', 'bot', 'ai_app', 'script', 'browser', 'other'] as ShownKind[]).map((k) => [k, LABEL[k]])) as Record<ShownKind, string>;

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink-100">Every call, caller and network</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {PERIODS.map((p) => <button key={p.hours} onClick={() => setHours(p.hours)} aria-pressed={hours === p.hours}
              className={`px-2.5 py-1.5 text-[11px] transition ${hours === p.hours ? 'bg-white/10 text-white' : 'text-ink-400 hover:text-white'}`}>{p.label}</button>)}
          </div>
          <button onClick={() => toggleHide('bots')} aria-pressed={hide.bots} title="Directory and uptime bots, and networks posing as several browsers"
            className={`${chip(hide.bots)} inline-flex items-center gap-1.5`}><Bot className="h-3 w-3" />{hide.bots ? 'Bots hidden' : 'Hide bots'}</button>
          <button onClick={() => toggleHide('mine')} aria-pressed={hide.mine} title="Calls from your own networks and with your owner key"
            className={`${chip(hide.mine)} inline-flex items-center gap-1.5`}><User className="h-3 w-3" />{hide.mine ? 'Mine hidden' : 'Hide mine'}</button>
          <button onClick={() => setLive((l) => !l)} aria-pressed={live} className={`${chip(live)} inline-flex items-center gap-1.5`}>
            <span className={`live-dot ${live ? 'on' : ''}`} /><Radio className="h-3 w-3" />{live ? 'Live' : 'Paused'}
          </button>
        </div>
      </div>

      {s && <div className="grid grid-cols-2 divide-x divide-white/10 border-b border-white/10 sm:grid-cols-4">
        <Counter label="Calls" value={data!.matching} note={[data!.matching !== s.calls ? `of ${num.format(s.calls)} shown` : '', s.hidden ? `${num.format(s.hidden)} hidden` : '', s.capped ? 'newest 20,000' : ''].filter(Boolean).join(' · ') || undefined} />
        <Counter label="Own inputs" value={s.byInput.own ?? 0} tone="text-accent-200" note="typed by the caller, not the example" />
        <Counter label="Networks" value={s.networks} note="bots counted once each" />
        <Counter label="Fake-browser networks" value={s.rotatingNetworks} tone={s.rotatingNetworks ? 'text-warning-300' : 'text-white'} note={hide.bots ? 'crawlers posing as browsers: hidden' : 'crawlers posing as several browsers'} />
      </div>}

      <div className="space-y-2.5 border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search inputs, answers, wallets, user agents, networks…"
              className="w-full rounded-lg border border-white/10 bg-black/25 py-1.5 pl-8 pr-3 text-[12px] text-ink-100 placeholder:text-ink-500 focus:border-accent-400/60 focus:outline-none" />
          </label>
          <select value={tool} onChange={(e) => setTool(e.target.value)} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-[12px] text-ink-200">
            <option value="">All tools</option>
            {Object.entries<number>(s?.byTool ?? {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => <option key={t} value={t}>{t} ({num.format(n)})</option>)}
          </select>
        </div>
        {chips('Caller', kind, setKind, kinds, s?.byKind)}
        {chips('Input', input, setInput, INPUTS, s?.byInput)}
        {chips('Result', status, setStatus, RESULTS, s?.byStatus)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((v) => <button key={v.id} onClick={() => setView(v.id)} aria-pressed={view === v.id}
            className={`rounded-md px-2.5 py-1 text-[12px] transition ${view === v.id ? 'bg-accent-500/20 text-white' : 'text-ink-400 hover:bg-white/5 hover:text-white'}`}>{v.label}</button>)}
        </div>
        {view !== 'calls' && <select value={sort} onChange={(e) => setSort(e.target.value as GroupSort)} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[12px] text-ink-200">
          {SORTS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>}
      </div>

      {view === 'calls' ? <CallList ownerKey={ownerKey} filters={base} live={live} onData={onData} />
        : grouped ? <GroupTable data={grouped} ownerKey={ownerKey} base={base} /> : <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-shimmer rounded-md bg-white/5" />)}</div>}

      <Footnote>Straight from the database. Inputs and outputs are kept {plural(30, 'day')}; older calls show their numbers only.
        "Example" means the caller sent an example input this site handed out (recorded from 21 October 2026; earlier examples count as own input).
        A network that answers as several desktop browsers is flagged as a fake browser. "Hide bots" hides directory and uptime bots and
        those fake-browser networks; "Hide mine" hides calls from networks you opened this page from and calls with your owner key. Both are remembered in this browser.</Footnote>
    </section>
  );
};
