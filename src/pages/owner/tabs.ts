// The owner dashboard's tabs, in order. The open tab is kept in the address (/owner#money) so it can be bookmarked.
// Explorer comes first: every call, caller and network in one place. It replaced the old Runs tab (the latest 40 runs).
export const TABS = [
  { id: 'explorer', label: 'Explorer' },
  { id: 'overview', label: 'Overview' },
  { id: 'money', label: 'Money' },
  { id: 'tools', label: 'Tools' },
  { id: 'callers', label: 'Callers' },
  { id: 'visitors', label: 'Visitors' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

// The page is also rendered on the server (src/ssr.tsx), where there is no address bar: it opens on the explorer.
// Old bookmarks to #runs open the explorer, which shows the same runs and more.
export const tabFromHash = (): TabId => {
  const id = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return TABS.find((t) => t.id === id)?.id ?? 'explorer';
};
