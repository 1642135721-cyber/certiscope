import type { LocatedContent } from "@/lib/ai/provider";
import type { GvRuleCode } from "@/lib/gv/rule-catalog";
import type { SourceLocation } from "@/lib/gv/types";

type Fragment = {
  material_version_id: string;
  text_content: string;
  source_location: SourceLocation | null;
  status: string;
};

const terms: Record<GvRuleCode, string[]> = {
  R01: [
    "parking",
    "total",
    "off-street",
    "garage",
    "shared",
    "停车",
    "总车位",
    "分母",
    "共享",
  ],
  R02: [
    "qualif",
    "aceee",
    "equivalent",
    "green score",
    "vehicle rating",
    "eligible vehicle",
    "绿色车辆",
    "资格",
    "车型",
  ],
  R03: ["preferred", "priority", "signage", "entrance", "优先", "标识", "入口"],
  R04: ["discount", "rate", "fee", "price", "折扣", "费率", "收费"],
  R05: ["evse", "charging", "charger", "parking space", "充电", "车位", "独立"],
  R06: [
    "level 2",
    "voltage",
    "technical specification",
    "type 2 socket",
    "connector",
    "iec 62196",
    "sae j1772",
    "modbus",
    "network",
    "demand response",
    "time of use",
    "ocpp",
    "设备",
    "电压",
    "连接器",
    "联网",
    "响应",
  ],
  R07: [
    "alternative fuel",
    "capacity",
    "vehicles per day",
    "替代燃料",
    "换电",
    "服务能力",
  ],
};

function positions(text: string, words: string[]): number[] {
  const lower = text.toLowerCase();
  return words
    .flatMap((word) => {
      const found: number[] = [];
      let from = 0;
      while (found.length < 4) {
        const at = lower.indexOf(word, from);
        if (at < 0) break;
        found.push(at);
        from = at + word.length;
      }
      return found;
    })
    .sort((a, b) => a - b);
}

function excerpt(text: string, hits: number[], maxLength = 850): string {
  if (text.length <= maxLength) return text;
  const start = hits.length ? Math.max(0, hits[0] - 240) : 0;
  return `${start ? "…" : ""}${text.slice(start, start + maxLength)}${start + maxLength < text.length ? "…" : ""}`;
}

function locationKey(source: SourceLocation): string {
  return [
    source.materialVersionId,
    source.page ?? "",
    source.sheet ?? "",
    source.cell ?? "",
    source.paragraph ?? "",
  ].join(":");
}

