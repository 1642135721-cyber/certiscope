import assert from "node:assert/strict";
import test from "node:test";
import {
  retrieveGvEvidence,
  retrieveGvRuleEvidence,
} from "../lib/gv/evidence-retrieval.ts";

const fragment = (materialId, page, text) => ({
  material_version_id: materialId,
  text_content: text,
  source_location: { materialVersionId: materialId, page },
  status: "extracted",
});

test("field anchored evidence is stable when database fragment order changes", () => {
  const fragments = [
    fragment("narrative", 1, "Preferred parking spaces: 35."),
    fragment("narrative", 2, "B2 has 11 preferred parking spaces."),
    fragment("drawing", 1, "B1 has 24 preferred parking spaces."),
    fragment("signage", 1, "Priority signage is at the garage entrance."),
  ];
  const anchors = new Map([
    [
      "R03",
      [
        {
          fieldKey: "parking.preferred_spaces.breakdown",
          source: { materialVersionId: "narrative", page: 2 },
          value: "B2 has 11 preferred parking spaces",
        },
      ],
    ],
  ]);
  const selectedIds = ["narrative", "drawing", "signage"];
  const selected = (rows) =>
    retrieveGvRuleEvidence(rows, ["R03"], selectedIds, 3200, anchors)
      .get("R03")
      .map((item) => [item.source.materialVersionId, item.source.page]);
  assert.deepEqual(selected(fragments), selected([...fragments].reverse()));
  assert.deepEqual(selected(fragments)[0], ["narrative", 2]);
});

test("a located field retains its source even when keyword ranking is weak", () => {
  const fragments = [
    fragment("narrative", 1, "Preferred parking near the entrance."),
    fragment("drawing", 2, "B2: stall IDs P21 through P31."),
  ];
  const anchors = new Map([
    [
      "R03",
      [
        {
          fieldKey: "parking.preferred_stall_ids",
          source: { materialVersionId: "drawing", page: 2 },
          value: "P21 through P31",
        },
      ],
    ],
  ]);
  const selected = retrieveGvRuleEvidence(
    fragments,
    ["R03"],
    ["narrative", "drawing"],
    3200,
    anchors,
  ).get("R03");
  assert.equal(selected[0].source.materialVersionId, "drawing");
  assert.equal(selected[0].source.page, 2);
  assert.match(selected[0].text, /P21 through P31/);
});

test("enhanced extraction sees a second relevant page while legacy mode stays available", () => {
  const fragments = [
    fragment("narrative", 1, "Preferred parking spaces: 35."),
    fragment("narrative", 2, "The B2 stalls are numbered P21 to P31."),
  ];
  const legacy = retrieveGvEvidence(fragments, ["R03"], ["narrative"]);
  const enhanced = retrieveGvEvidence(
    fragments,
    ["R03"],
    ["narrative"],
    18000,
    true,
  );
  assert.equal(legacy[0].source.page, 1);
  assert.deepEqual(
    enhanced.map((item) => item.source.page),
    [1, 2],
  );
});
