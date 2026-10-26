import type { NumericField } from "./rule-engine";
import type { SourceLocation } from "./types";

type Fragment = {
  material_version_id: string;
  text_content: string;
  source_location: SourceLocation | null;
  status: string;
};

export type LocatedNumericCandidate = {
  key: NumericField;
  value: number;
  source: SourceLocation;
  scope: string;
};

// Only direct project quantity statements are extracted here. Calculated
// minimums and component counts remain review clues, never field values.
const directStatements: {
  key: NumericField;
  pattern: RegExp;
  scope: string;
}[] = [
  {
    key: "total_parking_spaces",
    pattern:
      /\b(?:number|total)\s+of\s+parking\s+spaces\b[^.;]{0,130}?\b(?:is|are|equals?)\s+(\d{1,3}(?:,\d{3})*|\d+)\b/gi,
    scope: "项目停车位总数的直接陈述；统计范围仍须人工核对",
  },
  {
    key: "preferred_spaces",
    pattern:
      /\bpreferred\s+parking\s+spaces?\b[^.;]{0,230}?\btotal\s+(\d{1,3}(?:,\d{3})*|\d+)\b/gi,
    scope: "优先车位总数的直接陈述；位号与图纸仍须人工核对",
  },
  {
    key: "evse_spaces",
    pattern:
      /\bcharging\s+spaces?\s+(?:is|are)\s+located\b[^.;]{0,100}?\b(?:is|are)\s+(\d{1,3}(?:,\d{3})*|\d+)\b/gi,
    scope: "充电车位布置数量的直接陈述；不得据此认定设备台数或独立性",
  },
];

export function extractLocatedNumericCandidates(
  fragments: Fragment[],
  selectedIds: string[],
): LocatedNumericCandidate[] {
  const selected = new Set(selectedIds);
  const result: LocatedNumericCandidate[] = [];
  const seen = new Set<string>();
  for (const fragment of fragments) {
    const source = fragment.source_location;
    if (
      !selected.has(fragment.material_version_id) ||
      fragment.status === "failed" ||
      !source ||
      source.materialVersionId !== fragment.material_version_id
    )
      continue;
    const text = fragment.text_content.replace(/\s+/g, " ").trim();
    for (const statement of directStatements) {
      for (const match of text.matchAll(statement.pattern)) {
        const value = Number(match[1].replaceAll(",", ""));
        if (!Number.isSafeInteger(value) || value < 0) continue;
        const key = [
          statement.key,
          value,
          source.materialVersionId,
          source.page ?? "",
          source.sheet ?? "",
          source.cell ?? "",
          source.paragraph ?? "",
        ].join(":");
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          key: statement.key,
          value,
          source,
          scope: statement.scope,
        });
      }
    }
  }
  return result;
}

/** Compare explicit area counts without treating components as total spaces. */
function preferredParkingAreaCounts(
  fragments: Fragment[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds);
  const counts = new Map<string, Map<number, Set<number>>>();
  for (const fragment of fragments) {
    const source = fragment.source_location;
    if (
      !selected.has(fragment.material_version_id) ||
      fragment.status === "failed" ||
      !source ||
      source.materialVersionId !== fragment.material_version_id ||
      !source.page
    )
      continue;
    const text = fragment.text_content.replace(/\s+/g, " ");
    for (const [, first, second] of text.matchAll(
      /preferred\s+parking\s+spaces?\s+for\s+GV\s+in\s+garage\s+is\s+\d+\s*\(\s*basement\s*1\s+floor\s+is\s+(\d+)\s*,\s*basement\s*2\s+floor\s+is\s+(\d+)/gi,
    )) {
      for (const [floor, value] of [
        ["1", first],
        ["2", second],
      ]) {
        const key = `${fragment.material_version_id}:B${floor}`;
        const pages = counts.get(key) ?? new Map<number, Set<number>>();
        const locations = pages.get(Number(value)) ?? new Set<number>();
        locations.add(source.page);
        pages.set(Number(value), locations);
        counts.set(key, pages);
      }
    }
    for (const [, value, floor] of text.matchAll(
      /preferred\s+parking\s+spaces?\s+for\s+GV\s*\(\s*(\d+)\s*cars\s*\)\s*-\s*BASEMENT\s*([12])/gi,
    )) {
      const key = `${fragment.material_version_id}:B${floor}`;
      const pages = counts.get(key) ?? new Map<number, Set<number>>();
      const locations = pages.get(Number(value)) ?? new Set<number>();
      locations.add(source.page);
      pages.set(Number(value), locations);
      counts.set(key, pages);
    }
  }
  return counts;
}

export function preferredParkingAreaConflicts(
  fragments: Fragment[],
  selectedIds: string[],
): string[] {
  const counts = preferredParkingAreaCounts(fragments, selectedIds);
  return [...counts.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([key, values]) => {
      const area = key.split(":")[1];
      const details = [...values.entries()]
        .map(
          ([value, pages]) =>
            `${value} 个（第 ${[...pages].sort((a, b) => a - b).join("、")} 页）`,
        )
        .join("，");
      return `${area} 优先车位分项数量不一致：${details}；须对照图纸位号核实申报总数。`;
    });
}

/** A one-stall drawing discrepancy need not invalidate a safely met quantity floor. */
export function preferredParkingConservativeTotal(
  fragments: Fragment[],
  selectedIds: string[],
  reportedTotal: number,
): number {
  const counts = preferredParkingAreaCounts(fragments, selectedIds);
  const spread = [...counts.values()].reduce((sum, values) => {
    const candidates = [...values.keys()];
    return sum + (Math.max(...candidates) - Math.min(...candidates));
  }, 0);
  return Math.max(0, reportedTotal - spread);
}

/** Sum only floor totals explicitly stated on located drawing pages. */
export function basementParkingTotals(
  fragments: Fragment[],
  selectedIds: string[],
): { floor: number; count: number; source: SourceLocation }[] {
  const selected = new Set(selectedIds);
  const byFloor = new Map<number, Map<number, SourceLocation>>();
  for (const fragment of fragments) {
    const source = fragment.source_location;
    if (
      !selected.has(fragment.material_version_id) ||
      fragment.status === "failed" ||
      !source?.page ||
      source.materialVersionId !== fragment.material_version_id
    )
      continue;
    const text = fragment.text_content.replace(/\s+/g, " ");
    for (const [, floorText, countText] of text.matchAll(
      /\bthe\s+total\s+parking\s+lots\s+in\s+the\s+basement\s*[-–]?\s*(\d+)\s+are\s+(\d{1,3}(?:,\d{3})*|\d+)\s+cars\b/gi,
    )) {
      const floor = Number(floorText);
      const count = Number(countText.replaceAll(",", ""));
      if (!Number.isSafeInteger(floor) || !Number.isSafeInteger(count))
        continue;
      const choices = byFloor.get(floor) ?? new Map<number, SourceLocation>();
      choices.set(count, source);
      byFloor.set(floor, choices);
    }
  }
  return [...byFloor.entries()]
    .filter(([, choices]) => choices.size === 1)
    .map(([floor, choices]) => {
      const [count, source] = [...choices.entries()][0];
      return { floor, count, source };
    })
    .sort((a, b) => a.floor - b.floor);
}
