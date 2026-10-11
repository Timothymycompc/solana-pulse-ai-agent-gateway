import React, { useState } from 'react';
import { Check, Copy, Coins, Zap } from 'lucide-react';
import { FREE_CALLS_PER_TOOL, TOOL_PRICES } from '../../pricing';

const NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const httpExample = `import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";

// A Solana wallet holding a little USDC; it signs each payment.
const signer = await createKeyPairSignerFromBytes(secretKeyBytes);
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "${NETWORK}", client: new ExactSvmScheme(signer) }],
});

const res = await fetchWithPayment(
  "${typeof window !== 'undefined' ? window.location.origin : ''}/api/solana/token-profile?mint=<mint>"
);
console.log(await res.json());`;

const mcpExample = `import { createx402MCPClient } from "@x402/mcp";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = createx402MCPClient({
  name: "my-agent",
  version: "1.0.0",
  schemes: [{ network: "${NETWORK}", client: new ExactSvmScheme(signer) }],
  autoPayment: true,
});
await client.connect(new StreamableHTTPClientTransport(
  new URL("${typeof window !== 'undefined' ? window.location.origin : ''}/mcp")
));
const result = await client.callTool("validate_transaction", { transaction: "<base64>" });`;

const tiers = [
  { price: null, label: 'Free', note: 'Rate-limited to 120 requests per minute per IP.' },
  { price: '$0.001', label: '$0.001 per call', note: `After ${FREE_CALLS_PER_TOOL} free calls.` },
  { price: '$0.005', label: '$0.005 per call', note: `After ${FREE_CALLS_PER_TOOL} free calls.` },
  { price: '$0.01', label: '$0.01 per call', note: `After ${FREE_CALLS_PER_TOOL} free calls.` },
] as const;

const CodeBlock: React.FC<{ id: string; title: string; code: string; copied: string | null; onCopy: (id: string, code: string) => void }> = ({ id, title, code, copied, onCopy }) => (
  <div className="min-w-0 rounded-xl border border-white/10 glass-inset">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
      <span className="text-xs font-semibold text-slate-300">{title}</span>
      <button onClick={() => onCopy(id, code)} className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-500 hover:text-white">
        {copied === id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}{copied === id ? 'Copied' : 'Copy'}
      </button>
    </div>
    <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-5 text-slate-300">{code}</pre>
  </div>
);

export const PricingView: React.FC = () => {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch { setCopied(null); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="glass gradient-border animate-fade-up rounded-2xl border p-6 lg:p-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300"><Zap className="h-3.5 w-3.5" />x402 · USDC on Solana</div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Pay per call. <span className="text-gradient">No account, no API key.</span></h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Basic reads are free. Every other tool has {FREE_CALLS_PER_TOOL} free calls, then a small USDC price paid with each request through the open x402 protocol.
          Agents with a Solana wallet pay automatically; calls that return an error are never charged, and network fees are covered for you.
        </p>
      </section>

      <section>
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-white"><Coins className="h-5 w-5 text-indigo-400" />Prices</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((tier) => {
            const tools = Object.keys(TOOL_PRICES).filter((tool) => TOOL_PRICES[tool] === tier.price);
            return (
              <div key={tier.label} data-reveal className="lift rounded-xl border border-white/10 glass p-4">
                <p className={`text-xl font-extrabold ${tier.price ? 'text-white' : 'text-emerald-400'}`}>{tier.label}</p>
                <p className="mt-1 text-[11px] text-slate-400">{tier.note}</p>
                <ul className="mt-3 space-y-1">
                  {tools.map((tool) => <li key={tool} className="truncate font-mono text-[11px] text-indigo-300">{tool}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 glass p-6">
        <h3 className="text-base font-bold text-white">How a paid call works</h3>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ['Call the tool', 'Once its free calls are used, the gateway answers 402 Payment Required (over MCP: a tool result with the payment details). It lists the exact USDC amount and where to pay.'],
            ['Your client pays', 'An x402 client signs a USDC transfer for that amount and retries the same call with it attached. No sign-up and no prepaid balance.'],
            ['Get the answer and a receipt', 'The payment is checked, the tool runs, and the transfer settles on Solana only if the call succeeded. The receipt includes the transaction signature.'],
          ].map(([title, detail], i) => (
            <li key={title} className="rounded-xl border border-white/10 glass-inset p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Step {i + 1}</span>
              <p className="mt-1 text-sm font-semibold text-white">{title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <h3 className="text-base font-bold text-white">Add payments to your client</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <CodeBlock id="http" title="HTTP · @x402/fetch" code={httpExample} copied={copied} onCopy={copy} />
          <CodeBlock id="mcp" title="MCP · @x402/mcp" code={mcpExample} copied={copied} onCopy={copy} />
        </div>
        <p className="text-xs text-slate-400">Network <code className="text-slate-300">{NETWORK}</code> (Solana mainnet), asset USDC, scheme <code className="text-slate-300">exact</code>. Prices are also listed in <a href="/.well-known/mcp.json" className="text-indigo-300 hover:text-indigo-200">mcp.json</a>, <a href="/llms.txt" className="text-indigo-300 hover:text-indigo-200">llms.txt</a> and <a href="/api/trial/status" className="text-indigo-300 hover:text-indigo-200">/api/trial/status</a>.</p>
      </section>
    </div>
  );
};
