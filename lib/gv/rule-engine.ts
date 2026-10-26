import type { BasisRetrievalReceipt } from "./basis-retrieval";
import type { GvConditionCoverage } from "./condition-catalog";
import { type GvRuleCode, gvRules, ruleApplies } from "./rule-catalog";
import type { ReviewOutcome, SemanticSupport, SourceLocation } from "./types";

export const numericFields = [
  "total_parking_spaces",
  "preferred_spaces",
  "evse_spaces",
  "normal_rate",
  "green_rate",
  "daily_service_capacity",
] as const;
export type NumericField = (typeof numericFields)[number];
export const fieldLabels: Record<NumericField, string> = {
  total_parking_spaces: "项目使用的路外停车位总数",
  preferred_spaces: "绿色车辆优先车位数",
  evse_spaces: "EVSE 专用充电车位数",
  normal_rate: "普通停车费率",
  green_rate: "绿色车辆停车费率",
  daily_service_capacity: "替代设施每日可服务车辆数",
};
export const fieldUnits: Record<NumericField, string> = {
  total_parking_spaces: "车位",
  preferred_spaces: "车位",
  evse_spaces: "车位",
  normal_rate: "同周期费率",
  green_rate: "同周期费率",
  daily_service_capacity: "辆/日",
};

export type NumericCandidate = {
  id: string;
  field_key: string;
  candidate_value: unknown;
  unit: string | null;
  source_location: SourceLocation | null;
  material_version_id: string | null;
};
export type NumericConfirmation = {
  field_key: string;
  value: number;
  unit: string;
  source_location: SourceLocation;
  created_at: string;
};
export type FieldReading = {
  key: NumericField;
  label: string;
  unit: string;
  value: number | null;
  confirmed: boolean;
  conflict: boolean;
  candidates: { id: string; value: number; source: SourceLocation | null }[];
  sources: SourceLocation[];
};
export type GvComputedResult = {
  ruleId: GvRuleCode;
  outcome: ReviewOutcome;
  explanation: string;
  formula: string | null;
  inputs: Record<string, number | null>;
  sources: SourceLocation[];
  issues: string[];
  semanticSupport?: SemanticSupport;
  citations?: SourceLocation[];
  retrievedSources?: SourceLocation[];
  humanQuestions?: string[];
  supportedFindings?: { text: string; citations: SourceLocation[] }[];
  unverifiedFindings?: { text: string; citations: SourceLocation[] }[];
  basisRetrieval?: BasisRetrievalReceipt;
  conditionCoverage?: GvConditionCoverage[];
  visualEvidenceUsed?: boolean;
  quantityThresholdMetDespiteConflict?: boolean;
};

