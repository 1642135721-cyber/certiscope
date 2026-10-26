import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sourcePages from "./gv-source-pages.json";
import type { GvRuleCode } from "./rule-catalog";

export type BasisReference = {
  sourceId: "gv-source.pdf";
  sourceVersion: "LEED v4 BD+C NC";
  page: number;
  quote: string;
  contentHash: string;
};

export type BasisRetrievalReceipt = {
  retrievalId: string;
  createdAt: string;
  taskId: string;
  roundId: string;
  ruleCode: GvRuleCode;
  rulePackageVersion: string;
  corpusSnapshotId: string;
  retrievalMode: "EXACT" | "HYBRID_RAG";
  triggerReason: string;
  query: string;
  filters: { sourceVersion: string; ruleCode: GvRuleCode };
  retrievedBasis: BasisReference[];
  selectedBasisRefs: BasisReference[];
  excludedBasis: { page: number; reason: string }[];
  retrievalStatus: "FOUND" | "NOT_FOUND";
  conflicts: string[];
};

type Anchor = { page: number; needles: string[] };
const anchors: Record<GvRuleCode, Anchor[]> = {
  R01: [{ page: 1, needles: ["all parking spaces used by the project"] }],
  R02: [
    { page: 1, needles: ["Green vehicles must achieve"] },
    {
      page: 11,
      needles: ["Local equivalent standards to the American Council"],
    },
  ],
  R03: [
    { page: 1, needles: ["Designate 5%"] },
    { page: 9, needles: ["rounded up to 17 preferred parking spaces"] },
  ],
  R04: [
    { page: 1, needles: ["A discounted parking rate"] },
    { page: 8, needles: ["Discounted parking rates for green vehicles"] },
  ],
  R05: [
    {
      page: 1,
      needles: [
        "electric vehicle supply equipment",
        "2% of all parking spaces",
      ],
    },
    { page: 9, needles: ["The team must provide seven plug-in spaces"] },
  ],
  R06: [
    { page: 2, needles: ["The EVSE must"] },
    { page: 5, needles: ["Level 2 and 3 chargers qualify"] },
  ],
  R07: [
    { page: 2, needles: ["Install liquid or gas alternative fuel"] },
    { page: 10, needles: ["refueling facilities must have sufficient volume"] },
  ],
};
const fallbackTerms: Record<GvRuleCode, string> = {
  R01: "parking spaces project off-street shared garage",
  R02: "green vehicles qualifying equivalent standard rating",
  R03: "preferred parking spaces designate entrance signage",
  R04: "discounted parking rate green vehicles fee",
  R05: "electric vehicle supply equipment charging parking spaces",
  R06: "EVSE level connector network demand response charging",
  R07: "alternative fuel facilities vehicles per day refueling",
};

const pages = sourcePages as Record<string, string>;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const corpusSnapshotId = digest(JSON.stringify(pages));

function reference(page: number, quote: string): BasisReference {
  return {
    sourceId: "gv-source.pdf",
    sourceVersion: "LEED v4 BD+C NC",
    page,
    quote,
    contentHash: digest(quote),
  };
}

function exactReferences(code: GvRuleCode) {
  return anchors[code].flatMap(({ page, needles }) => {
    const original = pages[String(page)] ?? "";
    const normalized = original.toLowerCase();
    const offset = needles
      .map((needle) => normalized.indexOf(needle.toLowerCase()))
      .find((at) => at >= 0);
    if (offset === undefined) return [];
    return [
      reference(page, original.slice(Math.max(0, offset - 110), offset + 700)),
    ];
  });
}

function tokens(value: string) {
  const latin = value.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  const han =
    value
      .match(/[\u3400-\u9fff]{2,}/g)
      ?.flatMap((word) =>
        Array.from({ length: Math.max(0, word.length - 1) }, (_, index) =>
          word.slice(index, index + 2),
        ),
      ) ?? [];
  return [...new Set([...latin, ...han])];
}

function trigrams(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ");
  return new Set(
    Array.from({ length: Math.max(0, normalized.length - 2) }, (_, index) =>
      normalized.slice(index, index + 3),
    ),
  );
}

function overlap(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common++;
  return common / Math.sqrt(left.size * right.size);
}

/** Bounded term and character-ngram retrieval over the locked GV source. */
function hybridFallback(query: string, preferredPages: number[]) {
  const queryTokens = tokens(query);
  const queryTrigrams = trigrams(query);
  const candidates = Object.entries(pages)
    .flatMap(([pageText, content]) => {
      const page = Number(pageText);
      const chunks: { page: number; quote: string; score: number }[] = [];
      for (let at = 0; at < content.length; at += 600) {
        const quote = content.slice(at, at + 780);
        if (quote.length < 80) continue;
        const lower = quote.toLowerCase();
        const termHits = queryTokens.filter((term) =>
          lower.includes(term),
        ).length;
        const score =
          termHits * 3 +
          overlap(queryTrigrams, trigrams(quote)) * 20 +
          (preferredPages.includes(page) ? 2 : 0);
        if (termHits >= 2) chunks.push({ page, quote, score });
      }
      return chunks;
    })
    .sort((a, b) => b.score - a.score);
  return candidates
    .slice(0, 5)
    .map(({ page, quote }) => reference(page, quote));
}

export function retrieveGvBasis(input: {
  taskId: string;
  roundId: string;
  code: GvRuleCode;
  title: string;
  summary: string;
  rulePackageVersion: string;
}): BasisRetrievalReceipt {
  const query = `${input.code} ${input.title} ${input.summary} ${fallbackTerms[input.code]}`;
  const exact = exactReferences(input.code);
  // The PRD permits RAG only for a reproducible miss with measured benefit.
  // Keep the fallback dormant until that comparison has been completed.
  const useFallback =
    !exact.length && process.env.GV_HYBRID_RAG_ENABLED === "true";
  const retrievedBasis = exact.length
    ? exact
    : useFallback
      ? hybridFallback(
          fallbackTerms[input.code],
          anchors[input.code].map((item) => item.page),
        )
      : [];
  const selectedBasisRefs = retrievedBasis.slice(0, 2);
  return {
    retrievalId: randomUUID(),
    createdAt: new Date().toISOString(),
    taskId: input.taskId,
    roundId: input.roundId,
    ruleCode: input.code,
    rulePackageVersion: input.rulePackageVersion,
    corpusSnapshotId,
    retrievalMode: useFallback ? "HYBRID_RAG" : "EXACT",
    triggerReason: exact.length
      ? "规则 ID 和官方原文锚点已精确命中"
      : useFallback
        ? "精确锚点未命中，补充受控 GV 原文检索"
        : "精确锚点未命中；补充检索尚未通过场景对照验证，转人工核对",
    query,
    filters: { sourceVersion: "LEED v4 BD+C NC", ruleCode: input.code },
    retrievedBasis,
    selectedBasisRefs,
    excludedBasis: retrievedBasis.slice(2).map((item) => ({
      page: item.page,
      reason: "排序较低，未选入本次语义判断上下文",
    })),
    retrievalStatus: selectedBasisRefs.length ? "FOUND" : "NOT_FOUND",
    conflicts: [],
  };
}
