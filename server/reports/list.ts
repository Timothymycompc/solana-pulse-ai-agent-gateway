// Every report, as plain data, so the site (src/) and the server read the same thing. No server code here.
import { boomwins } from "./boomwins";
import { crawlhive } from "./crawlhive";
import { fourkgame } from "./fourkgame";
import { ISSUE_REPORTS } from "./issues.generated";
import { luckquexa } from "./luckquexa";
import { luckyvaults } from "./luckyvaults";
import { progcoin } from "./progcoin";
import type { Report } from "./types";

const ALL = [crawlhive, ...ISSUE_REPORTS, luckquexa, fourkgame, boomwins, progcoin, luckyvaults];
export const REPORTS: Record<string, Report> = Object.fromEntries(ALL.map((r) => [r.name, r]));
export const publishedReports = (reports = REPORTS) => Object.values(reports).filter((r) => r.published);
