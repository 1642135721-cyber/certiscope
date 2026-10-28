import assert from "node:assert/strict";
import test from "node:test";
import { refineSemanticFindings } from "../lib/gv/semantic-findings.ts";

const source = { materialVersionId: "narrative", page: 1 };
const drawing = { materialVersionId: "drawing", page: 18 };
const r05 = {
  ruleId: "R05",
  outcome: "HUMAN_REVIEW_REQUIRED",
  inputs: {
    evse_spaces: 14,
    minimum_evse_spaces: 14,
    total_parking_spaces: 700,
  },
  issues: ["车位位号及独立性仍待核对"],
  sources: [source],
};

test("R05 separates declared spaces from minimum and keeps visual support", () => {
  const supported = [
    {
      text: "申报材料计算得出需要至少14个充电车位。",
      citations: [source],
    },
    {
      text: "图纸设计了专用的充电车位标识（红色背景+插头图标）。",
      citations: [drawing],
    },
  ];
  const pending = [
    { text: "请核对实际提供的充电车位数量是否达到14个。", citations: [] },
    {
      text: "是否已安装EVSE设备，且充电车位是否与优先车位完全独立（不重叠）。",
      citations: [],
    },
  ];
  const actual = refineSemanticFindings("R05", supported, pending, r05);
  assert.match(actual.supported[0].text, /申报材料写明设置 14 个/);
  assert.match(actual.supported[0].text, /最低需 14 个/);
  assert.deepEqual(actual.supported[1], supported[1]);
  assert.match(actual.unverified[0].text, /位号与位置/);
  assert.doesNotMatch(actual.unverified[0].text, /是否达到14个/);
  assert.deepEqual(actual.unverified[0].citations, [source]);
  assert.match(actual.unverified[1].text, /设备及其与申报充电车位的对应关系/);
  assert.deepEqual(
    refineSemanticFindings("R05", actual.supported, actual.unverified, r05),
    actual,
  );
});

test("R05 supplies cited quantity support when the model omits it", () => {
  const actual = refineSemanticFindings("R05", [], [], r05);
  assert.equal(actual.supported.length, 1);
  assert.deepEqual(actual.supported[0].citations, [source]);
});

test("a correctly worded historical R05 finding keeps its original wording", () => {
  const finding = {
    text: "数量满足要求：申报文本明确指出设置了14个充电车位，符合ceil(700*2%)=14的要求。",
    citations: [source],
  };
  const actual = refineSemanticFindings("R05", [finding], [], r05);
  assert.deepEqual(actual.supported, [finding]);
});

test("R05 does not promote a conflicting or uncited quantity", () => {
  const pending = [
    { text: "请核对实际提供的充电车位数量是否达到14个。", citations: [] },
  ];
  const conflict = refineSemanticFindings("R05", [], pending, {
    ...r05,
    outcome: "EVIDENCE_CONFLICT",
  });
  assert.equal(conflict.supported.length, 0);
  assert.deepEqual(conflict.unverified, pending);
  const uncited = refineSemanticFindings("R05", [], pending, {
    ...r05,
    sources: [],
  });
  assert.equal(uncited.supported.length, 0);
  assert.deepEqual(uncited.unverified, pending);
});
