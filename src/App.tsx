import { useEffect, useMemo } from 'react';
import { usePath } from './router';
import { buildSections, useToolsIndex } from './nav';
import { AppShell } from './components/shell/AppShell';
import { metaFor, pageFor } from './pages/route';
import { recordPageView } from './lib/ownerApi';

function App() {
  const path = usePath();
  const { index, error } = useToolsIndex();
  const sections = useMemo(() => buildSections(index?.tools ?? null), [index]);

  const page = pageFor(path, index, error);

  // Per-page tab title, from the same navigation data search uses.
  useEffect(() => { document.title = metaFor(path, sections, index).title; }, [path, sections, index]);

  // Count the visit for the owner dashboard (not the dashboard itself).
  useEffect(() => { if (path !== '/owner') recordPageView(path); }, [path]);

  return <AppShell sections={sections} path={path} tools={index?.tools ?? null}>{page}</AppShell>;
}

export default App;
