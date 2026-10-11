import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from '../router';
import { toolPath } from '../nav';
import { Code, CodeBlock, H2, P, PageHeader, Table } from '../components/docs/DocParts';
import { PricingView } from '../components/PricingView';
import { ServiceUsagePanel } from '../components/ServiceUsagePanel';

const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');
const NETWORK = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const NextLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm text-accent-300 transition hover:gap-2 hover:text-accent-200">{children}<ArrowRight className="h-3.5 w-3.5" /></Link>
);

export const QuickstartPage: React.FC = () => (
  <article className="max-w-3xl">
    <PageHeader eyebrow="Get started" title="Quickstart" lead="Make a real call in under a minute. No account, no API key; free tools work immediately and paid tools give you 3 free calls each." />

    <H2>1. Make your first call</H2>
    <P>Every tool is a <Code>POST</Code> to <Code>/api/tools/&lt;name&gt;</Code> with a JSON body. This one converts 5 USDC into the exact base units a transfer needs:</P>
    <CodeBlock title="Terminal" code={`curl -X POST '${origin()}/api/tools/convert_amount' \\\n  -H 'content-type: application/json' \\\n  -d '{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","amount":"5"}'`} />
    <P>The response includes <Code>"baseUnits": "5000000"</Code> and the decimals it used, read from the chain.</P>

    <H2>2. Check a transaction before your agent signs it</H2>
    <P>Serialize the unsigned transaction to base64 and send it to <Code>preflight_transaction</Code>. You get OK, REVIEW or BLOCK, every wallet's exact balance change, and the reasons.</P>
    <CodeBlock title="TypeScript" code={`const base64 = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");\nconst res = await fetch("${origin()}/api/tools/preflight_transaction", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify({ transaction: base64 }),\n});\nconst { verdict, summary, walletChanges } = await res.json();\nif (verdict === "BLOCK") throw new Error(summary);`} />
    <NextLink to={toolPath('preflight_transaction')}>Try it live with a real transaction</NextLink>

    <H2>3. Give the tools to your agent</H2>
    <P>Connect any MCP client (Claude, Cursor, your own agent) to <Code>/mcp</Code> and all tools appear automatically, each with a "use when" line so the model knows when to call it.</P>
    <NextLink to="/docs/connect">Connect an agent</NextLink>

    <H2>4. Pay when the free calls run out</H2>
    <P>Paid tools answer <Code>402 Payment Required</Code> after their 3 free calls. An x402 client pays the few-cent USDC price from a Solana wallet and retries automatically.</P>
    <NextLink to="/docs/pricing">Pricing and x402 setup</NextLink>
  </article>
);

export const ConnectPage: React.FC = () => (
  <article className="max-w-3xl">
    <PageHeader eyebrow="Get started" title="Connect an agent" lead="Solana Pulse is a Model Context Protocol (MCP) server. Connect once and every tool, with its documentation, is available to the model." />

    <H2>Endpoints</H2>
    <Table head={['Transport', 'URL']} minWidth={420} rows={[
      ['Streamable HTTP (recommended)', <Code>{`${origin()}/mcp`}</Code>],
      ['Server-Sent Events', <Code>{`${origin()}/mcp/sse`}</Code>],
    ]} />

    <H2>Claude Desktop</H2>
    <P>Add this to <Code>claude_desktop_config.json</Code> and restart Claude. It uses <Code>mcp-remote</Code>, so Node.js must be installed.</P>
    <CodeBlock title="claude_desktop_config.json" code={JSON.stringify({ mcpServers: { 'solana-pulse': { command: 'npx', args: ['-y', 'mcp-remote', `${origin()}/mcp`] } } }, null, 2)} />

    <H2>Cursor and other clients that accept a URL</H2>
    <CodeBlock title="mcp.json" code={JSON.stringify({ mcpServers: { 'solana-pulse': { url: `${origin()}/mcp` } } }, null, 2)} />

    <H2>An agent that can pay</H2>
    <P>Desktop apps can use the free tools and each paid tool's free calls. To keep using paid tools, build your agent with an x402-capable MCP client, which answers payment requests from a Solana wallet holding USDC:</P>
    <CodeBlock title="TypeScript" code={`import { createx402MCPClient } from "@x402/mcp";\nimport { ExactSvmScheme } from "@x402/svm/exact/client";\nimport { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";\n\nconst client = createx402MCPClient({\n  name: "my-agent",\n  version: "1.0.0",\n  schemes: [{ network: "${NETWORK}", client: new ExactSvmScheme(signer) }],\n  autoPayment: true,\n});\nawait client.connect(new StreamableHTTPClientTransport(new URL("${origin()}/mcp")));\nconst result = await client.callTool("token_verdict", { mint: "<mint>" });`} />

    <H2>Discovery files</H2>
    <Table head={['File', 'What it is']} minWidth={420} rows={[
      [<a className="text-accent-300 hover:text-accent-200" href="/.well-known/mcp.json">/.well-known/mcp.json</a>, 'Machine-readable manifest: tools, prices and payment details.'],
      [<a className="text-accent-300 hover:text-accent-200" href="/llms.txt">/llms.txt</a>, 'Plain-text guide for language models.'],
      [<a className="text-accent-300 hover:text-accent-200" href="/api/tools">/api/tools</a>, 'Every tool with full input and output documentation, as JSON.'],
    ]} />
  </article>
);

