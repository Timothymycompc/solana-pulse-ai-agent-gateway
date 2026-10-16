// The X poster's schedule words (npm run x-times) to cron and back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, parseTime, toCron } from "../scripts/x-schedule";

test("days and times become one cron line", () => {
  assert.equal(toCron("tue,thu,sat", "11am"), "0 11 * * 2,4,6");
  assert.equal(toCron("Saturday,tuesday", "9:30am,5:30pm"), "30 9,17 * * 2,6");
  assert.equal(toCron("weekdays", "17:00"), "0 17 * * 1,2,3,4,5");
  assert.equal(toCron("daily", "12pm,12am"), "0 0,12 * * *");
});

test("times read as people write them, and bad ones are refused", () => {
  assert.deepEqual(parseTime("12am"), [0, 0]);
  assert.deepEqual(parseTime("12:15pm"), [12, 15]);
  assert.deepEqual(parseTime("7pm"), [19, 0]);
  assert.throws(() => parseTime("11"), /am\/pm or minutes/);
  assert.throws(() => parseTime("13pm"), /1 to 12/);
  assert.throws(() => parseTime("25:00"), /not a time of day/);
  assert.throws(() => toCron("tue", "9am,5:30pm"), /same minutes/);
  assert.throws(() => toCron("funday", "9am"), /not a day/);
});

test("a schedule reads back in words", () => {
  assert.equal(describe("0 16 * * 2,4,6"), "Tue, Thu, Sat at 4pm");
  assert.equal(describe("30 9,17 * * *"), "every day at 9:30am and 5:30pm");
  assert.equal(describe("*/5 * * * *"), 'cron "*/5 * * * *"');
});
