import "server-only";
import sourcePages from "./gv-source-pages.json";
import type { GvRuleCode } from "./rule-catalog";

type RuleLocation = { page: number; needles: string[]; length: number };

// First cite the credit requirement, then a relevant explanation or calculation.
// These excerpts never replace the locked rule package.
const locations: Record<GvRuleCode, RuleLocation[]> = {
  R01: [{ page: 1, needles: ["all parking spaces used by the project"], length: 700 }],
  R02: [
    { page: 1, needles: ["Green vehicles must achieve"], length: 650 },
    { page: 11, needles: ["Local equivalent standards to the American Council"], length: 600 },
  ],
  R03: [
    { page: 1, needles: ["Designate 5%"], length: 650 },
    { page: 9, needles: ["rounded up to 17 preferred parking spaces"], length: 550 },
  ],
  R04: [
    { page: 1, needles: ["A discounted parking rate"], length: 550 },
    { page: 8, needles: ["Discounted parking rates for green vehicles"], length: 700 },
  ],
  R05: [
    { page: 1, needles: ["electric vehicle supply equipment", "2% of all parking spaces"], length: 650 },
    { page: 9, needles: ["The team must provide seven plug-in spaces"], length: 550 },
  ],
  R06: [
    { page: 2, needles: ["The EVSE must"], length: 650 },
    { page: 5, needles: ["Level 2 and 3 chargers qualify"], length: 600 },
  ],
  R07: [
    { page: 2, needles: ["Install liquid or gas alternative fuel"], length: 650 },
    { page: 10, needles: ["refueling facilities must have sufficient volume"], length: 550 },
  ],
};

/** Official excerpt is context for AI; the locked package still controls calculations. */
export async function gvOfficialExcerpt(code: GvRuleCode): Promise<string | null> {
  const excerpts = locations[code].flatMap((location) => {
    const text = (sourcePages as Record<string, string>)[String(location.page)] ?? "";
    const lower = text.toLowerCase();
    const at = location.needles.map((needle) => lower.indexOf(needle.toLowerCase())).find((index) => index >= 0);
    if (at === undefined) return [];
    const start = Math.max(0, at - 110);
    return [`gv-source.pdf 第 ${location.page} 页：${text.slice(start, start + location.length)}`];
  });
  return excerpts.length ? excerpts.join("\n") : null;
}
