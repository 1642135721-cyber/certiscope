import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sourcePages from "../gv-source-pages.json";
import type { GvRuleCode } from "../rule-catalog";

export type GvGuidanceChunk = {
  id: string;
  ruleCode: GvRuleCode;
  clause: string;
  sourceId: "gv-source.pdf";
  sourceVersion: "LEED v4 BD+C NC";
  page: number;
  quote: string;
  contentHash: string;
};

export type GvRuleGuidance = {
  retrievalId: string;
  questionIndex: number;
  question: string;
  query: string;
  text: string;
  clause: string;
  sourceId: "gv-source.pdf";
  page: number;
  sourceVersion: string;
  chunkId: string;
  contentHash: string;
  corpusSnapshotId: string;
  rulePackageVersion: string;
  retrievalMode: "RULE_GUIDANCE_RAG";
  retrievedAt: string;
};

type ClauseSpec = {
  code: GvRuleCode;
  clause: string;
  page: number;
  start: string;
  end: string;
};

// Only the active GV credit's official requirement and guidance passages are indexed.
const clauses: ClauseSpec[] = [
  {
    code: "R01",
    clause: "项目停车总量与分母",
    page: 1,
    start: "Designate 5% of all parking spaces used by the project",
    end: "Clearly identify and enforce",
  },
  {
    code: "R02",
    clause: "绿色车辆 ACEEE 资格",
    page: 1,
    start: "Green vehicles must achieve",
    end: "A discounted parking rate",
  },
  {
    code: "R02",
    clause: "美国境外当地等效标准",
    page: 11,
    start: "Local equivalent standards to the American Council",
    end: "Ca MP us Group Approach",
  },
  {
    code: "R03",
    clause: "优先车位比例、标识与分布",
    page: 1,
    start: "Designate 5% of all parking spaces used by the project",
    end: "Green vehicles must achieve",
  },
  {
    code: "R03",
    clause: "分区车位计算示例",
    page: 10,
    start: "Example 2. Location of preferred parking",
    end: "Figure 3 illustrates the result",
  },
  {
    code: "R04",
    clause: "绿色车辆停车折扣",
    page: 1,
    start: "A discounted parking rate of at least 20%",
    end: "In addition to preferred parking",
  },
  {
    code: "R04",
    clause: "折扣公示与长期适用",
    page: 8,
    start: "Discounted parking rates for green vehicles",
    end: "s i G na G e for Green",
  },
  {
    code: "R05",
    clause: "EVSE 车位比例、专用性和独立性",
    page: 1,
    start: "Install electrical vehicle supply equipment (EVSE)",
    end: "l o C a T ion and Trans P or T a T ion",
  },
  {
    code: "R05",
    clause: "EVSE 数量计算示例",
    page: 9,
    start: "Minimum EVSE spaces required",
    end: "Figure 2 shows the arrangement",
  },
  {
    code: "R06",
    clause: "EVSE 设备技术条件",
    page: 2,
    start: "The EVSE must:",
    end: "or oPT ion 2.",
  },
  {
    code: "R06",
    clause: "EVSE 型号资料与联网证明",
    page: 5,
    start: "sT e P 5. Confir M C o MP lian C e",
    end: "sT e P 6. i ns T all",
  },
  {
    code: "R07",
    clause: "替代设施每日服务能力",
    page: 2,
    start: "Install liquid or gas alternative fuel",
    end: "s C hools oPT ion 1.",
  },
  {
    code: "R07",
    clause: "每日服务能力计算示例",
    page: 10,
    start: "In addition, the project is providing natural gas",
    end: "Figure 3. Example",
  },
];

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const pages = sourcePages as Record<string, string>;
export const gvGuidanceCorpusSnapshotId = digest(JSON.stringify(pages));

function clauseText(spec: ClauseSpec): string {
  const page = pages[String(spec.page)] ?? "";
  const lower = page.toLowerCase();
  const start = lower.indexOf(spec.start.toLowerCase());
  if (start < 0) return "";
  const end = lower.indexOf(spec.end.toLowerCase(), start + spec.start.length);
  if (end < 0 || end <= start) return "";
  return page.slice(start, end).trim();
}

// The official GV source is English. Whitespace words approximate model tokens;
// adjacent 220-unit chunks share the previous 100 units and retain source page.
export function chunkGvClause(
  spec: ClauseSpec,
  size = 220,
  overlap = 100,
): GvGuidanceChunk[] {
  const text = clauseText(spec);
  const words = [...text.matchAll(/\S+/g)];
  if (!words.length || size <= overlap) return [];
  const chunks: GvGuidanceChunk[] = [];
  for (let start = 0; start < words.length; start += size - overlap) {
    const last = Math.min(start + size, words.length) - 1;
    const from = words[start].index ?? 0;
    const to = (words[last].index ?? 0) + words[last][0].length;
    const quote = text.slice(from, to);
    const contentHash = digest(quote);
    chunks.push({
      id: `${spec.code}-${spec.page}-${chunks.length + 1}-${contentHash.slice(0, 10)}`,
      ruleCode: spec.code,
      clause: spec.clause,
      sourceId: "gv-source.pdf",
      sourceVersion: "LEED v4 BD+C NC",
      page: spec.page,
      quote,
      contentHash,
    });
    if (last === words.length - 1) break;
  }
  return chunks;
}

export const gvGuidanceChunks = clauses.flatMap((spec) => chunkGvClause(spec));

