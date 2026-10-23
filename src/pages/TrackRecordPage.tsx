import React, { useEffect, useState } from 'react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { Code, H2, P, PageHeader, Table } from '../components/docs/DocParts';
import { CheckLine, Stamp, isCheckStatus } from '../components/ui/verdict';
import { useCountUp } from '../hooks/motion';

// The public track record: token_safety's answers against what really happened, from GET /api/track-record
// (server/track-record.ts). The explanations render on the server; the numbers load in the browser.

type Rate = { tokens: number; liquidityPulled: number };
type Record_ = {
  updatedAt: string;
  youngTokens: null | { about: string; checked: number; verdicts: Record<string, number>; followedUp: number; outcomeKnown: number;
    lostMostByVerdict: Record<string, string>; ofTokensThatLostMost: { calledAvoid: string; calledSafe: string };
    howTheyLostIt: { priceDown90: number; liquidityDown90: number; rugcheckRugged: number } };
  knownGood: null | { about: string; cohort: string; tokens: number; calledSafe: string; calledAvoid: string };
  watch: { about: string; watchingNow: number; watched90d: number; readings90d: number;
    byVerdict: Record<string, { watched: number; withinADay: Rate; withinAWeek: Rate }>;
    recent: { mint: string; symbol: string | null; verdictThen: string; at: string; what: string; result: string; detail: string; hoursAfterFirstCheck: number }[] };
};

const VERDICTS = ['AVOID', 'CAUTION', 'SAFE'];
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
  const y = data?.youngTokens, g = data?.knownGood, w = data?.watch;
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

      <P>A check can't make a token safe. SAFE only means none of the traps Pulse knows about were found, and none of this says whether a price will rise or fall. Pulse never gives buy signals.</P>
      {data && <p className="text-[12.5px] text-ink-500">Updated {new Date(data.updatedAt).toLocaleString()}.</p>}
    </article>
  );
};
