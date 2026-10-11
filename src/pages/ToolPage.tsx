import React from 'react';
import { ArrowLeft, ArrowRight, PiggyBank, ShieldCheck } from 'lucide-react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { CATEGORY_LABELS, type ToolsIndex } from '../lib/toolsApi';
import { Code, H2, PageHeader, P, Table } from '../components/docs/DocParts';
import { TryItPanel } from '../components/playground/TryItPanel';

export const ToolPage: React.FC<{ name: string; index: ToolsIndex }> = ({ name, index }) => {
  const i = index.tools.findIndex((t) => t.name === name);
  const tool = index.tools[i];
  if (!tool) return <PageHeader title="Tool not found" lead={<>There is no tool called <Code>{name}</Code>. Use the sidebar or press ⌘K to search.</>} />;
  const prev = index.tools[i - 1];
  const next = index.tools[i + 1];

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <article className="min-w-0">
        <PageHeader
          eyebrow={CATEGORY_LABELS[tool.category]}
          title={tool.title}
          aside={<span className={`rounded-full border px-3 py-1 text-xs font-medium ${tool.price ? 'border-white/15 text-slate-200' : 'border-emerald-500/30 text-emerald-300'}`}>{tool.priceText}</span>}
          lead={tool.description}
        />

        <div className="mb-8 space-y-3">
          <p className="text-sm leading-7 text-slate-200"><span className="font-semibold text-white">Use when:</span> {tool.useWhen}</p>
          <div className={`flex gap-3 rounded-lg border p-3.5 text-sm leading-6 ${tool.benefit.kind === 'money' ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-50' : 'border-sky-500/20 bg-sky-500/[0.06] text-sky-50'}`}>
            {tool.benefit.kind === 'money' ? <PiggyBank className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
            <span><strong className="font-semibold">{tool.benefit.kind === 'money' ? 'Saves money. ' : 'Prevents hallucination. '}</strong>{tool.benefit.text}</span>
          </div>
        </div>

        <H2 id="endpoints">Call it</H2>
        <Table head={['Transport', 'How']} minWidth={420} rows={[
          ['HTTP', <><Code>POST /api/tools/{tool.name}</Code> with a JSON body of the inputs below.</>],
          ['MCP', <><Code>tools/call</Code> with name <Code>{tool.name}</Code> on <Code>/mcp</Code>.</>],
        ]} />

        <H2 id="inputs">Inputs</H2>
        <Table head={['Name', 'What it is', 'How to get it']} rows={tool.inputs.map((input) => [
          <><Code>{input.name}</Code>{input.required && <span className="ml-0.5 text-rose-300" title="required">*</span>}<div className="mt-1 text-[11px] text-slate-500">{input.type}{input.required ? '' : ' · optional'}</div></>,
          input.description,
          input.howToGet,
        ])} />

        <H2 id="returns">Returned fields</H2>
        <P>Every field the tool returns, what it means, and exactly how the gateway computes it.</P>
        <Table head={['Field', 'What it means', "How it's computed"]} minWidth={640} rows={tool.outputs.map((o) => [
          <><Code>{o.field}</Code><div className="mt-1 text-[11px] text-slate-500">{o.type}</div></>,
          <span className="text-slate-200">{o.meaning}</span>,
          o.howComputed,
        ])} />

        {tool.notes.length > 0 && (<>
          <H2 id="notes">Limits</H2>
          <ul className="mb-6 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-300">{tool.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>)}

        <nav aria-label="More tools" className="mt-12 grid gap-3 sm:grid-cols-2">
          {prev ? <Link to={toolPath(prev.name)} className="group rounded-lg border border-white/10 p-4 transition hover:border-white/20 hover:bg-white/[0.02]"><span className="flex items-center gap-1 text-[11px] text-slate-500"><ArrowLeft className="h-3 w-3" />Previous</span><span className="mt-1 block text-sm font-medium text-slate-100 group-hover:text-white">{prev.title}</span></Link> : <span />}
          {next && <Link to={toolPath(next.name)} className="group rounded-lg border border-white/10 p-4 text-right transition hover:border-white/20 hover:bg-white/[0.02]"><span className="flex items-center justify-end gap-1 text-[11px] text-slate-500">Next<ArrowRight className="h-3 w-3" /></span><span className="mt-1 block text-sm font-medium text-slate-100 group-hover:text-white">{next.title}</span></Link>}
        </nav>
      </article>

      <aside className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:self-start xl:overflow-y-auto">
        <TryItPanel key={tool.name} tool={tool} freeCallsPerTool={index.freeCallsPerTool} />
      </aside>
    </div>
  );
};