export const CallsPage: React.FC = () => (
  <article className="max-w-3xl">
    <PageHeader eyebrow="Get started" title="What is a call?" lead="A call is one question you send to the gateway and the one answer you get back. Ask “how much SOL is in this wallet?” and you get the number. That round trip is one call." />

    <H2>What one looks like</H2>
    <P>Each kind of question has its own tool. You send the details as JSON, and the answer comes back as structured data a program or AI agent can read.</P>
    <CodeBlock title="The question" code={`POST ${origin()}/api/tools/get_solana_balance\n{ "wallet": "<wallet_address>" }`} />
    <CodeBlock title="The answer" code={`{\n  "wallet": "<wallet_address>",\n  "network": "mainnet-beta",\n  "lamports": "1500000000",\n  "sol": "1.5",\n  "slot": 455508107\n}`} />
    <P>AI agents make the same calls over MCP: instead of a web address, the agent picks a tool by name, such as <Code>get_solana_balance</Code>, and gets the same answer.</P>

    <H2>What calls cost</H2>
    <P>Basic tools, like this balance call, are always free. Paid tools give every caller 3 free calls each, then cost $0.001 to $0.01 in USDC, paid with the request itself through x402. Calls that end in an error are never charged and never use up a free call.</P>

    <H2>How a call travels: think of a restaurant</H2>
    <Table head={['In a restaurant', 'In the gateway']} minWidth={480} rows={[
      [<><b className="text-ink-100">The customer</b> wants something</>, <><b className="text-ink-100">The client</b>: your app or AI agent</>],
      [<><b className="text-ink-100">The menu</b> lists every dish</>, <><b className="text-ink-100">The API</b>: the list of tools and how to ask</>],
      [<><b className="text-ink-100">A dish</b> has its own name</>, <><b className="text-ink-100">An endpoint</b>: one address, one job, like <Code>/api/tools/get_solana_balance</Code></>],
      [<><b className="text-ink-100">The cashier</b> checks you can order</>, <><b className="text-ink-100">Free calls and payment</b>: counts free calls, then checks the x402 payment</>],
      [<><b className="text-ink-100">The chef</b> cooks</>, <><b className="text-ink-100">The logic</b>: validates inputs and does the work</>],
      [<><b className="text-ink-100">The supplier</b> delivers ingredients</>, <><b className="text-ink-100">The blockchain</b>: Solana, read live</>],
      [<><b className="text-ink-100">The plate</b> arrives</>, <><b className="text-ink-100">The response</b>: structured JSON, usually in well under a second</>],
    ]} />

    <H2>Glossary</H2>
    <Table head={['Term', 'Meaning']} minWidth={420} rows={[
      [<b className="text-ink-100">API</b>, 'Everything the gateway can do and the format for asking.'],
      [<b className="text-ink-100">Endpoint</b>, 'A single address that does one job.'],
      [<b className="text-ink-100">Request / response</b>, 'What you send, and what comes back.'],
      [<b className="text-ink-100">MCP server</b>, 'A menu written for AI agents, so they can find and call tools themselves.'],
      [<b className="text-ink-100">x402</b>, 'An open standard for paying per request, here in USDC on Solana.'],
    ]} />
    <NextLink to="/docs/quickstart">Make your first call</NextLink>
  </article>
);

export const PricingPage: React.FC = () => <PricingView />;

export const StatusPage: React.FC = () => (
  <article>
    <PageHeader eyebrow="Payments" title="Live usage" lead="Real tool runs, callers and uptime pings, counted without storing IP addresses or request contents." />
    <ServiceUsagePanel />
  </article>
);

export const NotFoundPage: React.FC = () => (
  <article className="max-w-xl">
    <PageHeader title="Page not found" lead="That page doesn't exist. Use the sidebar, or press ⌘K to search every page and tool." />
    <NextLink to="/">Back to the overview</NextLink>
  </article>
);
