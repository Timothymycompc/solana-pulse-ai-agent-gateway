// The owner's edits to upcoming queue posts (npm run x, "Upcoming posts"). The queue's own text in x-queue.ts stays
// the original; an edit in x_edits replaces it when that post goes out, so editing needs no deploy.
import { pool } from "./db";
import { MAX_POST_CHARS, QUEUE } from "./x-queue";

export async function queueEdits(): Promise<Map<string, string>> {
  const rows = (await pool.query(`SELECT key, text FROM x_edits`)).rows as { key: string; text: string }[];
  return new Map(rows.map((r) => [r.key, r.text]));
}

// Queue posts not yet posted, in the order they go out (approved ones first, then drafts), with any edit applied.
export async function upcomingQueue() {
  const posted = new Set(((await pool.query(`SELECT key FROM x_posts`)).rows as { key: string }[]).map((r) => r.key));
  const edits = await queueEdits();
  const left = QUEUE.filter((q) => !posted.has(`queue:${q.key}`));
  return [...left.filter((q) => q.approved), ...left.filter((q) => !q.approved)].map((q) => ({
    key: q.key, approved: q.approved, text: edits.get(q.key) ?? q.text, original: q.text, edited: edits.has(q.key),
    media: q.video ? [q.video] : [],
  }));
}

// Saves an edit, or with empty text goes back to the original. Returns a reason when it refuses.
export async function saveQueueEdit(key: string, text: string): Promise<{ saved: boolean; reason?: string }> {
  const q = QUEUE.find((p) => p.key === key);
  if (!q) return { saved: false, reason: `No queue post ${key}.` };
  if ((await pool.query(`SELECT 1 FROM x_posts WHERE key = $1`, [`queue:${key}`])).rows.length) {
    return { saved: false, reason: "That post has already gone out." };
  }
  const clean = text.trim();
  if (!clean || clean === q.text) {
    await pool.query(`DELETE FROM x_edits WHERE key = $1`, [key]);
    return { saved: true };
  }
  if (clean.length > MAX_POST_CHARS) return { saved: false, reason: `The post is ${clean.length} characters; X allows ${MAX_POST_CHARS}.` };
  await pool.query(`INSERT INTO x_edits (key, text) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET text = $2, updated_at = NOW()`, [key, clean]);
  return { saved: true };
}
