import type { FactCandidate, SourceLocation } from "./types";

// The PRD's field paths are kept beside the existing short numeric keys so
// stored candidates and earlier review rounds remain readable.
export const gvEvidenceFields = [
  {
    key: "parking.scope_confirmed",
    label: "停车统计范围说明",
    rules: "R01",
    kind: "text",
  },
  {
    key: "green_vehicle.standard",
    label: "绿色车辆资格标准",
    rules: "R02,R03,R04",
    kind: "text",
  },
  {
    key: "green_vehicle.minimum_score",
    label: "车辆评分门槛",
    rules: "R02",
    kind: "number",
  },
  {
    key: "green_vehicle.model",
    label: "申报车辆型号",
    rules: "R02",
    kind: "text",
  },
  {
    key: "green_vehicle.year",
    label: "申报车辆年份",
    rules: "R02",
    kind: "integer",
  },
  {
    key: "green_vehicle.alternate_qualification",
    label: "当地等效资格依据",
    rules: "R02",
    kind: "text",
  },
  {
    key: "parking.preferred_spaces.breakdown",
    label: "优先车位分区数量",
    rules: "R03",
    kind: "text",
  },
  {
    key: "parking.preferred_stall_ids",
    label: "优先车位编号",
    rules: "R03,R05",
    kind: "text",
  },
  {
    key: "parking.preferred_location",
    label: "优先车位与入口位置关系",
    rules: "R03",
    kind: "text",
  },
  {
    key: "parking.preferred_signage",
    label: "优先车位标识和专用管理",
    rules: "R03",
    kind: "text",
  },
  {
    key: "parking.rate_currency",
    label: "停车费率币种",
    rules: "R04",
    kind: "text",
  },
  {
    key: "parking.rate_period",
    label: "停车费率计价周期",
    rules: "R04",
    kind: "text",
  },
  {
    key: "parking.discount_policy",
    label: "折扣公示和适用政策",
    rules: "R04",
    kind: "text",
  },
  {
    key: "facility.evse.stall_ids",
    label: "EVSE 充电车位编号",
    rules: "R05",
    kind: "text",
  },
  {
    key: "facility.evse.equipment_mapping",
    label: "车位与设备型号对应关系",
    rules: "R05,R06",
    kind: "text",
  },
  {
    key: "facility.evse.signage",
    label: "充电车位标识和专用预留",
    rules: "R05",
    kind: "text",
  },
  {
    key: "facility.evse.level",
    label: "项目采用设备的充电等级",
    rules: "R06",
    kind: "text",
  },
  {
    key: "facility.evse.voltage",
    label: "项目采用设备的电压",
    rules: "R06",
    kind: "number",
  },
  {
    key: "facility.evse.connector_standard",
    label: "连接器标准",
    rules: "R06",
    kind: "text",
  },
  {
    key: "facility.evse.network_capable",
    label: "项目配置的联网能力",
    rules: "R06",
    kind: "boolean",
  },
  {
    key: "facility.evse.ip_addressable",
    label: "项目配置的 IP 可寻址能力",
    rules: "R06",
    kind: "boolean",
  },
  {
    key: "facility.evse.dr_capable",
    label: "项目配置的需求响应能力",
    rules: "R06",
    kind: "boolean",
  },
  {
    key: "facility.evse.tou_capable",
    label: "项目配置的分时电价能力",
    rules: "R06",
    kind: "boolean",
  },
  {
    key: "facility.evse.renewable_exception",
    label: "现场可再生能源直连例外",
    rules: "R06",
    kind: "text",
  },
  {
    key: "facility.alt_fuel.facility_type",
    label: "替代燃料设施类型",
    rules: "R07",
    kind: "text",
  },
  {
    key: "facility.alt_fuel.location",
    label: "替代燃料设施位置",
    rules: "R07",
    kind: "text",
  },
  {
    key: "facility.alt_fuel.exhaust",
    label: "室内液气设施专用排风",
    rules: "R07",
    kind: "text",
  },
] as const;

export const gvEvidenceFieldKeys = gvEvidenceFields.map((field) => field.key);
export type GvEvidenceFieldKey = (typeof gvEvidenceFields)[number]["key"];

export function gvFieldInstruction(requestedFields: string[]): string {
  const fields = gvEvidenceFields.filter((field) =>
    requestedFields.includes(field.key),
  );
  if (!fields.length) return "";
  return ` 其他字段按以下路径提取有原文支持的候选：${fields.map((field) => `${field.key}（${field.label}）`).join("；")}。布尔字段只在项目采用的具体型号/配置被原文明确证实或明确否定时返回 true/false，未知则省略；厂家手册的通用能力不等于项目实际采用。车位编号、分区和设备对应关系保留原文中的编号及对象，不推算缺失项；停车范围描述不等于审核员已确认范围。`;
}

export function validGvEvidenceCandidate(item: FactCandidate): boolean {
  const field = gvEvidenceFields.find((entry) => entry.key === item.key);
  if (
    !field ||
    !item.source ||
    typeof item.source.materialVersionId !== "string"
  )
    return false;
  if (field.kind === "boolean") return typeof item.value === "boolean";
  if (field.kind === "text")
    return (
      typeof item.value === "string" &&
      item.value.trim().length > 1 &&
      item.value.length <= 1200
    );
  const value =
    typeof item.value === "number" ? item.value : Number(item.value);
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    (field.kind !== "integer" || Number.isInteger(value))
  );
}

export type LocatedFieldCandidate = {
  field_key: string;
  candidate_value: string | number | boolean;
  source_location: SourceLocation | null;
};

export function evidenceCandidateSummary(
  candidates: LocatedFieldCandidate[],
  code: string,
): string {
  const keys = new Set<string>(
    gvEvidenceFields
      .filter((field) => field.rules.split(",").includes(code))
      .map((field) => field.key),
  );
  const found = candidates.filter(
    (item) => keys.has(item.field_key) && item.source_location,
  );
  return found
    .slice(0, 16)
    .map((item) => {
      const source = item.source_location;
      if (!source) return "";
      return `${item.field_key}=${String(item.candidate_value).slice(0, 130)}（材料 ${source.materialVersionId}，${source.page ? `第 ${source.page} 页` : (source.sheet ?? "原件定位")}，仅为候选）`;
    })
    .filter(Boolean)
    .join("；");
}
