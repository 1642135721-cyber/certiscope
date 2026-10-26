import type { GvComputedResult } from "@/lib/gv/rule-engine";
import type { SemanticSupport, SourceLocation } from "@/lib/gv/types";

type Finding = { text: string; citations: SourceLocation[] };

export function hasMaterialConflict(result?: GvComputedResult): boolean {
  return Boolean(
    result &&
      (result.outcome === "EVIDENCE_CONFLICT" ||
        (result.ruleId === "R03" &&
          result.issues.some((issue) => /优先车位分项数量不一致/.test(issue)))),
  );
}

/** Keep brochure facts while moving inferred project capabilities to human review. */
export function refineSemanticFindings(
  ruleCode: string,
  supported: Finding[],
  unverified: Finding[],
): { supported: Finding[]; unverified: Finding[] } {
  if (ruleCode !== "R06") return { supported, unverified };
  const inferredSchedule = supported.filter(
    (finding) =>
      /(?:scheduled charge|定时充电)/i.test(finding.text) &&
      /(?:需求响应|分时电价|\bDR\b|\bTOU\b)/i.test(finding.text),
  );
  const supportedFacts = supported.filter(
    (finding) => !inferredSchedule.includes(finding),
  );
  const pending = inferredSchedule.map((finding) => ({
    text: "手册列有定时充电模式，但不能据此确认本项目已具备或启用需求响应／分时电价；请核对项目配置。",
    citations: finding.citations,
  }));
  return { supported: supportedFacts, unverified: [...unverified, ...pending] };
}

/** A cited subcondition can be supported even while the whole rule needs review. */
export function calibrateCandidateSupport(
  result: GvComputedResult,
  proposed: SemanticSupport,
  supported: Finding[],
  unverified: Finding[],
): SemanticSupport {
  if (proposed === "conflicts" || hasMaterialConflict(result))
    return "conflicts";
  if (result.outcome === "FAIL") return "conflicts";
  if (
    proposed === "supports" &&
    (unverified.length > 0 || result.outcome === "EVIDENCE_CONFLICT")
  )
    return "partial";
  if (proposed === "supports" || proposed === "partial") return proposed;
  const citedFinding = supported.some(
    (finding) =>
      finding.citations.length > 0 &&
      (result.ruleId !== "R02" ||
        /资格|ACEEE|评分|车型|插电|equivalent|vehicle rating/i.test(
          finding.text,
        )),
  );
  const total = result.inputs.total_parking_spaces;
  const threshold =
    result.ruleId === "R03"
      ? [result.inputs.preferred_spaces, result.inputs.minimum_preferred_spaces]
      : result.ruleId === "R05"
        ? [result.inputs.evse_spaces, result.inputs.minimum_evse_spaces]
        : null;
  const citedQuantity =
    result.sources.length > 0 &&
    (result.ruleId === "R01"
      ? typeof total === "number" && total > 0
      : threshold !== null &&
        typeof threshold[0] === "number" &&
        typeof threshold[1] === "number" &&
        threshold[0] >= threshold[1]);
  return citedFinding || citedQuantity ? "partial" : proposed;
}
