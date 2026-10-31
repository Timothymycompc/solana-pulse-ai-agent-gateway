// What the public website shows. Plain data, no server code, so the site (src/) and the server read the same switch.
// Off since 2026-10-31 (Tim): keep the public site one project, transaction safety for agents, while the grant is
// reviewed. Turning a part off only hides it from the site, its API and the sitemap: the code stays, and the cloud jobs
// behind it (report tool-run sync, the daily research run, the accuracy batches) keep running and collecting data.
// Turn one back on by setting it to true; its tests run again by themselves.
export const ON_SITE = {
  reports: false, // /reports, every /reports/<name> page, the Reports tab and menu entries
  research: false, // "What winners and losers had in common" on /track-record
};