/** Select bounded, source-located excerpts from the current round only. */
export function retrieveGvEvidence(
  fragments: Fragment[],
  ruleCodes: GvRuleCode[],
  selectedIds: string[],
  limit = 12000,
): LocatedContent[] {
  const available = fragments.filter(
    (item) =>
      selectedIds.includes(item.material_version_id) &&
      item.text_content.trim() &&
      item.source_location?.materialVersionId === item.material_version_id,
  );
  const selected: LocatedContent[] = [];
  const seen = new Set<string>();
  const perFile = new Map<string, number>();
  let remaining = limit;
  const add = (fragment: Fragment, hits: number[]) => {
    const source = fragment.source_location!;
    const text = excerpt(fragment.text_content.trim(), hits);
    const key = `${locationKey(source)}:${text}`;
    if (seen.has(key) || remaining < 120) return;
    const used = perFile.get(fragment.material_version_id) ?? 0;
    const fileAllowance =
      Math.min(4500, Math.floor(limit / selectedIds.length) + 800) - used;
    if (fileAllowance < 120) return;
    const kept = text.slice(0, Math.min(remaining, fileAllowance));
    selected.push({ text: kept, source });
    seen.add(key);
    remaining -= kept.length;
    perFile.set(fragment.material_version_id, used + kept.length);
  };

  for (const id of selectedIds) {
    const ranked = available
      .filter((item) => item.material_version_id === id)
      .map((fragment) => {
        const hits = positions(
          fragment.text_content,
          ruleCodes.flatMap((code) => terms[code]),
        );
        return { fragment, hits };
      })
      .sort((a, b) => b.hits.length - a.hits.length);
    if (ranked[0]) add(ranked[0].fragment, ranked[0].hits);
  }
  for (const ruleCode of ruleCodes) {
    const ranked = available
      .map((fragment) => {
        const hits = positions(fragment.text_content, terms[ruleCode]);
        return { fragment, hits, score: new Set(hits).size };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    const locations = new Set<string>();
    for (const item of ranked) {
      const key = locationKey(item.fragment.source_location!);
      if (locations.has(key)) continue;
      add(item.fragment, item.hits);
      locations.add(key);
      if (locations.size === 3) break;
    }
  }
  return selected;
}

/** Build a small, traceable evidence set for each applicable rule. */
export function retrieveGvRuleEvidence(
  fragments: Fragment[],
  ruleCodes: GvRuleCode[],
  selectedIds: string[],
  perRuleLimit = 3200,
): Map<GvRuleCode, LocatedContent[]> {
  const available = fragments.filter(
    (item) =>
      selectedIds.includes(item.material_version_id) &&
      item.status !== "failed" &&
      item.text_content.trim() &&
      item.source_location?.materialVersionId === item.material_version_id,
  );
  const result = new Map<GvRuleCode, LocatedContent[]>();
  for (const code of ruleCodes) {
    const ranked = available
      .map((fragment, order) => {
        const hits = positions(fragment.text_content, terms[code]);
        return { fragment, hits, order, score: hits.length };
      })
      .sort((a, b) => b.score - a.score || a.order - b.order);
    const chosen: LocatedContent[] = [];
    const seen = new Set<string>();
    const perFile = new Map<string, number>();
    let remaining =
      code === "R06" ? Math.max(perRuleLimit, 4200) : perRuleLimit;
    for (const item of ranked) {
      if (chosen.length >= 6 || remaining < 120) break;
      if (code === "R02" && item.score === 0) continue;
      // Keep a bounded opening fragment from another file if keywords missed
      // the relevant wording; it remains only a retrieval clue.
      if (
        item.score === 0 &&
        (chosen.length >= 4 || perFile.has(item.fragment.material_version_id))
      )
        continue;
      const source = item.fragment.source_location!;
      const key = locationKey(source);
      if (
        seen.has(key) ||
        (perFile.get(item.fragment.material_version_id) ?? 0) >= 2
      )
        continue;
      const excerptLength = code === "R06" ? 1450 : 850;
      const text = excerpt(
        item.fragment.text_content.trim(),
        item.hits,
        excerptLength,
      ).slice(0, Math.min(excerptLength + 1, remaining));
      if (!text) continue;
      chosen.push({ text, source });
      seen.add(key);
      perFile.set(
        item.fragment.material_version_id,
        (perFile.get(item.fragment.material_version_id) ?? 0) + 1,
      );
      remaining -= text.length;
    }
    result.set(code, chosen);
  }
  return result;
}

export function retrievedSource(
  source: SourceLocation,
  parts: LocatedContent[],
): SourceLocation | null {
  if (!source || typeof source.materialVersionId !== "string") return null;
  const visualPdf = parts.find(
    (part) =>
      (part.pdfDataUrl || part.pdfUrl) &&
      part.source.materialVersionId === source.materialVersionId &&
      Number.isInteger(source.page) &&
      (source.page ?? 0) >= 1 &&
      (part.pdfOriginalPages
        ? part.pdfOriginalPages.includes(source.page ?? 0) ||
          (source.page ?? 0) <= part.pdfOriginalPages.length
        : (source.page ?? 0) <= (part.pdfPageCount ?? 0)),
  );
  if (visualPdf) {
    const originalPages = visualPdf.pdfOriginalPages;
    const originalPage =
      originalPages && !originalPages.includes(source.page ?? 0)
        ? originalPages[(source.page ?? 1) - 1]
        : source.page;
    return {
      ...source,
      page: originalPage,
      note: "千问 PDF 视觉识别候选；请对照原件该页核实",
    };
  }
  return (
    parts.find((part) => {
      const actual = part.source;
      return (
        actual.materialVersionId === source.materialVersionId &&
        actual.page === source.page &&
        actual.image === source.image &&
        actual.sheet === source.sheet &&
        actual.cell === source.cell &&
        actual.paragraph === source.paragraph
      );
    })?.source ?? null
  );
}

export function citationWasRetrieved(
  source: SourceLocation,
  parts: LocatedContent[],
): boolean {
  return retrievedSource(source, parts) !== null;
}
