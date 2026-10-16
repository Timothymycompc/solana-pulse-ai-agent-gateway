// Renders a page on the server, so readers that don't run JavaScript (AI fetchers, link previews, many crawlers)
// get the real page text. The browser then draws the same page over it (main.tsx). Used by server/pages.ts.
import { renderToString } from 'react-dom/server';
import { AppShell } from './components/shell/AppShell';
import type { ToolsIndex } from './lib/toolsApi';
import { buildSections } from './nav';
import { isKnownPath, metaFor, pageFor } from './pages/route';

export function renderPage(path: string, index: ToolsIndex): { html: string; title: string; description: string; found: boolean } {
  const sections = buildSections(index.tools);
  const html = renderToString(<AppShell sections={sections} path={path} tools={index.tools}>{pageFor(path, index, '')}</AppShell>);
  return { html, ...metaFor(path, sections, index), found: isKnownPath(path, index) };
}