export function parseCandidateNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  const plain = /^\d+(?:\.\d+)?$/.test(text);
  const grouped = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text);
  if (!plain && !grouped) return null;
  const numeric = Number(text.replaceAll(",", ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function readNumericFacts(
  candidates: NumericCandidate[],
  confirmations: NumericConfirmation[],
): Record<NumericField, FieldReading> {
  return Object.fromEntries(
    numericFields.map((key) => {
      const choices = candidates
        .filter((item) => item.field_key === key)
        .map((item) => ({
          id: item.id,
          value: parseCandidateNumber(item.candidate_value),
          source: item.source_location,
        }))
        .filter(
          (
            item,
          ): item is {
            id: string;
            value: number;
            source: SourceLocation | null;
          } => item.value !== null,
        );
      const selected = confirmations.find((item) => item.field_key === key);
      const values = [...new Set(choices.map((item) => item.value))];
      const value = selected?.value ?? (values.length === 1 ? values[0] : null);
      const sources = selected
        ? [selected.source_location]
        : choices
            .filter((item) => item.value === value && item.source)
            .map((item) => item.source)
            .filter((source): source is NonNullable<typeof source> =>
              Boolean(source),
            );
      return [
        key,
        {
          key,
          label: fieldLabels[key],
          unit: fieldUnits[key],
          value: value ?? null,
          confirmed: Boolean(selected),
          conflict: values.length > 1 && !selected,
          candidates: choices,
          sources,
        },
      ];
    }),
  ) as Record<NumericField, FieldReading>;
}

export function evaluateGvRules(
  incentivePath: string | null,
  facilityPath: string | null,
  facts: Record<NumericField, FieldReading>,
): GvComputedResult[] {
  const total = facts.total_parking_spaces;
  return gvRules
    .filter((rule) => ruleApplies(rule.code, incentivePath, facilityPath))
    .map((rule): GvComputedResult => {
      const issues: string[] = [];
      const needsTotalParking = ["R01", "R03", "R05", "R07"].includes(
        rule.code,
      );
      const inputs: Record<string, number | null> = needsTotalParking
        ? { total_parking_spaces: total.value }
        : {};
      const sources = needsTotalParking ? [...total.sources] : [];
      let outcome: ReviewOutcome = "HUMAN_REVIEW_REQUIRED";
      let formula: string | null = null;
      let explanation: string = rule.summary;
      const needs = (field: FieldReading) => {
        inputs[field.key] = field.value;
        sources.push(...field.sources);
        if (field.conflict)
          issues.push(`${field.label}存在不同候选，须核对原件并确认。`);
        else if (field.value === null)
          issues.push(`${field.label}缺少可用数值及来源。`);
        else if (!field.confirmed)
          issues.push(`${field.label}为系统候选，须审核员确认。`);
      };
      if (needsTotalParking) {
        if (total.conflict)
          issues.push("总停车位存在冲突候选，须核对申报值和统计范围。");
        else if (total.value === null)
          issues.push("缺少项目使用的路外停车位总数。");
        else if (total.value === 0)
          issues.push("总停车位为零，不能以零下限认定符合。");
        else if (!total.confirmed)
          issues.push("总停车位尚未经审核员核对确认。");
      }

      if (rule.code === "R01")
        issues.push(
          "核对申报总车位的统计范围及相关图纸；仅在材料显示共享或排除车位时追问其分配依据。",
        );
      if (rule.code === "R02")
        issues.push(
          "车辆资格须区分官方 ACEEE／当地等效与已确认内部口径，由审核员处理来源差异。",
        );
      if (rule.code === "R03") {
        const preferred = facts.preferred_spaces;
        needs(preferred);
        if (total.value !== null && total.value > 0) {
          const minimum = Math.ceil(total.value * 0.05);
          inputs.minimum_preferred_spaces = minimum;
          formula = `ceil(${total.value} × 5%) = ${minimum} 车位`;
          if (preferred.value !== null)
            explanation = `优先车位候选 ${preferred.value}，数量下限 ${minimum}。数量判断不能替代位置、标识、专用性及管理证据。`;
          if (
            total.confirmed &&
            preferred.confirmed &&
            preferred.value !== null &&
            preferred.value < minimum
          )
            outcome = "FAIL";
        }
        issues.push("还须核对入口位置、位号、永久标识、专用管理及车辆资格。");
      }
      if (rule.code === "R04") {
        const normal = facts.normal_rate;
        const green = facts.green_rate;
        needs(normal);
        needs(green);
        if (normal.value === 0)
          issues.push("普通费率为零，不能用 0／0 判定折扣。");
        if (normal.value !== null && normal.value > 0 && green.value !== null) {
          const rate = (normal.value - green.value) / normal.value;
          inputs.discount_percent = Math.round(rate * 10000) / 100;
          formula = `(${normal.value} − ${green.value}) ÷ ${normal.value} = ${(rate * 100).toFixed(1)}%`;
          if (normal.confirmed && green.confirmed && rate < 0.2)
            outcome = "FAIL";
        }
        issues.push(
          "费率还须核对币种、周期、入口公示、长期性及全部合格车辆的适用范围。",
        );
      }
      if (rule.code === "R05") {
        const evse = facts.evse_spaces;
        needs(evse);
        if (total.value !== null && total.value > 0) {
          const minimum = Math.ceil(total.value * 0.02);
          inputs.minimum_evse_spaces = minimum;
          formula = `ceil(${total.value} × 2%) = ${minimum} 车位`;
          if (evse.value !== null)
            explanation = `EVSE 专用车位候选 ${evse.value}，数量下限 ${minimum}。设备台数、枪头数不能直接代替车位数。`;
          if (
            total.confirmed &&
            evse.confirmed &&
            evse.value !== null &&
            evse.value < minimum
          )
            outcome = "FAIL";
        }
        issues.push(
          "还须核对车位图、位号、专用标识，以及 A＋C 时与优先车位不重叠。",
        );
      }
      if (rule.code === "R06")
        issues.push(
          "核对项目采用型号、Level 2／连接器、联网与 DR／TOU 能力；手册能力不等于项目采用。",
        );
      if (rule.code === "R07") {
        const capacity = facts.daily_service_capacity;
        needs(capacity);
        if (total.value !== null && total.value > 0) {
          const minimum = Math.ceil(total.value * 0.02);
          inputs.minimum_daily_capacity = minimum;
          formula = `ceil(${total.value} × 2%) = ${minimum} 辆/日`;
          if (
            total.confirmed &&
            capacity.confirmed &&
            capacity.value !== null &&
            capacity.value < minimum
          )
            outcome = "FAIL";
        }
        issues.push("还须核对设施类型、运行时长与瓶颈、位置及室内排风条件。");
      }
      if (outcome !== "FAIL") {
        if (issues.some((item) => item.includes("冲突")))
          outcome = "EVIDENCE_CONFLICT";
        else if (issues.some((item) => item.includes("缺少")))
          outcome = "INSUFFICIENT_EVIDENCE";
      }
      return {
        ruleId: rule.code,
        outcome,
        explanation,
        formula,
        inputs,
        sources,
        issues,
      };
    });
}
