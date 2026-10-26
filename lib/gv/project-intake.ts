import "server-only";
import type { LocatedContent } from "@/lib/ai/provider";
import { aiProvider } from "@/lib/ai/qwen";
import { parseDocument } from "@/lib/documents/parse";
import { imageVisionContent } from "@/lib/documents/parse-image";
import type { ParsedFragment } from "@/lib/documents/types";
import type { SourceLocation } from "@/lib/gv/types";

export const intakeFields = [
  "name",
  "project_type",
  "location",
  "area",
  "target_level",
] as const;
export type IntakeField = (typeof intakeFields)[number];
export const scopeFields = [
  "system",
  "system_version",
  "stage",
  "credit_scope",
  "incentive_path",
  "facility_path",
] as const;
export type ScopeField = (typeof scopeFields)[number];
export type CandidateField = IntakeField | ScopeField;

export interface IntakeCandidate {
  field: CandidateField;
  value: string;
  source: SourceLocation;
  confidence?: number;
}

export interface IntakeExtraction {
  candidates: IntakeCandidate[];
  fragments: ParsedFragment[];
  parseStatus: "extracted" | "needs_review" | "failed";
  message: string;
}

export function isRuleReferenceDocument(fileName: string): boolean {
  return /官方.*(?:审核标准|规则)|(?:leed|green vehicles).*(?:rating system|reference guide|credit language)|规则包|审核规则/i.test(
    fileName,
  );
}

export function isProjectApplicationDocument(fileName: string): boolean {
  return /(?:leed[\s_-]*online|application|registration|project[\s_-]*(?:information|data|form)|申报表|建档表|项目基本信息|项目资料表|(?:green[\s_-]*vehicles|garage)[\s_-]*narrative|site[\s_-]*plan|floor[\s_-]*plan|项目说明|项目总平面|总平面图)/i.test(
    fileName,
  );
}

export function explicitScopeCandidates(
  fragments: ParsedFragment[],
  sourceKind: "intake" | "material" = "intake",
): IntakeCandidate[] {
  const found: IntakeCandidate[] = [];
  for (const fragment of fragments) {
    const text = fragment.text;
    if (!text) continue;
    const emit = (field: ScopeField, value: string) => {
      if (
        found.some(
          (item) =>
            item.field === field &&
            item.value === value &&
            item.source.page === fragment.source.page &&
            item.source.materialVersionId === fragment.source.materialVersionId,
        )
      )
        return;
      found.push({
        field,
        value,
        source: {
          ...fragment.source,
          note:
            sourceKind === "intake"
              ? "申报表单显式文字候选；仍待审核员对照原件确认"
              : "本轮材料显式文字候选；仍待审核员对照原件确认",
        },
        confidence: 0.9,
      });
    };
    const leed = text.match(
      /LEED\s*(v4(?:\.1)?)\s*BD\s*\+\s*C\s*(?:NC|New Construction)/i,
    );
    if (leed) {
      emit("system", "LEED");
      emit("system_version", `${leed[1].toLowerCase()} BD+C NC`);
    }
    if (/\bLT\s*[:·/-]?\s*Green Vehicles\b/i.test(text))
      emit("credit_scope", "LT · Green Vehicles");
    if (/设计(?:阶段|审核)|\bdesign review\b/i.test(text))
      emit("stage", "设计审核");
    const pair = text.match(
      /(?:申报路径|selected\s+path|pursued\s+options?)\s*[:：]?\s*([AB])\s*[+＋/,&和及]\s*([CD])\b/i,
    );
    if (pair) {
      emit("incentive_path", pair[1].toUpperCase());
      emit("facility_path", pair[2].toUpperCase());
    }
    if (
      /preferred parking spaces?/i.test(text) &&
      /(?:preferred parking spaces? determined is\s*5\s*%|preferred parking spaces? for GV in garage|preferred parking spaces? (?:are|is) located)/i.test(
        text,
      )
    )
      emit("incentive_path", "A");
    if (
      /\bOption\s*1\s+has been selected\b/i.test(text) &&
      /\bEVSE\b/i.test(text)
    )
      emit("facility_path", "C");
    if (
      /\bOption\s*2\s+has been selected\b/i.test(text) &&
      /alternative fuel|battery switching/i.test(text)
    )
      emit("facility_path", "D");
  }
  return found;
}

export async function extractProjectIntake(
  fileName: string,
  bytes: Uint8Array,
  materialVersionId: string,
): Promise<IntakeExtraction> {
  const parsed = await parseDocument(fileName, bytes, materialVersionId);
  if (isRuleReferenceDocument(fileName)) {
    return {
      candidates: [],
      fragments: parsed.fragments,
      parseStatus: parsed.status,
      message: "规则参考文件已保存供核对，不从中推断项目申报体系、版本或路径。",
    };
  }
  const directCandidates = explicitScopeCandidates(parsed.fragments);
  // Project-authored narratives and plans may carry explicit project identity
  // facts. Product datasheets and rule references must not fill these fields.
  const isProjectRecord = isProjectApplicationDocument(fileName);
  const textParts: LocatedContent[] = parsed.fragments
    .filter((fragment) => fragment.text)
    .slice(0, 100)
    .map((fragment) => ({
      text: fragment.text.slice(0, 5000),
      source: fragment.source,
    }));
  const extension = parsed.extension;
  const contentParts =
    extension === "jpg" || extension === "jpeg" || extension === "png"
      ? [imageVisionContent(bytes, extension, materialVersionId)]
      : textParts;
  if (parsed.status === "failed" || contentParts.length === 0) {
    return {
      candidates: directCandidates,
      fragments: parsed.fragments,
      parseStatus: parsed.status,
      message:
        parsed.manualReason ??
        "未识别出可用内容，请由管理员对照原件填写五项资料。",
    };
  }
  const ai = await aiProvider.extractCandidates({
    taskId: "intake",
    roundId: "intake",
    materialVersions: [materialVersionId],
    contentParts,
    requestedFields: isProjectRecord
      ? [...intakeFields, ...scopeFields]
      : [...scopeFields],
  });
  if (!ai.ok) {
    return {
      candidates: directCandidates,
      fragments: parsed.fragments,
      parseStatus: parsed.status,
      message: directCandidates.length
        ? "已从表单显式文字提取部分范围候选；AI 识别暂不可用，其余字段请对照原件核查。"
        : `${parsed.manualReason ?? "原件已保存。"} AI 识别暂不可用，请对照原件手工填写。`,
    };
  }
  const candidates = ai.value
    .filter(
      (item) =>
        (isProjectRecord
          ? [...intakeFields, ...scopeFields]
          : [...scopeFields]
        ).includes(item.key as CandidateField) &&
        item.source.materialVersionId === materialVersionId &&
        String(item.value).trim().length > 0,
    )
    .map(
      (item): IntakeCandidate => ({
        field: item.key as CandidateField,
        value:
          item.key === "area" && item.unit
            ? `${String(item.value).trim()} ${item.unit}`
            : String(item.value).trim(),
        source: item.source,
        confidence: item.confidence,
      }),
    );
  for (const candidate of directCandidates) {
    if (
      !candidates.some(
        (item) =>
          item.field === candidate.field && item.value === candidate.value,
      )
    )
      candidates.push(candidate);
  }
  return {
    candidates,
    fragments: parsed.fragments,
    parseStatus: parsed.status,
    message:
      parsed.manualReason ?? "候选字段已识别；请管理员逐项对照原件核对。",
  };
}
