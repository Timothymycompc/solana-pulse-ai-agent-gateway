// Every report, as plain data, so the site (src/) and the server read the same thing. No server code here.
import { boomwins } from "./boomwins";
import { crawlhive } from "./crawlhive";
import { bridge6tck, sweeper7lht } from "./drains";
import { fourkgame } from "./fourkgame";
import { ISSUE_REPORTS } from "./issues.generated";
import { luckquexa } from "./luckquexa";
import { luckyvaults } from "./luckyvaults";
import { progcoin } from "./progcoin";
import { TOKEN_REPORTS } from "./tokens.generated";
import type { Report } from "./types";
import { ON_SITE } from "../site";

const ALL = [crawlhive, ...ISSUE_REPORTS, luckquexa, fourkgame, boomwins, progcoin, luckyvaults, sweeper7lht, bridge6tck, ...TOKEN_REPORTS];
export const REPORTS: Record<string, Report> = Object.fromEntries(ALL.map((r) => [r.name, r]));
export const publishedReports = (reports = REPORTS) => Object.values(reports).filter((r) => r.published);
// The reports the public website shows: the published ones, while reports are switched on (server/site.ts).
export const siteReports = () => (ON_SITE.reports ? publishedReports() : []);
