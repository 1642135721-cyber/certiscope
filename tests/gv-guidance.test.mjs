import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const sourcePath = resolve("lib/gv/knowledge/gv-guidance.ts");
const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const localRequire = createRequire(sourcePath);
const module = { exports: {} };
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  require: (id) => (id === "server-only" ? {} : localRequire(id)),
  __dirname: dirname(sourcePath),
  process,
  Date,
});
const { gvGuidanceChunks, retrieveGvGuidanceChunks, validateGvGuidance } =
  module.exports;

test("controlled GV corpus contains located official clauses for every rule", () => {
  for (const code of ["R01", "R02", "R03", "R04", "R05", "R06", "R07"]) {
    const chunks = gvGuidanceChunks.filter((item) => item.ruleCode === code);
    assert.ok(chunks.length > 0, `${code} has no official passage`);
    assert.ok(
      chunks.every((item) => item.page > 0 && item.contentHash.length === 64),
    );
  }
  assert.match(
    retrieveGvGuidanceChunks("R02", ["ACEEE 绿色车辆资格需要多少分？"])[0]
      .quote,
    /green score of 45/i,
  );
  assert.match(
    retrieveGvGuidanceChunks("R06", ["联网和需求响应能力要求是什么？"])[0]
      .quote,
    /networked|demand-response/i,
  );
});

test("model guidance must cite a retrieved chunk and cannot invent a numeric threshold", () => {
  const chunks = retrieveGvGuidanceChunks("R02", ["ACEEE 评分"], 2);
  const retrieved = new Map([["R02:0", { question: "ACEEE 评分", chunks }]]);
  const entries = [
    {
      ruleCode: "R02",
      questionIndex: 0,
      text: "绿色车辆应达到 ACEEE 45 分。",
      chunkId: chunks[0].id,
    },
    {
      ruleCode: "R02",
      questionIndex: 0,
      text: "绿色车辆应达到 ACEEE 99 分。",
      chunkId: chunks[0].id,
    },
    {
      ruleCode: "R02",
      questionIndex: 0,
      text: "不可信来源",
      chunkId: "missing",
    },
  ];
  const actual = validateGvGuidance(entries, retrieved, "GV-2026-10-23.1").get(
    "R02",
  );
  assert.equal(actual?.length, 1);
  assert.equal(actual?.[0].page, 1);
  assert.equal(actual?.[0].question, "ACEEE 评分");
  assert.equal(actual?.[0].rulePackageVersion, "GV-2026-10-23.1");
});
