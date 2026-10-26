import assert from "node:assert/strict";
import test from "node:test";
import { basementParkingTotals } from "../lib/gv/fact-patterns.ts";

const fragment = (id, page, text) => ({
  material_version_id: id,
  text_content: text,
  source_location: { materialVersionId: id, page },
  status: "parsed",
});

test("floor totals are sourced from selected drawing pages and not invented from the declared total", () => {
  const rows = basementParkingTotals(
    [
      fragment(
        "drawing",
        1,
        "The total parking lots in the basement-1 are 268 cars.",
      ),
      fragment(
        "drawing",
        2,
        "The total parking lots in the basement-2 are 313 cars.",
      ),
      fragment(
        "other",
        3,
        "The total parking lots in the basement-3 are 119 cars.",
      ),
      fragment("narrative", 1, "The total number of parking spaces is 700."),
    ],
    ["drawing", "narrative"],
  );
  assert.deepEqual(
    rows.map(({ floor, count, source }) => [floor, count, source.page]),
    [
      [1, 268, 1],
      [2, 313, 2],
    ],
  );
  assert.equal(
    rows.reduce((sum, row) => sum + row.count, 0),
    581,
  );
});

test("conflicting counts for one floor are not silently selected", () => {
  const rows = basementParkingTotals(
    [
      fragment(
        "drawing",
        1,
        "The total parking lots in the basement-1 are 268 cars.",
      ),
      fragment(
        "drawing",
        2,
        "The total parking lots in the basement-1 are 270 cars.",
      ),
    ],
    ["drawing"],
  );
  assert.deepEqual(rows, []);
});
