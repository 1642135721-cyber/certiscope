import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dedupeRuleSupport,
  mergeAdditionalSupport,
} from "../lib/gv/support-reconciliation.ts";

const source = { materialVersionId: "narrative", page: 1 };
const evidence = [{ text: "项目申报 14 个充电车位", source }];

test("a second pass cannot repeat the same R05 quantity claim", () => {
  const existing = [
    { text: "申报材料写明设置 14 个充电车位。", citations: [source] },
  ];
  const proposed = [{ text: "充电车位数量为 14 个。", citations: [source] }];
  assert.deepEqual(
    mergeAdditionalSupport("R05", existing, proposed, evidence),
    existing,
  );
});

test("a separately cited condition is retained", () => {
  const existing = [
    { text: "申报材料写明设置 14 个充电车位。", citations: [source] },
  ];
  const drawingSource = { materialVersionId: "drawing", page: 2 };
  const proposed = [
    {
      text: "图纸显示充电车位专用标识。",
      citations: [drawingSource],
    },
  ];
  const result = mergeAdditionalSupport("R05", existing, proposed, [
    ...evidence,
    { text: "专用充电车位标识", source: drawingSource },
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[1].citations, [drawingSource]);
});

test("unsupported citations are not promoted into supporting facts", () => {
  const result = mergeAdditionalSupport(
    "R06",
    [],
    [
      {
        text: "项目已启用联网功能。",
        citations: [{ materialVersionId: "missing", page: 8 }],
      },
    ],
    evidence,
  );
  assert.deepEqual(result, []);
});

test("R06 keeps distinct device conditions while merging repeated descriptions", () => {
  const page = { materialVersionId: "manual", page: 2 };
  const findings = [
    { text: "手册列出 230V 电压。", citations: [page] },
    {
      text: "手册列出 Wi-Fi、Ethernet、Modbus TCP 和 OCPP 联网方式。",
      citations: [page],
    },
    { text: "手册列出 Type 2 插座。", citations: [page] },
    {
      text: "手册列出 230V 电压和 1.4-22 kW 充电功率。",
      citations: [page],
    },
    { text: "手册第 2 页列出 Type 2 socket。", citations: [page] },
    {
      text: "手册列出 Wi-Fi、Ethernet、Modbus TCP 和 OCPP。",
      citations: [page],
    },
  ];
  const result = dedupeRuleSupport("R06", findings);
  assert.equal(result.length, 3);
  assert.match(result[0].text, /充电功率/);
  assert.match(result[1].text, /Wi-Fi/);
  assert.match(result[2].text, /Type 2/);
});

test("R06 preserves the four current cited support facts and new distinct details", () => {
  const page2 = { materialVersionId: "manual", page: 2 };
  const page9 = { materialVersionId: "manual", page: 9 };
  const four = [
    {
      text: "设备手册列明 230V、400V 及 1.4-22 kW 充电功率。",
      citations: [page2],
    },
    {
      text: "设备手册列明 Wi-Fi/Ethernet、Modbus TCP 和 OCPP 1.6。",
      citations: [page2],
    },
    { text: "设备手册列明 Type 2 socket。", citations: [page2] },
    { text: "设备手册第 9 页列出过压、欠压及过热保护。", citations: [page9] },
  ];
  assert.deepEqual(dedupeRuleSupport("R06", four), four);
  const withNew = dedupeRuleSupport("R06", [
    ...four,
    { text: "该型号另有 IP-addressable 可寻址能力。", citations: [page2] },
  ]);
  assert.equal(withNew.length, 5);
});

test("R06 merges repeated findings from the latest real run by condition and source page", () => {
  const page2 = { materialVersionId: "manual", page: 2 };
  const page9 = { materialVersionId: "manual", page: 9 };
  const findings = [
    {
      text: "设备手册列明 230V、400V 及 1.4 kW 至 22 kW，满足 Level 2 容量要求。",
      citations: [page2],
    },
    {
      text: "设备手册列明 Wi-Fi/Ethernet、Modbus TCP 和 OCPP 1.6。",
      citations: [page2],
    },
    { text: "设备手册列明车辆连接接口为 Type 2 socket。", citations: [page2] },
    {
      text: "设备手册第9页描述过压、欠压、过热和过流保护。",
      citations: [page9],
    },
    { text: "设备手册列明 Type 2 插座，符合 IEC 62196。", citations: [page2] },
    {
      text: "设备手册列明单相 1.4 kW 至 7.4 kW、三相 1.4 kW 至 22 kW 充电功率。",
      citations: [page2],
    },
    { text: "设备手册列明 RFID、App 和蓝牙认证方式。", citations: [page2] },
    {
      text: "设备手册列明 Normal Charge、Scheduled Charge 工作模式。",
      citations: [page2],
    },
    {
      text: "设备手册第9页包含过压、欠压、过热和过流保护机制，满足安全要求。",
      citations: [page9],
    },
  ];
  const result = dedupeRuleSupport("R06", findings);
  assert.equal(result.length, 6);
  assert.equal(result.filter((item) => /Type\s*2/.test(item.text)).length, 1);
  assert.equal(result.filter((item) => /过压/.test(item.text)).length, 1);
  assert.equal(
    result.filter((item) => /充电功率|Level\s*2/.test(item.text)).length,
    1,
  );
  assert.match(
    result.find((item) => /Type\s*2/.test(item.text)).text,
    /IEC\s*62196/,
  );
});

test("R06 V3 consolidation keeps all original details and source locations", () => {
  const findings = JSON.parse(
    readFileSync(
      new URL("./fixtures/gv-v3-r06-findings.json", import.meta.url),
    ),
  );
  const result = dedupeRuleSupport("R06", findings);
  assert.deepEqual(dedupeRuleSupport("R06", result), result);
  assert.equal(result.length, 6);
  assert.equal(
    result.flatMap((item) => item.sourceStatements ?? [item.text]).length,
    9,
  );
  assert.match(
    result.find((item) => /Level 2/.test(item.text)).text,
    /7\.4 kW/,
  );
  assert.match(
    result.find((item) => /Type 2/.test(item.text)).text,
    /IEC 62196/,
  );
  assert.match(
    result.find((item) => /过压/.test(item.text)).text,
    /三相输入检测/,
  );
  assert.doesNotMatch(
    result.find((item) => /过压/.test(item.text)).text,
    /补充材料表述/,
  );
  assert.doesNotMatch(
    result.find((item) => /Type 2/.test(item.text)).text,
    /补充材料表述/,
  );
  for (const original of findings) {
    assert.ok(
      result.some((item) =>
        (item.sourceStatements ?? [item.text]).includes(original.text),
      ),
      `Lost original statement: ${original.text}`,
    );
  }
});

test("R06 does not merge similar claims from different material pages", () => {
  const text = "设备手册列明 Type 2 插座。";
  const result = dedupeRuleSupport("R06", [
    { text, citations: [{ materialVersionId: "manual-a", page: 2 }] },
    { text, citations: [{ materialVersionId: "manual-b", page: 2 }] },
  ]);
  assert.equal(result.length, 2);
});
