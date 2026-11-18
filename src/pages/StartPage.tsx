import React, { useState } from 'react';
import { Play, PlayCircle, Radio } from 'lucide-react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { CATEGORY_LABELS, loadExample, runTool, type ToolDoc, type ToolsIndex } from '../lib/toolsApi';
import { H2, P, PageHeader } from '../components/docs/DocParts';
import { INTRO_VIDEOS, SETUP_VIDEOS, STORY_VIDEO, TOOL_ORDER, TOOL_VIDEOS } from '../data/videos';

// Start here: the order a newcomer should see things in. The story, what Pulse does, then every tool with its video,
// what it's for and a live call on mainnet, then how to add Pulse to an app. Tool text comes from the tool registry
// (the same words as the docs and MCP), so this page can't drift from what the tools really do.

// A YouTube video that loads only when tapped (19+ players at once would make the page heavy on a phone).
const Video: React.FC<{ id: string; title: string }> = ({ id, title }) => {
  const [on, setOn] = useState(false);
  if (!id) return <div className="grid aspect-video place-items-center rounded-xl border border-line surface text-[14px] text-ink-500">Video coming</div>;
  return on ? (
    <iframe className="aspect-video w-full rounded-xl border border-line" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
      title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
  ) : (
    <button type="button" onClick={() => setOn(true)} aria-label={`Play: ${title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />
      <PlayCircle className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-lg" />
    </button>
  );
};

// The tool's own example, run live against mainnet when asked (never on page load: each run is one of the visitor's
// free calls and a real chain lookup).
const LiveExample: React.FC<{ tool: ToolDoc }> = ({ tool }) => {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [out, setOut] = useState<{ args: Record<string, unknown>; status: number; ms: number; body: unknown } | null>(null);
  const [err, setErr] = useState('');
  const run = async () => {
    setState('running'); setErr('');
    try {
      const args = await loadExample(tool.name);
      const r = await runTool(tool.name, args, 'http');
      setOut({ args, status: r.status, ms: Math.round(r.latencyMs), body: r.body }); setState('done');
    } catch (e: any) { setErr(String(e?.message ?? e)); setState('error'); }
  };
  const text = out ? JSON.stringify(out.body, null, 2) : '';
  return (
    <div className="mt-4">
      <button type="button" onClick={run} disabled={state === 'running'}
        className="inline-flex items-center gap-2 rounded-lg border border-accent-500/40 bg-accent-500/10 px-3.5 py-2 text-[14px] font-medium text-accent-200 transition hover:bg-accent-500/20 disabled:opacity-60">
        <Radio className="h-4 w-4" />{state === 'running' ? 'Asking mainnet…' : state === 'done' ? 'Run it again' : 'Run the live example on mainnet'}
      </button>
      {state === 'error' && <p className="mt-2 text-[13.5px] text-danger-200">Couldn't run it: {err}</p>}
      {out && (
        <div className="mt-3 rounded-xl border border-line bg-black/40 p-3">
          <div className="mb-2 font-mono text-[12px] text-ink-500">
            input {JSON.stringify(out.args)} · HTTP {out.status} · {out.ms} ms · live from Solana mainnet just now
            {out.status === 402 && <span className="text-tan-300"> · your free calls for this tool are used up today (25 a day)</span>}
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.5] text-ink-200">{text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text}</pre>
        </div>
      )}
    </div>
  );
};

const ToolCard: React.FC<{ tool: ToolDoc; n: number }> = ({ tool, n }) => (
  <section id={tool.name} className="scroll-mt-24 rounded-2xl border border-line surface p-5 sm:p-6">
    <div className="mb-1 font-mono text-[12.5px] text-ink-500">{String(n).padStart(2, '0')} · {CATEGORY_LABELS[tool.category]} · <span className="text-accent-300">{tool.price ?? 'Free'}</span> after 25 free calls a day</div>
    <h3 className="text-[21px] font-semibold text-ink-50"><Link to={toolPath(tool.name)} className="hover:text-white"><span className="font-mono text-accent-300">{tool.name}</span> · {tool.title}</Link></h3>
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Video id={TOOL_VIDEOS[tool.name] ?? ''} title={`${tool.name}: ${tool.title}`} />
      <div className="min-w-0">
        <p className="text-[15.5px] leading-[1.65] text-ink-200">{tool.description}</p>
        <p className="mt-3 text-[15px] leading-[1.6] text-ink-300"><strong className="font-semibold text-ink-100">Use it when: </strong>{tool.useWhen}</p>
        <LiveExample tool={tool} />
      </div>
    </div>
  </section>
);

// The two free sites, as the chains of calls they really make (rug-check repo, server/pulse.ts).
const BUILT = [
  { name: 'Drain Check', url: 'https://drain-check-1021990235790.us-central1.run.app', what: 'Paste a drained wallet or a transaction link: where the money went, and how they got in.',
    steps: [
      { tool: 'explain_tx', does: 'a pasted transaction link: who lost what, so the page can ask "which wallet is yours?"' },
      { tool: 'trace', does: 'that wallet\'s money, transaction by transaction: destinations ranked by value, the biggest move, sweep and poisoning patterns' },
      { tool: 'trace', does: 'the same answer\'s "how it happened": approvals, handed-over accounts, a reassigned wallet, a lookalike payment or a stolen key' },
    ] },
  { name: 'Rug Check', url: 'https://rug-check-1021990235790.us-central1.run.app', what: 'Paste a token or a Solscan link: the known rug-pull traps, checked before you buy.',
    steps: [
      { tool: 'token_safety', does: 'SAFE, CAUTION or AVOID, with every reason it found and the source of each fact' },
      { tool: 'token_traders', does: 'who has been trading it lately, so insiders dumping show up (loaded after the verdict)' },
    ] },
];
const IDEAS = [
  { title: 'Wallet bodyguard', chain: 'history → explain_tx on anything new → check_tx before the next send' },
  { title: 'New-token watcher', chain: 'find_token → token_safety → token_traders, alert when insiders sell' },
  { title: 'Safe sender', chain: 'whats_this on the address → build_tx → tx_matches → check_tx, then sign' },
  { title: 'Failed-swap helper', chain: 'why_failed → fee → build_tx again with the fix' },
];

export const START_PATH = '/start';
export const START_TITLE = 'Start here · Solana Pulse';
export const START_DESCRIPTION = 'Watch in order: the Solana Pulse story, what it does, then every tool with its video, what it is for and a live example on Solana mainnet.';

export const StartPage: React.FC<{ index: ToolsIndex | null }> = ({ index }) => {
  const tools = index ? [...TOOL_ORDER.map((n) => index.tools.find((t) => t.name === n)).filter((t): t is ToolDoc => !!t),
    ...index.tools.filter((t) => !TOOL_ORDER.includes(t.name))] : [];
  return (
    <div className="max-w-5xl">
      <PageHeader kicker="Start here" title="Watch it in order"
        lead="The story first, then what Solana Pulse does, then every tool: its video, what it's for, and a live call on Solana mainnet you can run yourself." />

      <H2 id="story">1 · Our story</H2>
      <P>{STORY_VIDEO.note}</P>
      <div className="mb-12 max-w-3xl"><Video id={STORY_VIDEO.id} title={STORY_VIDEO.title} /></div>

      <H2 id="what">2 · What Solana Pulse does</H2>
      <P>Before an AI agent signs a Solana transaction or buys a token, Pulse checks it, from live chain data, with every fact's source named. Over MCP or plain HTTP; 25 free calls per tool a day, then a few cents in USDC.</P>
      <div className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {INTRO_VIDEOS.map((v) => <div key={v.id}><Video id={v.id} title={v.title} /><div className="mt-2 text-[15px] font-medium text-ink-100">{v.title}</div><div className="text-[13.5px] text-ink-400">{v.note}</div></div>)}
      </div>

      <H2 id="built">3 · Built with Pulse: tools chained into products</H2>
      <P>Each tool answers one question. Chained, they make products real people use. Both of these are free sites that call Pulse and nothing else for chain data.</P>
      <div className="mb-12 grid gap-5 md:grid-cols-2">
        {BUILT.map((b) => (
          <div key={b.name} className="rounded-2xl border border-line surface p-5">
            <div className="flex items-baseline justify-between gap-3"><h3 className="text-[19px] font-semibold text-ink-50">{b.name}</h3>
              <a href={b.url} className="text-[13.5px] text-accent-300 hover:text-accent-200" rel="noopener">Open it →</a></div>
            <p className="mt-1 text-[14.5px] text-ink-400">{b.what}</p>
            <ol className="mt-4 space-y-2.5">
              {b.steps.map((s, k) => (
                <li key={k} className="flex gap-3 text-[14.5px] leading-[1.55] text-ink-200">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent-500/40 font-mono text-[12px] text-accent-300">{k + 1}</span>
                  <span><Link to={toolPath(s.tool)} className="font-mono text-accent-300 hover:text-accent-200">{s.tool}</Link> · {s.does}</span>
                </li>))}
            </ol>
          </div>))}
      </div>

      <H2 id="tools">4 · Every tool</H2>
      <P>Safety checks first. The live example runs the tool's own example input against mainnet when you tap it, and counts as one of your free calls for that tool. Videos were recorded in October 2026; the live answer is what the tool says today.</P>
      <div className="mb-12 grid gap-5">
        {index ? tools.map((t, k) => <ToolCard key={t.name} tool={t} n={k + 1} />)
          : <div className="skeleton h-64 rounded-2xl" />}
      </div>

      <H2 id="challenge">5 · Your turn: chain the tools</H2>
      <P>Drain Check and Rug Check are two chains of Pulse calls. What can you build with the rest? A few starting points:</P>
      <ul className="mb-4 max-w-[72ch] list-disc space-y-2 pl-5 text-[15px] leading-[1.65] text-ink-300 marker:text-ink-600">
        {IDEAS.map((i) => <li key={i.title}><strong className="font-semibold text-ink-100">{i.title}: </strong>{i.chain}</li>)}
      </ul>
      <P>Every tool has 25 free calls a day, no account needed: start in the <Link to="/toolbox" className="text-accent-300 hover:text-accent-200">Toolbox</Link>. Built something? Show it in a <a href="https://github.com/Timothymycompc/solana-pulse-ai-agent-gateway/issues/new?title=Built%20with%20Pulse%3A%20" className="text-accent-300 hover:text-accent-200" rel="noopener">GitHub issue titled "Built with Pulse"</a> and it can be listed here, with credit.</P>
      <div className="mb-12" />

      <H2 id="setup">6 · Add Pulse to your app</H2>
      <P>About a minute each, with a trial key. Full setup text is on <Link to="/docs/connect" className="text-accent-300 hover:text-accent-200">Connect an agent</Link>.</P>
      <div className="mb-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SETUP_VIDEOS.map((v) => <div key={v.id}><Video id={v.id} title={`Add Solana Pulse to ${v.app}`} /><div className="mt-2 flex items-center gap-1.5 text-[15px] font-medium text-ink-100"><Play className="h-3.5 w-3.5 text-accent-300" />{v.app}</div></div>)}
      </div>
      <p className="text-[13px] text-ink-500">All videos: <a href="https://www.youtube.com/@timothymycompc1205" className="text-accent-300 hover:text-accent-200" rel="noopener">youtube.com/@timothymycompc1205</a></p>
    </div>
  );
};
