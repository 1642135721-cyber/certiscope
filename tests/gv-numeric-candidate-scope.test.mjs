import assert from "node:assert/strict";
import { test } from "node:test";
import { isScopedNumericCandidate } from "../lib/gv/numeric-candidate-scope.ts";

test("broader retrieval cannot turn a floor count into a conflicting project total", () => {
  const direct = [{ key: "total_parking_spaces", value: 700 }];
  assert.equal(
    isScopedNumericCandidate(
      { key: "total_parking_spaces", value: 313 },
      direct,
      true,
    ),
    false,
  );
  assert.equal(
    isScopedNumericCandidate(
      { key: "total_parking_spaces", value: 700 },
      direct,
      true,
    ),
    true,
  );
  assert.equal(
    isScopedNumericCandidate(
      { key: "total_parking_spaces", value: 313 },
      direct,
      false,
    ),
    true,
  );
});

test("conflicting direct project totals remain visible to the rule engine", () => {
  const direct = [
    { key: "total_parking_spaces", value: 700 },
    { key: "total_parking_spaces", value: 650 },
  ];
  assert.equal(
    isScopedNumericCandidate(
      { key: "total_parking_spaces", value: 650 },
      direct,
      true,
    ),
    true,
  );
  assert.equal(
    isScopedNumericCandidate(
      { key: "total_parking_spaces", value: 581 },
      direct,
      true,
    ),
    false,
  );
});
