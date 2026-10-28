import type { LocatedContent, R05SignageAssessment } from "@/lib/ai/provider";
import type { SourceLocation } from "@/lib/gv/types";

type Finding = { text: string; citations: SourceLocation[] };

function describesChargingSignage(text: string) {
  return /(?:充电|Charging|EVSE).{0,32}(?:标识|标牌|图标|涂装|marking|sign)/i.test(
    text,
  );
}

export function hasCitedR05Signage(
  findings: Finding[],
  visualParts: LocatedContent[],
): boolean {
  return findings.some(
    (finding) =>
      describesChargingSignage(finding.text) &&
      finding.citations.some((citation) =>
        visualParts.some(
          (part) =>
            part.source.materialVersionId === citation.materialVersionId &&
            Number.isInteger(citation.page) &&
            (part.pdfOriginalPages ?? []).includes(citation.page ?? 0),
        ),
      ),
  );
}

export function verifiedR05SignageFinding(
  assessment: R05SignageAssessment,
  visualParts: LocatedContent[],
): Finding | null {
  if (!assessment.visible || !assessment.finding.trim()) return null;
  if (!describesChargingSignage(assessment.finding)) return null;
  const citations = assessment.citations.flatMap((citation) => {
    if (
      !citation ||
      typeof citation.materialVersionId !== "string" ||
      !Number.isInteger(citation.page)
    )
      return [];
    const part = visualParts.find(
      (item) =>
        item.source.materialVersionId === citation.materialVersionId &&
        (item.pdfOriginalPages ?? []).includes(citation.page ?? 0),
    );
    return part
      ? [
          {
            materialVersionId: citation.materialVersionId,
            page: citation.page,
            note: "千问 PDF 视觉识别候选；请对照原件该页核实",
          },
        ]
      : [];
  });
  if (!citations.length) return null;
  const text = assessment.finding.trim().slice(0, 300);
  return {
    text: /图纸|设计|图例/.test(text) ? text : `图纸显示：${text}`,
    citations: citations.filter(
      (citation, index, all) =>
        all.findIndex(
          (item) =>
            item.materialVersionId === citation.materialVersionId &&
            item.page === citation.page,
        ) === index,
    ),
  };
}

/** Prefer a page-verified drawing description over a duplicate text-only sign claim. */
export function mergeVerifiedR05Signage(
  findings: Finding[],
  verified: Finding,
  visualParts: LocatedContent[],
): Finding[] {
  return [
    ...findings.filter(
      (finding) =>
        !describesChargingSignage(finding.text) ||
        hasCitedR05Signage([finding], visualParts),
    ),
    verified,
  ];
}
