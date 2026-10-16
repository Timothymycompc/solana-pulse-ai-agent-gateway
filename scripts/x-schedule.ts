// Turns "tue,thu,sat" and "11am,5:30pm" into the cron schedule Cloud Scheduler runs the X poster on, and back
// into words. Used by scripts/x-times.ts.
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const GROUPS: Record<string, number[]> = { daily: [0, 1, 2, 3, 4, 5, 6], everyday: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };

export function parseDays(input: string): number[] {
  const days = new Set<number>();
  for (const raw of input.toLowerCase().split(",").map((d) => d.trim()).filter(Boolean)) {
    const day = DAYS.indexOf(raw.slice(0, 3));
    if (GROUPS[raw]) GROUPS[raw].forEach((d) => days.add(d));
    else if (day >= 0 && DAYS[day].startsWith(raw.slice(0, 3)) && raw.length >= 3) days.add(day);
    else throw new Error(`"${raw}" is not a day. Use mon,tue,wed,thu,fri,sat,sun, daily, weekdays or weekends.`);
  }
  if (!days.size) throw new Error("No days given.");
  return [...days].sort();
}

// "9am", "9:30pm", "17:00" -> [hour, minute]
export function parseTime(raw: string): [number, number] {
  const m = raw.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new Error(`"${raw}" is not a time. Use 11am, 5:30pm or 17:00.`);
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (m[3]) {
    if (hour < 1 || hour > 12) throw new Error(`"${raw}": with am/pm the hour is 1 to 12.`);
    hour = (hour % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (m[2] === undefined) throw new Error(`"${raw}" needs am/pm or minutes (11am or 11:00).`);
  if (hour > 23 || minute > 59) throw new Error(`"${raw}" is not a time of day.`);
  return [hour, minute];
}

// One cron line covers every time only when they share the same minutes (9:00 and 17:00, not 9:00 and 17:30).
export function toCron(days: string, times: string): string {
  const parsed = times.split(",").filter((t) => t.trim()).map(parseTime);
  if (!parsed.length) throw new Error("No times given.");
  const minutes = new Set(parsed.map(([, m]) => m));
  if (minutes.size > 1) throw new Error("All times must share the same minutes, like 9am,5pm or 9:30am,5:30pm.");
  const hours = [...new Set(parsed.map(([h]) => h))].sort((a, b) => a - b);
  const dayList = parseDays(days);
  return `${parsed[0][1]} ${hours.join(",")} * * ${dayList.length === 7 ? "*" : dayList.join(",")}`;
}

const clock = (h: number, m: number) => `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;

// Words for a schedule this file made; anything else is shown as the raw cron line.
export function describe(cron: string): string {
  const m = cron.match(/^(\d+) ([\d,]+) \* \* ([\d,]+|\*)$/);
  if (!m) return `cron "${cron}"`;
  const days = m[3] === "*" ? "every day" : m[3].split(",").map((d) => DAYS[Number(d) % 7][0].toUpperCase() + DAYS[Number(d) % 7].slice(1)).join(", ");
  return `${days} at ${m[2].split(",").map((h) => clock(Number(h), Number(m[1]))).join(" and ")}`;
}
