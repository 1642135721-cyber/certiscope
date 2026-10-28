import type { LocatedContent } from "@/lib/ai/provider";
import type { SourceLocation } from "@/lib/gv/types";

export type SupportFinding = {
  text: string;
  citations: SourceLocation[];
  /** Original wording retained when near-duplicate facts are consolidated. */
  sourceStatements?: string[];
};
type Finding = SupportFinding;

function r06Details(text: string): Set<string> {
  const details = new Set<string>();
  const markers: [string, RegExp][] = [
    ["level2", /Level\s*2/i],
    ["type2", /Type\s*2/i],
    ["iec62196", /IEC\s*62196/i],
    ["j1772", /J1772/i],
    ["wifi", /Wi-?Fi/i],
    ["ethernet", /Ethernet/i],
    ["ocpp", /OCPP/i],
    ["modbus", /Modbus/i],
    ["ip-addressable", /IP[-\s]*addressable|IP\s*可寻址/i],
    ["demand-response", /需求响应|\bDR\b/i],
    ["time-of-use", /分时电价|\bTOU\b/i],
  ];
  for (const [key, pattern] of markers)
    if (pattern.test(text)) details.add(key);
  for (const value of text.matchAll(/\b\d+(?:\.\d+)?\s*(?:kW|V)\b/gi))
    details.add(value[0].replace(/\s/g, "").toLowerCase());
  return details;
}

function sameCitedPage(left: Finding, right: Finding) {
  return left.citations.some((source) =>
    right.citations.some(
      (other) =>
        source.materialVersionId === other.materialVersionId &&
        source.page === other.page,
    ),
  );
}

function preferableR06Finding(previous: Finding, current: Finding) {
  const oldDetails = r06Details(previous.text);
  const newDetails = r06Details(current.text);
  const oldHasAllNew = [...newDetails].every((item) => oldDetails.has(item));
  const newHasAllOld = [...oldDetails].every((item) => newDetails.has(item));
  if (newHasAllOld && !oldHasAllNew) return current;
  if (oldHasAllNew && !newHasAllOld) return previous;
  if (newDetails.size !== oldDetails.size)
    return newDetails.size > oldDetails.size ? current : previous;
  if (topic("R06", previous.text) === "safety")
    return /(?:符合|满足).{0,14}(?:标准|要求)/.test(previous.text)
      ? current
      : previous;
  return current.text.length > previous.text.length ? current : previous;
}

export function dedupeRuleSupport(
  ruleCode: string,
  findings: Finding[],
): Finding[] {
  if (ruleCode !== "R06") return findings;
  const result: Finding[] = [];
  for (const finding of findings) {
    const duplicate = result.findIndex(
      (item) =>
        sameCitedPage(item, finding) &&
        originalStatements(item).some(
          (statement) => statementSimilarity(statement, finding.text) >= 0.42,
        ),
    );
    if (duplicate < 0) {
      result.push(finding);
      continue;
    }
    const previous = result[duplicate];
    const statements = [
      ...new Set([
        ...originalStatements(previous),
        ...originalStatements(finding),
      ]),
    ];
    const preferred = statements
      .map((text) => ({ text, citations: [] as SourceLocation[] }))
      .reduce(preferableR06Finding);
    const preferredDetails = r06Details(preferred.text);
    const others = statements.filter(
      (statement) =>
        statement !== preferred.text &&
        [...r06Details(statement)].some(
          (detail) => !preferredDetails.has(detail),
        ),
    );
    result[duplicate] = {
      ...preferred,
      text: others.length
        ? `${preferred.text} 补充材料表述：${others.join("；")}`
        : preferred.text,
      sourceStatements: statements,
      citations: [...previous.citations, ...finding.citations].filter(
        (source, index, all) =>
          all.findIndex(
            (other) =>
              other.materialVersionId === source.materialVersionId &&
              other.page === source.page,
          ) === index,
      ),
    };
  }
  return result;
}

function originalStatements(finding: Finding): string[] {
  return finding.sourceStatements?.length
    ? finding.sourceStatements
    : [finding.text.replace(/\s*补充材料表述：[\s\S]*$/, "")];
}

