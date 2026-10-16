/**
 * A stop posts the lines that call there, without duplicates.
 *   node scripts/test_line_plan.mjs
 */
import assert from "node:assert/strict";
import { LINE_PLAN_DIST, formatLinePlan } from "../viewer/transit.js";

assert.equal(LINE_PLAN_DIST, 8);

{
  const plan = formatLinePlan({
    name: "Antwerpen Nationale Bank",
    mode: "bus",
    lines: ["4", "7", "8", "4", "A3", ""],
  });
  assert.equal(plan.title, "Nationale Bank");
  assert.equal(plan.kind, "Bus");
  assert.deepEqual(plan.lines, ["4", "7", "8", "A3"]);
  assert.equal(plan.text, "Bus 4 · 7 · 8 · A3");
}

{
  const plan = formatLinePlan({ name: "Harmonie", mode: "tram", lines: ["10"] });
  assert.equal(plan.kind, "Tram");
  assert.equal(plan.text, "Tram 10");
}

{
  const plan = formatLinePlan({ name: "Empty pole", mode: "bus", lines: [] });
  assert.equal(plan.text, "No lines posted");
  assert.deepEqual(plan.lines, []);
}

console.log("line-plan ok");
