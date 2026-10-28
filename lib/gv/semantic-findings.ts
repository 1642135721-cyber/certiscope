import type { GvComputedResult } from "@/lib/gv/rule-engine";
import type { SupportFinding } from "@/lib/gv/support-reconciliation";
import type { SemanticSupport } from "@/lib/gv/types";

type Finding = SupportFinding;

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
  result?: GvComputedResult,
): { supported: Finding[]; unverified: Finding[] } {
  if (ruleCode === "R05") {
    const inputs = result?.inputs;
    const declared = inputs?.evse_spaces;
    const minimum = inputs?.minimum_evse_spaces;
    const total = inputs?.total_parking_spaces;
    const hasQuantitySource = Boolean(result?.sources?.length);
    const quantityConsistent =
      result?.outcome !== "EVIDENCE_CONFLICT" &&
      !result?.issues?.some((issue) =>
        /(?:EVSE|充电).*(?:冲突|不一致|有差异)/i.test(issue),
      );
    const quantitySupported =
      hasQuantitySource &&
      quantityConsistent &&
      typeof declared === "number" &&
      typeof minimum === "number" &&
      typeof total === "number" &&
      declared >= minimum;
    if (!quantitySupported) return { supported, unverified };

    const quantityText = `数量暂达到要求：申报材料写明设置 ${declared} 个充电车位，按申报总车位 ${total} 个的 2% 计算最低需 ${minimum} 个。`;
    let foundQuantity = false;
    const supportedFacts = supported.map((finding) => {
      if (
        /充电车位|充电专用车位|EVSE/i.test(finding.text) &&
        /数量|至少|最低|下限|计算得出|设置了\s*\d+/.test(finding.text)
      ) {
        foundQuantity = true;
        const statesDeclaredQuantity =
          /(?:申报|项目|图纸).{0,30}(?:设置|布置|提供|安排).{0,12}\d+\s*个(?:充电车位|充电专用车位)/.test(
            finding.text,
          );
        return statesDeclaredQuantity
          ? finding
          : { ...finding, text: quantityText };
      }
      return finding;
    });
    if (!foundQuantity)
      supportedFacts.unshift({
        text: quantityText,
        citations: result?.sources ?? [],
      });

    const pending = unverified.map((finding) => {
      if (
        /(?:实际提供|实际设置|实际安装).{0,12}充电车位.{0,12}(?:数量|是否达到)|充电车位数量是否达到/.test(
          finding.text,
        )
      )
        return {
          ...finding,
          text: `请在最终车位图核对申报的 ${declared} 个充电车位对应的位号与位置。`,
          citations: finding.citations.length
            ? finding.citations
            : (result?.sources ?? []),
        };
      if (/是否已安装\s*EVSE\s*设备/i.test(finding.text))
        return {
          ...finding,
          text: "请核对本项目采用的 EVSE 设备及其与申报充电车位的对应关系，并确认这些车位不与优先车位重叠。",
        };
      return finding;
    });
    return { supported: supportedFacts, unverified: pending };
  }
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