function statementSimilarity(left: string, right: string): number {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/socket|插座/gi, "连接口")
      .replace(
        /设备手册|第\s*\d+\s*页|列明|显示|描述了?|包含|表明|其中提到|从技术参数上|符合|满足|要求|标准|技术参数|充电|设备|和|及|的|了|[^\p{L}\p{N}]/gu,
        "",
      );
  const bigrams = (value: string) => {
    const characters = [...normalize(value)];
    return new Set(
      characters
        .slice(0, -1)
        .map((character, index) => character + characters[index + 1]),
    );
  };
  const leftGrams = bigrams(left);
  const rightGrams = bigrams(right);
  const size = Math.min(leftGrams.size, rightGrams.size);
  if (size < 4) return 0;
  return [...leftGrams].filter((gram) => rightGrams.has(gram)).length / size;
}

function topic(ruleCode: string, text: string): string | null {
  if (ruleCode === "R05") {
    if (/标识|标牌|图标|涂装|marking|sign/i.test(text)) return "signage";
    if (/重叠|独立|分离|overlap/i.test(text)) return "independence";
    if (/数量|最低|下限|\d+\s*个充电车位|2%/i.test(text)) return "quantity";
  }
  if (ruleCode === "R03" && /数量|最低|下限|5%/i.test(text)) return "quantity";
  if (ruleCode === "R01" && /总车位|总停车位|停车分母/i.test(text))
    return "total";
  if (ruleCode === "R06") {
    if (/过压|欠压|过热|过流|保护机制|安全运行/i.test(text)) return "safety";
    if (/RFID|认证方式|蓝牙|App|远程控制|远程监控/i.test(text))
      return "authentication";
    if (
      /工作模式|Normal Charge|Scheduled Charge|PV Power|Next Trip/i.test(text)
    )
      return "operating-mode";
    if (/需求响应|分时电价|\bDR\b|\bTOU\b/i.test(text)) return "dr-tou";
    if (/Type\s*2|连接器|插座|socket|IEC\s*62196|J1772/i.test(text))
      return "connector";
    if (/Wi-?Fi|Ethernet|OCPP|Modbus|联网|网络通信/i.test(text))
      return "network";
    if (/电压|\b230\s*V|\b400\s*V|Level\s*2|充电功率/i.test(text))
      return "voltage-power";
  }
  return null;
}

export function mergeAdditionalSupport(
  ruleCode: string,
  existing: Finding[],
  proposed: Finding[],
  evidenceParts: LocatedContent[],
): Finding[] {
  const merged = [...existing];
  for (const finding of proposed) {
    if (
      !finding ||
      typeof finding.text !== "string" ||
      !Array.isArray(finding.citations)
    )
      continue;
    const text = finding.text.trim().slice(0, 300);
    if (!text) continue;
    const citations = finding.citations
      .map(
        (source) =>
          evidenceParts.find(
            (part) =>
              part.source.materialVersionId === source.materialVersionId &&
              part.source.page === source.page &&
              part.source.image === source.image &&
              part.source.sheet === source.sheet &&
              part.source.cell === source.cell &&
              part.source.paragraph === source.paragraph,
          )?.source ?? null,
      )
      .filter((source): source is SourceLocation => source !== null);
    if (!citations.length) continue;
    const normalized = text.replace(/[\s，。·：:、（）()]/g, "").toLowerCase();
    const candidateTopic = topic(ruleCode, text);
    const duplicate = merged.findIndex(
      (item) =>
        item.text.replace(/[\s，。·：:、（）()]/g, "").toLowerCase() ===
          normalized ||
        (candidateTopic !== null &&
          topic(ruleCode, item.text) === candidateTopic &&
          (ruleCode !== "R06" || sameCitedPage(item, { text, citations })) &&
          item.citations.some((previous) =>
            citations.some(
              (current) =>
                current.materialVersionId === previous.materialVersionId &&
                current.page === previous.page,
            ),
          )),
    );
    if (duplicate >= 0) {
      if (ruleCode === "R06") merged.push({ text, citations });
      continue;
    }
    merged.push({ text, citations });
  }
  return ruleCode === "R06" ? dedupeRuleSupport(ruleCode, merged) : merged;
}
