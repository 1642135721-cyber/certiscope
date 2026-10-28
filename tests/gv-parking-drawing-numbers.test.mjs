import assert from "node:assert/strict";
import test from "node:test";
import { detectParkingDrawingNumberRun } from "../lib/gv/parking-drawing-numbers.ts";

const siteLabels = Array.from({ length: 119 }, (_, index) => {
  const value = index + 1;
  if (value <= 38) return { value, x: 1250 - value * 18, y: 1250, height: 5 };
  if (value <= 78)
    return { value, x: 270, y: 900 - (value - 39) * 18, height: 5 };
  return { value, x: 1500, y: 300 + (value - 79) * 18, height: 5 };
});

test("site plan numbering is a traceable candidate even with one unreadable label", () => {
  const run = detectParkingDrawingNumberRun(
    [
      ...siteLabels.filter((label) => label.value !== 84),
      { value: 120, x: 30, y: 30, height: 5 },
    ],
    { materialVersionId: "site", page: 1 },
  );
  assert.equal(run?.last, 119);
  assert.equal(run?.readCount, 118);
  assert.deepEqual(run?.missing, [84]);
  assert.equal(run?.source.page, 1);
});

test("sparse or spatially unordered numbers do not become a parking count", () => {
  assert.equal(
    detectParkingDrawingNumberRun(
      siteLabels.filter((label) => label.value % 3 === 0),
      { materialVersionId: "site", page: 1 },
    ),
    null,
  );
  assert.equal(
    detectParkingDrawingNumberRun(
      siteLabels.map((label) => ({
        ...label,
        x: label.value % 5,
        y: label.value % 7,
      })),
      { materialVersionId: "site", page: 1 },
    ),
    null,
  );
});