function terms(value: string) {
  return [
    ...new Set(value.toLowerCase().match(/[a-z][a-z0-9-]{2,}|\d+/g) ?? []),
  ];
}

const topicTerms: { pattern: RegExp; terms: string[] }[] = [
  {
    pattern: /ACEEE|评分|绿色车辆资格|车型|等效标准/i,
    terms: ["green", "score", "aceee", "equivalent"],
  },
  {
    pattern: /总车位|停车分母|停车范围|共享|排除/i,
    terms: ["all", "parking", "spaces", "project"],
  },
  {
    pattern: /优先车位|分区|分布|标识/i,
    terms: ["preferred", "parking", "spaces", "proportionally"],
  },
  { pattern: /折扣|费率|公示/i, terms: ["discount", "rate", "posted"] },
  {
    pattern: /充电车位|EVSE.*车位|独立|重叠/i,
    terms: ["evse", "parking", "addition", "2%"],
  },
  {
    pattern: /联网|IP|网络|需求响应|分时电价|DR|TOU/i,
    terms: ["networked", "internet", "demand-response", "time-of-use"],
  },
  {
    pattern: /电压|Level 2|连接器|接口/i,
    terms: ["level", "volts", "connector"],
  },
  {
    pattern: /替代燃料|换电|每日服务/i,
    terms: ["fuel", "vehicles", "per", "day"],
  },
];

export function retrieveGvGuidanceChunks(
  code: GvRuleCode,
  pendingQuestions: string[],
  limit = 3,
): GvGuidanceChunk[] {
  const joined = pendingQuestions.join(" ");
  const query = [
    ...new Set([
      ...terms(joined),
      ...topicTerms.flatMap((topic) =>
        topic.pattern.test(joined) ? topic.terms : [],
      ),
    ]),
  ];
  return gvGuidanceChunks
    .filter((chunk) => chunk.ruleCode === code)
    .map((chunk, order) => ({
      chunk,
      order,
      score: query.filter(
        (term) =>
          chunk.quote.toLowerCase().includes(term) ||
          chunk.clause.toLowerCase().includes(term),
      ).length,
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

const qaTopics: { code: GvRuleCode; pattern: RegExp }[] = [
  { code: "R01", pattern: /R01|总车位|停车总数|停车分母|申报路径|路外停车/i },
  { code: "R02", pattern: /R02|资格|ACEEE|车型|评分|等效标准/i },
  { code: "R03", pattern: /R03|优先车位|优先停车|车位分布|近入口/i },
  { code: "R04", pattern: /R04|折扣|费率|优惠停车|公示/i },
  { code: "R05", pattern: /R05|充电车位|充电位|车位重叠|车位独立/i },
  {
    code: "R06",
    pattern: /R06|充电设备|充电桩|电压|连接器|联网|需求响应|分时电价|DR|TOU/i,
  },
  { code: "R07", pattern: /R07|替代燃料|天然气|换电|每日服务|服务能力/i },
];

export function retrieveGvQaChunks(question: string, previousQuestion = "") {
  const query = `${question} ${previousQuestion}`;
  const matched = qaTopics
    .filter((topic) => topic.pattern.test(query))
    .map((topic) => topic.code);
  const codes = matched.length
    ? matched
    : /GV|绿色车辆|绿色车|LEED/i.test(query)
      ? qaTopics.map((topic) => topic.code)
      : [];
  const perRule = codes.length === 1 ? 4 : codes.length <= 2 ? 3 : 1;
  return codes
    .flatMap((code) => retrieveGvGuidanceChunks(code, [query], perRule))
    .slice(0, 8);
}

export function validateGvGuidance(
  entries: {
    ruleCode: string;
    questionIndex: number;
    text: string;
    chunkId: string;
  }[],
  retrieved: ReadonlyMap<
    string,
    { question: string; chunks: GvGuidanceChunk[] }
  >,
  rulePackageVersion: string,
): Map<GvRuleCode, GvRuleGuidance[]> {
  const result = new Map<GvRuleCode, GvRuleGuidance[]>();
  const retrievedAt = new Date().toISOString();
  for (const entry of entries) {
    const code = entry.ruleCode as GvRuleCode;
    const questionEntry = retrieved.get(`${code}:${entry.questionIndex}`);
    const chunk = questionEntry?.chunks.find(
      (item) => item.id === entry.chunkId,
    );
    const text = entry.text.trim();
    if (!chunk || !text || text.length > 240 || !questionEntry?.question)
      continue;
    // Numeric requirements must occur in the cited official passage.
    const citedNumbers = new Set(chunk.quote.match(/\d+(?:\.\d+)?/g) ?? []);
    const statedNumbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
    if (statedNumbers.some((number) => !citedNumbers.has(number))) continue;
    const items = result.get(code) ?? [];
    if (items.length >= 3 || items.some((item) => item.text === text)) continue;
    items.push({
      retrievalId: randomUUID(),
      questionIndex: entry.questionIndex,
      question: questionEntry.question,
      query: questionEntry.question,
      text,
      clause: chunk.clause,
      sourceId: chunk.sourceId,
      page: chunk.page,
      sourceVersion: chunk.sourceVersion,
      chunkId: chunk.id,
      contentHash: chunk.contentHash,
      corpusSnapshotId: gvGuidanceCorpusSnapshotId,
      rulePackageVersion,
      retrievalMode: "RULE_GUIDANCE_RAG",
      retrievedAt,
    });
    result.set(code, items);
  }
  return result;
}
