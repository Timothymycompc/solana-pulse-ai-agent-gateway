// Asks IndexNow search engines (Bing, Yandex, Naver, Seznam) to re-read the site's pages now instead of whenever
// they next crawl. Run after a deploy that adds or changes pages:  npx tsx scripts/indexnow.ts [path ...]
// With no paths it sends every page in the live sitemap. 200/202 = accepted.
import { INDEXNOW_KEY } from "../server/indexnow-key";
import { PUBLIC_URL } from "../src/nav";

const host = new URL(PUBLIC_URL).host;
const paths = process.argv.slice(2);
const urlList = paths.length ? paths.map((p) => new URL(p, PUBLIC_URL).toString())
  : [...(await (await fetch(`${PUBLIC_URL}/sitemap.xml`)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const keyLive = await (await fetch(`${PUBLIC_URL}/${INDEXNOW_KEY}.txt`)).text();
if (keyLive.trim() !== INDEXNOW_KEY) { console.error(`The key file isn't live yet (${PUBLIC_URL}/${INDEXNOW_KEY}.txt): deploy first.`); process.exit(1); }
const r = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${PUBLIC_URL}/${INDEXNOW_KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${r.status} ${r.statusText} for ${urlList.length} URLs`);
if (r.status >= 300) { console.log(await r.text()); process.exit(1); }
