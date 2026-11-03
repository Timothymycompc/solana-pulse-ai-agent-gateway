import React, { useState } from 'react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { Code, CodeBlock, H2, P, PageHeader, Table } from '../components/docs/DocParts';

// /fix/transaction-version-not-supported: the page developers land on when they search the RPC error
// "Transaction version (1) is not supported by the requesting client" (-32015). Every fact here was measured on
// mainnet: library results from the V1 Ready library matrix (Cloud Build de37e854, 2026-10-30, real v1 transaction in
// slot 463,371,847), shares from its sampled-block ledger. The live box calls tx_version, like any other caller.

export const FIX_V1_PATH = '/fix/transaction-version-not-supported';
export const FIX_V1_TITLE = 'Fix "Transaction version (1) is not supported by the requesting client" (-32015)';
export const FIX_V1_DESCRIPTION = 'Solana RPC error -32015 means your code asked for transactions up to version 0 and got a version 1 transaction. The one-line fix for web3.js, @solana/kit, Python and Rust, which library versions can read version 1 (tested on mainnet), and a live checker.';

const EXAMPLE = '33H9WFGP5sbhujwe8FvhCXi99Y3js3eUcrc8ABoTNm9VCdxKh3QkWe2CZteXfaEv6YytRYr1YX4ykJ9jtLmsGGD1';

const FIXES: { title: string; code: string }[] = [
  { title: 'JSON-RPC (any language)', code: `{"jsonrpc":"2.0","id":1,"method":"getTransaction",\n "params":["<signature>",{"encoding":"json","maxSupportedTransactionVersion":1}]}` },
  { title: '@solana/web3.js 1.99.0 or later', code: `// npm install @solana/web3.js@^1.99.0   (1.98.x throws on version 1 even with this setting)\nconst tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 1 });\nconst parsed = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 1 });\nconst block = await connection.getBlock(slot, { maxSupportedTransactionVersion: 1 });` },
  { title: '@solana/kit 7.1.0 or later', code: `const tx = await rpc.getTransaction(signature, { maxSupportedTransactionVersion: 1 }).send();\n// Before 7.1.0, tx.version comes back as the bigint 1n, so  tx.version === 1  is false.` },
  { title: 'Python (solana-py)', code: `client.get_transaction(signature, max_supported_transaction_version=1)` },
  { title: 'Rust (solana-client)', code: `let config = RpcTransactionConfig {\n    max_supported_transaction_version: Some(1),\n    ..RpcTransactionConfig::default()\n};\nclient.get_transaction_with_config(&signature, config)?;` },
];

const LIBRARIES: string[][] = [
  ['@solana/web3.js', '1.95.8, 1.98.0, 1.98.4', 'Throws on getTransaction, getParsedTransaction and getBlock, even with maxSupportedTransactionVersion: 1'],
  ['@solana/web3.js', '1.99.0, 3.0.0, 3.1.1', 'Works. 1.99.0 is the first 1.x that reads version 1'],
  ['@solana/web3.js', '1.87.6, 1.91.8', 'Unknown: they no longer install cleanly, so they could not be tested'],
  ['@solana/kit (and web3.js 2.0.0)', '2.1.0 to 7.0.0', 'Returns the transaction, but version is the bigint 1n, not the number 1. Its types reject maxSupportedTransactionVersion: 1 before 6.10.0'],
  ['@solana/kit', '7.1.0, 7.1.1, 8.0.0, 8.6.0', 'Works'],
  ['solana-py (with solders)', '0.30.2 to 0.41.0', 'Works with max_supported_transaction_version=1'],
  ['Rust solana-client', 'all', 'Unknown: not tested yet. The setting is max_supported_transaction_version: Some(1)'],
  ['Every library above', '', 'Asking for version 0 always fails with -32015 (the control check)'],
];

type Answer = { version?: string; found?: boolean; slot?: number | null; time?: string | null; fix?: string | null; who_can_read_it?: string; error?: string };

