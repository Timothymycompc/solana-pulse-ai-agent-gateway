// Serves the website's pages with their text already in the HTML (src/ssr.tsx), each with its own title,
// description and canonical address, instead of an empty <div id="root"> that only JavaScript fills.
// Paths that look like files (/sitemap.txt, /openapi.json) and were not found get a real 404, not the website.
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { renderPage } from "../src/ssr";

const PUBLIC_URL = "https://solana-pulse-gateway-1021990235790.us-central1.run.app";
const NO_RENDER = new Map([["/owner", "Owner dashboard"], ["/mine", "Your report"]]); // private pages: never indexed, rendered in the browser only

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// JSON inside <script>: "<" escaped so a "</script>" in any text cannot end the tag.
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function fillTemplate(template: string, p: { html: string; title: string; description: string; path: string; tools?: unknown; noindex?: boolean }): string {
  const url = PUBLIC_URL + (p.path === "/" ? "/" : p.path);
  let out = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(p.description)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(p.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(p.description)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(p.title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(p.description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`);
  const head = `<link rel="canonical" href="${esc(url)}" />${p.noindex ? '\n    <meta name="robots" content="noindex" />' : ""}`;
  out = out.replace("</head>", `    ${head}\n  </head>`);
  const preload = p.tools ? `<script>window.__PULSE_TOOLS__=${scriptJson(p.tools)}</script>` : "";
  return out.replace('<div id="root"></div>', `<div id="root">${p.html}</div>${preload}`);
}

export function pageHandler(distPath: string, toolsIndex: () => unknown) {
  const template = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
  const cache = new Map<string, { status: number; body: string }>(); // real pages only; they change only with a deploy
  return (req: Request, res: Response) => {
    if (req.method !== "GET" && req.method !== "HEAD") return res.status(404).json({ error: "Not found" });
    if (/\/[^/]*\.[a-z0-9]+$/i.test(req.path)) return res.status(404).type("text/plain").send("Not found");
    let p = req.path.replace(/\/+$/, "") || "/";
    if (p === "/docs") p = "/docs/quickstart";
    let page = cache.get(p);
    if (!page) {
      if (NO_RENDER.has(p)) {
        page = { status: 200, body: fillTemplate(template, { html: "", title: `${NO_RENDER.get(p)} · Solana Pulse`, description: "", path: p, noindex: true }) };
      } else {
        const index = toolsIndex() as any;
        try {
          const r = renderPage(p, index);
          page = { status: r.found ? 200 : 404, body: fillTemplate(template, { ...r, path: p, tools: index, noindex: !r.found }) };
        } catch (error) {
          console.error(`Rendering ${p} failed; sending the page without its text:`, error);
          return res.sendFile(path.join(distPath, "index.html"));
        }
      }
      if (page.status === 200) cache.set(p, page);
    }
    res.status(page.status).type("html").send(page.body);
  };
}
