import React, { useEffect, useState } from 'react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { Code, H2, P, PageHeader, Table } from '../components/docs/DocParts';
import { CheckLine, Stamp, isCheckStatus } from '../components/ui/verdict';
import { useCountUp } from '../hooks/motion';
import { ON_SITE } from '../../server/site';

// The public track record: token_safety's answers against what really happened, from GET /api/track-record
// (server/track-record.ts). The explanations render on the server; the numbers load in the browser.

type Rate = { tokens: number; liquidityPulled: number };
type Record_ = {
  updatedAt: string;
  youngTokens: null | { about: string; checked: number; verdicts: Record<string, number>; followedUp: number; outcomeKnown: number;
    lostMostByVerdict: Record<string, string>; ofTokensThatLostMost: { calledAvoid: string; calledSafe: string };
    howTheyLostIt: { priceDown90: number; liquidityDown90: number; rugcheckRugged: number } };
  knownGood: null | { about: string; cohort: string; tokens: number; calledSafe: string; calledAvoid: string };
  batchAbout?: string;
  batches?: { name: string; checked: number; followedUp: number; outcomeKnown: number; lostMostByVerdict: Record<string, string>;
    laterChecks: Record<string, { readAgain: number; lostMost: string }> }[];
  research?: null | Research;
  watch: { about: string; watchingNow: number; watched90d: number; readings90d: number;
    byVerdict: Record<string, { watched: number; withinADay: Rate; withinAWeek: Rate }>;
    recent: { mint: string; symbol: string | null; verdictThen: string; at: string; what: string; result: string; detail: string; hoursAfterFirstCheck: number }[] };
};

type Side = { pct: number | null; range: [number, number]; olderPct: number | null; newerPct: number | null; holdsUp: boolean };
type Change = { startedHolding: string[]; stoppedHolding: string[] };
type Research = {
  ranAt: string; rules: { didWell: string; lostMost: string; holdsUp: string }; tokens: number; bySource: Record<string, number>;
  checkedFrom: string | null; checkedTo: string | null; base: { didWell: number | null; lostMost: number | null };
  holdsUp: { didWell: string[]; lostMost: string[] };
  patterns: { trait: string; tokens: number; didWell: Side; lostMost: Side }[];
  didWell: { mint: string; symbol: string | null; checkedAt: string; times: number; ageHours: number | null }[];
  weeks: { week: number; day: string; tokens: number; newTokens: number; base: { didWell: number | null; lostMost: number | null };
    didWell: Change; lostMost: Change }[];
};

const VERDICTS = ['AVOID', 'CAUTION', 'SAFE'];
const pctText = (p: number | null) => (p === null ? 'no data' : `${p}%`);
const changeText = (c: Change) => [c.startedHolding.length ? `now holds up: ${c.startedHolding.join(', ')}` : '', c.stoppedHolding.length ? `stopped holding up: ${c.stoppedHolding.join(', ')}` : ''].filter(Boolean).join('; ') || 'no change';
const number = new Intl.NumberFormat();
const CountUp: React.FC<{ value: number }> = ({ value }) => <>{number.format(useCountUp(value))}</>;
const rate = (r: Rate) => (r.tokens ? `${Math.round((r.liquidityPulled / r.tokens) * 100)}% (${r.liquidityPulled} of ${r.tokens})` : 'not enough time yet');
const short = (mint: string) => `${mint.slice(0, 4)}…${mint.slice(-4)}`;
const after = (h: number) => (h < 1 ? 'within the hour' : h < 48 ? `${h} h after` : `${Math.round(h / 24)} days after`);

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex flex-col-reverse justify-end bg-panel px-5 py-5 sm:px-6">
    <dt className="mt-1 text-[13px] leading-[1.45] text-ink-400">{label}</dt>
    <dd className="display text-[2rem] font-bold tabular-nums">{value}</dd>
  </div>
);

const Box: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="mb-10 overflow-hidden rounded-2xl border border-line surface">{children}</section>
);

