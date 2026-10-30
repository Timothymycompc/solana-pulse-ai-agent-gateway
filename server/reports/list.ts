// Every report, as plain data, so the site (src/) and the server read the same thing. No server code here.
import { crawlhive } from "./crawlhive";
import type { Report } from "./types";

export const REPORTS: Record<string, Report> = { [crawlhive.name]: crawlhive };
export const publishedReports = (reports = REPORTS) => Object.values(reports).filter((r) => r.published);
