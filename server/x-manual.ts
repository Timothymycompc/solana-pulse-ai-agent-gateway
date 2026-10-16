// A post the owner writes by hand (npm run x-post): text plus up to 4 pictures, or one video or GIF, which
// scripts/x-post.ts has already put in VIDEO_BUCKET under uploads/. Recorded in x_posts like every other post.
import { pool } from "./db";
import { MAX_POST_CHARS, mediaProblem, postToX, xKeys, type XKeys, type XRunResult } from "./x";

export async function postManual(opts: { text: string; media?: string[]; dryRun?: boolean;
  post?: (text: string, keys: XKeys, media?: string[]) => Promise<string>; now?: () => Date }): Promise<XRunResult> {
  const text = String(opts.text ?? "").trim();
  const media = opts.media ?? [];
  const key = `manual:${(opts.now ?? (() => new Date()))().toISOString()}`;
  const pick = { key, kind: "manual" as const, text, media: media.length ? media : undefined };
  if (!text && !media.length) return { posted: false, reason: "The post has no text and no files." };
  if (text.length > MAX_POST_CHARS) return { posted: false, reason: `The post is ${text.length} characters; X allows ${MAX_POST_CHARS}.`, ...pick };
  const problem = mediaProblem(media);
  if (problem) return { posted: false, reason: problem, ...pick };
  if (opts.dryRun) return { posted: false, dryRun: true, ...pick };
  const keys = xKeys();
  if (!keys) return { posted: false, reason: "The X keys are not set. Run scripts/x-setup.sh, then deploy.", ...pick };
  const postId = await (opts.post ?? postToX)(text, keys, media);
  await pool.query(`INSERT INTO x_posts (key, kind, text, post_id) VALUES ($1, 'manual', $2, $3) ON CONFLICT (key) DO NOTHING`,
    [key, text, postId]);
  return { posted: true, postId, ...pick };
}
