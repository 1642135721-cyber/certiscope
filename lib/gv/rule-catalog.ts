export const gvRules = [
  { code: "R01", title: "停车分母、申报资格与路径组合", summary: "核对项目可用路外停车位范围、申报分母与 A／B、C／D 路径选择。", evidence: "申报表单、停车统计、图纸和共享分配说明" },
  { code: "R02", title: "绿色车辆资格", summary: "核对车辆资格定义及其适用来源；官方与已确认内部口径的差异须由专业人员处理。", evidence: "停车政策、资格定义、车型与评级依据" },
  { code: "R03", title: "优先停车", summary: "路径 A：优先车位至少为总车位的 5%，向上取整；另核对位置、标识和专用管理。", evidence: "优先位清单、车位图、入口位置、标识和管理政策" },
  { code: "R04", title: "停车折扣", summary: "路径 B：折扣至少 20%，且公开、长期适用于全部合格绿色车辆。", evidence: "普通及优惠费率、入口公示和长期政策" },
  { code: "R05", title: "EVSE 车位数量与独立性", summary: "路径 C：充电车位至少为总车位的 2%，向上取整；A＋C 时不得与优先位重叠。", evidence: "EVSE 位号、设备车位关系、图纸、标识和申报值" },
  { code: "R06", title: "EVSE 设备技术条件", summary: "路径 C：核对 Level 2 或更高、连接器、联网、DR／TOU 能力及本项目实际采用配置。", evidence: "设备规格、选型表、电气配置、联网及需求响应资料" },
  { code: "R07", title: "替代设施日服务能力", summary: "路径 D：每日可服务车辆数至少为总车位的 2%，向上取整；核对设施和空间安全条件。", evidence: "设施类型、厂家能力、运营配置、容量计算和位置图" },
] as const;

export type GvRuleCode = (typeof gvRules)[number]["code"];

export function ruleApplies(code: GvRuleCode, incentive: string | null, facility: string | null) {
  if (code === "R03") return incentive === "A";
  if (code === "R04") return incentive === "B";
  if (code === "R05" || code === "R06") return facility === "C";
  if (code === "R07") return facility === "D";
  return true;
}