export const TrackRecordPage: React.FC = () => {
  const [data, setData] = useState<Record_ | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('/api/track-record', { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); })
      .catch(() => setFailed(true));
  }, []);
  const y = data?.youngTokens, g = data?.knownGood, w = data?.watch, r = data?.research;
  const dash = failed ? 'n/a' : '—';

  return (
    <article className="max-w-4xl">
      <PageHeader title="Track record" lead="What token_safety said, against what really happened. Every number here is measured from real follow-ups on real tokens; nothing is assumed, and tokens with no answer are left out." />
      {failed && <p role="status" className="mb-8 rounded-lg border border-line px-4 py-3 text-[14px] text-ink-400">The numbers can't be loaded right now. Refresh to try again.</p>}

      <H2>New tokens, a week later</H2>
      <P>{y?.about ?? 'Young tokens people are buying right now are checked once, then looked at again a week later to see whether buyers lost most of their money.'}</P>
      <Box>
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          <Stat label="New tokens checked" value={y ? <CountUp value={y.checked} /> : dash} />
          <Stat label="Called AVOID" value={y ? <CountUp value={y.verdicts.AVOID ?? 0} /> : dash} />
          <Stat label="Looked at again" value={y ? <CountUp value={y.followedUp} /> : dash} />
          <Stat label="Outcome known" value={y ? <CountUp value={y.outcomeKnown} /> : dash} />
        </dl>
        <div className="px-5 py-5 sm:px-6">
          {y && y.outcomeKnown === 0 ? <p className="text-[14px] text-ink-400">No week-later results yet: each token is looked at again 7 days after its check. They appear here as they come in.</p> : y && <>
            <Table head={['Pulse said', 'Lost most of their money within a week']} minWidth={360}
              rows={VERDICTS.map((v) => [<Stamp key={v} verdict={v} size="sm" />, <span key="r" className="tabular-nums">{y.lostMostByVerdict[v]}</span>])} />
            <p className="mt-3 text-[14px] text-ink-300">Of the tokens that did lose most, Pulse had called <b>{y.ofTokensThatLostMost.calledAvoid}</b> AVOID and <b>{y.ofTokensThatLostMost.calledSafe}</b> SAFE.</p>
          </>}
        </div>
      </Box>

      <H2>Every batch</H2>
      <P>{data?.batchAbout ?? 'New tokens are checked in batches of 100; when a batch is full the next one starts, and earlier batches keep being looked at again.'}</P>
      {data?.batches?.length ? <Box><div className="px-5 py-5 sm:px-6">
        <Table head={['Batch', 'Checked', 'Week-later result known', 'AVOID lost most', 'CAUTION lost most', '30 days on', '90 days on']} minWidth={760}
          rows={data.batches.map((b) => [b.name, b.checked, b.outcomeKnown, b.lostMostByVerdict.AVOID ?? '—', b.lostMostByVerdict.CAUTION ?? '—',
            b.laterChecks.after30Days?.readAgain ? `lost most: ${b.laterChecks.after30Days.lostMost}` : 'not yet', b.laterChecks.after90Days?.readAgain ? `lost most: ${b.laterChecks.after90Days.lostMost}` : 'not yet'])} />
      </div></Box> : <p className="mb-10 text-[14px] text-ink-500">{dash}</p>}

      {ON_SITE.research && <>
      <H2>What winners and losers had in common</H2>
      <P>Worked out again every day on Google Cloud from every new token with a week-later result, and kept as a weekly report. It describes tokens that already happened; it is not a buy signal and doesn't say what any token will do next.</P>
      {r ? <Box><div className="px-5 py-5 sm:px-6">
        <p className="mb-4 text-[14px] leading-[1.6] text-ink-300"><b>{r.tokens}</b> tokens ({Object.entries(r.bySource).map(([k, v]) => `${v} from the ${k}`).join(', ')}). Did well: <b>{pctText(r.base.didWell)}</b>. Lost most: <b>{pctText(r.base.lostMost)}</b>.</p>
        <ul className="mb-5 space-y-1 text-[13px] text-ink-400">
          <li><b className="text-ink-200">Did well:</b> {r.rules.didWell}</li>
          <li><b className="text-ink-200">Lost most:</b> {r.rules.lostMost}</li>
          <li><b className="text-ink-200">Holds up:</b> {r.rules.holdsUp}</li>
        </ul>
        <p className="mb-2 text-[14px] text-ink-200">Holds up for doing well: {r.holdsUp.didWell.length ? r.holdsUp.didWell.join(', ') : 'nothing yet'}.</p>
        <p className="mb-5 text-[14px] text-ink-200">Holds up for losing most: {r.holdsUp.lostMost.length ? r.holdsUp.lostMost.join(', ') : 'nothing yet'}.</p>
        <Table head={['At first check', 'Tokens', 'Did well', 'Lost most', 'Holds up?']} minWidth={640}
          rows={[...r.patterns].sort((a, b) => b.tokens - a.tokens).slice(0, 30).map((p) => [p.trait, p.tokens,
            `${pctText(p.didWell.pct)} (${p.didWell.range[0]}–${p.didWell.range[1]}%)`, `${pctText(p.lostMost.pct)} (${p.lostMost.range[0]}–${p.lostMost.range[1]}%)`,
            [p.didWell.holdsUp && 'for doing well', p.lostMost.holdsUp && 'for losing most'].filter(Boolean).join(', ') || 'no'])} />
        <h3 className="mb-3 mt-6 text-[14px] font-semibold text-ink-200">Weekly reports</h3>
        {r.weeks.length ? <ul className="space-y-2 text-[14px] text-ink-300">{r.weeks.map((wk) => (
          <li key={wk.day}><b className="text-ink-100">Week {wk.week} ({wk.day}):</b> {wk.tokens} tokens ({wk.newTokens} new), did well {pctText(wk.base.didWell)}, lost most {pctText(wk.base.lostMost)}. Doing well: {changeText(wk.didWell)}. Losing most: {changeText(wk.lostMost)}.</li>
        ))}</ul> : <p className="text-[14px] text-ink-500">The first weekly report comes 7 days after the first daily run.</p>}
        <h3 className="mb-3 mt-6 text-[14px] font-semibold text-ink-200">Tokens that did well</h3>
        {r.didWell.length ? <Table head={['Token', 'A week later', 'Age at check']} minWidth={420}
          rows={r.didWell.slice(0, 25).map((t) => [<a key="t" href={`https://solscan.io/token/${t.mint}`} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-4">{t.symbol ?? short(t.mint)}</a>, `${t.times}x the price`, t.ageHours === null ? 'unknown' : `${t.ageHours} h`])} />
          : <p className="text-[14px] text-ink-500">None yet.</p>}
        <p className="mt-4 text-[12.5px] text-ink-500">Ranges are 95% intervals: with a few dozen tokens they are wide. Last run {new Date(r.ranAt).toLocaleString()}.</p>
      </div></Box> : <p className="mb-10 text-[14px] text-ink-500">{failed ? 'n/a' : 'The first daily run hasn\'t happened yet.'}</p>}
      </>}

      <H2>Well-known tokens (false alarms)</H2>
      <P>{g?.about ?? 'Established, liquid, verified tokens should come out SAFE. AVOID on one of them is a false alarm.'}</P>
      <Box>
        <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
          <Stat label="Well-known tokens checked" value={g ? <CountUp value={g.tokens} /> : dash} />
          <Stat label="Called SAFE" value={g ? g.calledSafe.split(' ')[0] : dash} />
          <Stat label="Called AVOID (false alarm)" value={g ? g.calledAvoid.split(' ')[0] : dash} />
        </dl>
      </Box>

      <H2>Token watch</H2>
      <P>{w?.about ?? 'Pulse keeps re-reading young tokens for a week after it first checks them.'} When you run <Link to={toolPath('token_safety')} className="text-accent-300 underline decoration-accent-300/30 underline-offset-4"><Code>token_safety</Code></Link> on a token Pulse has watched, its answer includes a <Code>history</Code> of what changed since.</P>
      <Box>
        <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
          <Stat label="Watching now" value={w ? <CountUp value={w.watchingNow} /> : dash} />
          <Stat label="Watched in the last 90 days" value={w ? <CountUp value={w.watched90d} /> : dash} />
          <Stat label="Readings taken" value={w ? <CountUp value={w.readings90d} /> : dash} />
        </dl>
        {w && <div className="px-5 py-5 sm:px-6">
          <Table head={['Pulse said', 'Watched', 'Liquidity pulled within a day', 'Within a week']} minWidth={520}
            rows={VERDICTS.map((v) => [<Stamp key={v} verdict={v} size="sm" />, w.byVerdict[v].watched, rate(w.byVerdict[v].withinADay), rate(w.byVerdict[v].withinAWeek)])} />
          <h3 className="mb-3 mt-6 text-[14px] font-semibold text-ink-200">Latest changes</h3>
          {w.recent.length ? <ul className="space-y-3">
            {w.recent.map((c) => <CheckLine key={`${c.mint}-${c.what}`} status={isCheckStatus(c.result) ? c.result : 'info'}
              title={<a href={`https://solscan.io/token/${c.mint}`} target="_blank" rel="noreferrer" className="underline decoration-white/20 underline-offset-4">{c.symbol ?? short(c.mint)}</a>}>
              <span className="text-ink-300">{c.detail}</span>{' '}
              <span className="text-[13px] text-ink-500">{after(c.hoursAfterFirstCheck)} Pulse first checked it (said <Stamp verdict={c.verdictThen} size="sm" className="mx-0.5 align-middle" />).</span>
            </CheckLine>)}
          </ul> : <p className="text-[14px] text-ink-500">No changes recorded yet.</p>}
        </div>}
      </Box>

      <P>A check can't make a token safe. SAFE only means none of the traps Pulse knows about were found. The patterns above describe tokens that already happened, not what any token will do next. Pulse never gives buy signals.</P>
      {data && <p className="text-[12.5px] text-ink-500">Updated {new Date(data.updatedAt).toLocaleString()}.</p>}
    </article>
  );
};
