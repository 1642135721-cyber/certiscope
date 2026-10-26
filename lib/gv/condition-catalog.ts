import type { SourceLocation } from "./types";

// Condition IDs follow the revised PRD 4.3.2 table. These field links are
// retrieval coverage only: a present candidate never means the condition PASS.
export const gvConditionFields = [
  {
    rule: "R01",
    id: "LT-GV-R01-01",
    title: "应纳入车位完整",
    fields: ["total_parking_spaces", "parking.scope_confirmed"],
  },
  {
    rule: "R01",
    id: "LT-GV-R01-02",
    title: "应排除车位未计入",
    fields: ["parking.scope_confirmed"],
  },
  {
    rule: "R01",
    id: "LT-GV-R01-03",
    title: "共享份额有依据且不重复",
    fields: ["parking.scope_confirmed"],
  },
  {
    rule: "R01",
    id: "LT-GV-R01-04",
    title: "正式计算总车位可用",
    fields: ["total_parking_spaces", "parking.scope_confirmed"],
  },
  {
    rule: "R01",
    id: "LT-GV-R01-05",
    title: "同口径总量无未决冲突",
    fields: ["total_parking_spaces"],
  },
  { rule: "R01", id: "LT-GV-R01-06", title: "所选路径组合明确", fields: [] },
  {
    rule: "R02",
    id: "LT-GV-R02-01",
    title: "官方车辆评分资格",
    fields: [
      "green_vehicle.standard",
      "green_vehicle.minimum_score",
      "green_vehicle.model",
      "green_vehicle.year",
    ],
  },
  {
    rule: "R02",
    id: "LT-GV-R02-02",
    title: "当地等效资格及人工认可",
    fields: ["green_vehicle.alternate_qualification"],
  },
  {
    rule: "R02",
    id: "LT-GV-R02-03",
    title: "内部口径不替代官方资格",
    fields: ["green_vehicle.standard"],
  },
  {
    rule: "R03",
    id: "LT-GV-R03-01",
    title: "分区数量与总量一致",
    fields: ["preferred_spaces", "parking.preferred_spaces.breakdown"],
  },
  {
    rule: "R03",
    id: "LT-GV-R03-02",
    title: "优先车位数量达标",
    fields: ["total_parking_spaces", "preferred_spaces"],
  },
  {
    rule: "R03",
    id: "LT-GV-R03-03",
    title: "标识及专用管理成立",
    fields: ["parking.preferred_signage", "green_vehicle.standard"],
  },
  {
    rule: "R03",
    id: "LT-GV-R03-04",
    title: "优先位置符合定义",
    fields: ["parking.preferred_stall_ids", "parking.preferred_location"],
  },
  {
    rule: "R03",
    id: "LT-GV-R03-05",
    title: "适用分区配合合理",
    fields: [
      "parking.preferred_spaces.breakdown",
      "parking.preferred_location",
    ],
  },
  { rule: "R03", id: "LT-GV-R03-06", title: "联合申报解释完成", fields: [] },
  {
    rule: "R04",
    id: "LT-GV-R04-01",
    title: "折扣率与计价口径达标",
    fields: [
      "normal_rate",
      "green_rate",
      "parking.rate_currency",
      "parking.rate_period",
    ],
  },
  {
    rule: "R04",
    id: "LT-GV-R04-02",
    title: "政策已公开告知",
    fields: ["parking.discount_policy"],
  },
  {
    rule: "R04",
    id: "LT-GV-R04-03",
    title: "永久覆盖全部合格车辆",
    fields: ["parking.discount_policy", "green_vehicle.standard"],
  },
  {
    rule: "R05",
    id: "LT-GV-R05-01",
    title: "充电车位数量及设备对应",
    fields: [
      "total_parking_spaces",
      "evse_spaces",
      "facility.evse.equipment_mapping",
    ],
  },
  {
    rule: "R05",
    id: "LT-GV-R05-02",
    title: "充电车位专用预留",
    fields: ["facility.evse.stall_ids", "facility.evse.signage"],
  },
  {
    rule: "R05",
    id: "LT-GV-R05-03",
    title: "与优先停车容量独立",
    fields: ["facility.evse.stall_ids", "parking.preferred_stall_ids"],
  },
  {
    rule: "R05",
    id: "LT-GV-R05-04",
    title: "设计位置与项目选型对应",
    fields: ["facility.evse.stall_ids", "facility.evse.equipment_mapping"],
  },
  {
    rule: "R06",
    id: "LT-GV-R06-01",
    title: "项目型号与规格页绑定",
    fields: ["facility.evse.equipment_mapping"],
  },
  {
    rule: "R06",
    id: "LT-GV-R06-02",
    title: "充电等级符合要求",
    fields: ["facility.evse.level", "facility.evse.voltage"],
  },
  {
    rule: "R06",
    id: "LT-GV-R06-03",
    title: "连接器标准适用",
    fields: ["facility.evse.connector_standard"],
  },
  {
    rule: "R06",
    id: "LT-GV-R06-04",
    title: "网络与 IP 可寻址条件",
    fields: ["facility.evse.network_capable", "facility.evse.ip_addressable"],
  },
  {
    rule: "R06",
    id: "LT-GV-R06-05",
    title: "DR 或 TOU 项目配置",
    fields: ["facility.evse.dr_capable", "facility.evse.tou_capable"],
  },
  {
    rule: "R06",
    id: "LT-GV-R06-06",
    title: "现场可再生能源例外",
    fields: ["facility.evse.renewable_exception"],
  },
  {
    rule: "R07",
    id: "LT-GV-R07-01",
    title: "设施类型符合所选路径",
    fields: ["facility.alt_fuel.facility_type"],
  },
  {
    rule: "R07",
    id: "LT-GV-R07-02",
    title: "每日服务能力达标",
    fields: ["total_parking_spaces", "daily_service_capacity"],
  },
  {
    rule: "R07",
    id: "LT-GV-R07-03",
    title: "室内液气设施专用排风",
    fields: ["facility.alt_fuel.location", "facility.alt_fuel.exhaust"],
  },
] as const;

export type GvConditionCoverage = {
  id: string;
  title: string;
  foundFields: string[];
  missingFields: string[];
  citations: SourceLocation[];
  status: "candidate_present" | "partial" | "no_candidate" | "requires_scope";
};

export function conditionCandidateCoverage(
  rule: string,
  candidates: { field_key: string; source_location: SourceLocation | null }[],
): GvConditionCoverage[] {
  return gvConditionFields
    .filter((item) => item.rule === rule)
    .map((item) => {
      const matches = candidates.filter(
        (candidate) =>
          item.fields.some((field) => field === candidate.field_key) &&
          candidate.source_location,
      );
      const foundFields = [
        ...new Set(matches.map((candidate) => candidate.field_key)),
      ];
      const missingFields = item.fields.filter(
        (field) => !foundFields.includes(field),
      );
      return {
        id: item.id,
        title: item.title,
        foundFields,
        missingFields,
        citations: matches
          .map((candidate) => candidate.source_location)
          .filter((source): source is NonNullable<typeof source> =>
            Boolean(source),
          )
          .slice(0, 5),
        status:
          item.fields.length === 0
            ? "requires_scope"
            : foundFields.length === 0
              ? "no_candidate"
              : missingFields.length === 0
                ? "candidate_present"
                : "partial",
      };
    });
}