const Checker: React.FC = () => {
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const run = async (value: string) => {
    const tx_id = value.trim();
    if (!tx_id) return;
    setBusy(true); setAnswer(null); setStatus(null);
    try {
      const r = await fetch(`/api/tools/tx_version`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_id }) });
      setStatus(r.status);
      setAnswer(await r.json().catch(() => ({ error: 'The answer could not be read.' })));
    } catch { setStatus(0); setAnswer({ error: 'Pulse could not be reached. Try again in a moment.' }); }
    setBusy(false);
  };
  const ok = status === 200 && answer?.version;
  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-line surface">
      <form className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:px-6" onSubmit={(e) => { e.preventDefault(); void run(sig); }}>
        <label className="sr-only" htmlFor="fix-v1-sig">Transaction signature</label>
        <input id="fix-v1-sig" value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Paste the signature that fails" spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-code px-3 py-2.5 font-mono text-[13px] text-ink-100 outline-none transition focus:border-accent-400" />
        <button type="submit" disabled={busy || !sig.trim()} className="rounded-lg bg-accent-500 px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-accent-400 disabled:opacity-50">
          {busy ? 'Checking…' : 'Check version'}
        </button>
      </form>
      <div className="border-t border-line/70 px-5 py-4 text-[14px] leading-[1.6] text-ink-300 sm:px-6" aria-live="polite">
        {!answer && !busy && <p>No signature handy? <button type="button" className="text-accent-300 underline decoration-accent-300/30 underline-offset-4" onClick={() => { setSig(EXAMPLE); void run(EXAMPLE); }}>Try a real version 1 transaction</button>. Free: 25 checks a day.</p>}
        {busy && <p>Asking the chain…</p>}
        {ok && <>
          <p className="mb-2 text-[16px] text-ink-50">
            {answer!.found === false ? 'Not found on this network.' : <>Version <b>{answer!.version}</b>{answer!.slot ? <> · slot {answer!.slot.toLocaleString()}</> : null}{answer!.time ? <> · {new Date(answer!.time).toUTCString()}</> : null}</>}
          </p>
          {answer!.who_can_read_it && <p className="mb-2">{answer!.who_can_read_it}</p>}
          {answer!.fix && <p><b className="text-ink-100">Fix:</b> {answer!.fix}</p>}
        </>}
        {answer && !ok && <p>{status === 402 ? 'Today\'s free checks are used up. Try again tomorrow.' : <>{answer.error ?? 'No answer.'}{answer.fix ? ` ${answer.fix}` : ''}</>}</p>}
      </div>
    </section>
  );
};

export const FixV1Page: React.FC = () => (
  <article className="max-w-4xl">
    <PageHeader kicker="RPC error -32015" title={<>Transaction version (1) is not supported by the requesting client</>}
      lead="Your code asked the RPC for transactions up to version 0, and the transaction it wanted is version 1. The RPC refuses it instead of answering. The fix is one setting, plus a library new enough to read the answer." />

    <H2 id="check">Check a transaction</H2>
    <P>Paste the signature your code can't read. Solana Pulse's <Link to={toolPath('tx_version')} className="text-accent-300 underline decoration-accent-300/30 underline-offset-4"><Code>tx_version</Code></Link> tool reads it from mainnet and says which version it is and what can read it.</P>
    <Checker />

    <H2 id="fix">The fix</H2>
    <P>Ask for version 1 wherever you read transactions or blocks other people built: <Code>getTransaction</Code>, <Code>getParsedTransaction(s)</Code> and <Code>getBlock</Code>. Legacy and version 0 transactions still come back exactly as before.</P>
    {FIXES.map((f) => <CodeBlock key={f.title} title={f.title} code={f.code} />)}

    <H2 id="libraries">Which library versions can read version 1</H2>
    <P>Each version was installed fresh and asked for the same real version 1 transaction (slot 463,371,847) on mainnet on 2026-10-30. Asking correctly isn't always enough: older web3.js rejects the answer it gets.</P>
    <Table head={['Library', 'Versions tested', 'With max version 1']} rows={LIBRARIES} minWidth={620} />

    <H2 id="traps">Traps that look like other bugs</H2>
    <ul className="mb-8 max-w-[68ch] list-disc space-y-3 pl-5 text-[16px] leading-[1.7] text-ink-300">
      <li><b className="text-ink-100">One bad entry breaks a whole batch.</b> <Code>getParsedTransactions</Code> and <Code>getTransactions</Code> in web3.js throw for the whole list when one transaction fails, so one version 1 payment can hide 49 others. Read them one by one, or fix the setting.</li>
      <li><b className="text-ink-100">"Not found" that is really "refused".</b> Code that catches the error and returns null reports a paid, confirmed transaction as missing.</li>
      <li><b className="text-ink-100">version === 1 is false on @solana/kit before 7.1.0</b>, because the value is the bigint <Code>1n</Code>.</li>
      <li><b className="text-ink-100">Raw bytes start differently.</b> A version 1 transaction starts with the byte <Code>0x81</Code> before anything else; legacy and version 0 start with the signature count. Parsers that read the bytes the old way break too.</li>
    </ul>

    <H2 id="how-common">How common version 1 is</H2>
    <P>Version 1 went live on mainnet on 2026-09-15 (the first one we found is in slot 447,120,004). In sampled mainnet blocks it was 13.8% of non-vote transactions the week of Sep 14 and <b className="text-ink-100">41.9% from Oct 16 to 30</b> (44.4% of swaps). Whether your code sees one depends only on which wallet or SDK the sender used, so a payment, deposit or trade can fail for one customer and work for the next.</P>

    <H2 id="agents">For agents</H2>
    <P>Agents can call the same check over MCP or HTTP: <Code>tx_version</Code> with <Code>{'{"tx_id": "<signature>"}'}</Code>. See <Link to="/docs/connect" className="text-accent-300 underline decoration-accent-300/30 underline-offset-4">Connect an agent</Link>.</P>
  </article>
);
