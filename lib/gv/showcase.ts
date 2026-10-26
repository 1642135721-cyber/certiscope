// 展示数据取自宇阳离线原型，仅用于页面结构演示，不代表系统已执行审核。
export type ShowcaseProject = {
  id: string;
  name: string;
  location: string;
  phase: string;
  status: string;
  event: string;
  time: string;
  owner: string;
  consultant: string;
  designer: string;
  grossArea: string;
  buildingUse: string;
};

export type ShowcaseTask = {
  id: string;
  projectId: string;
  category: "LT" | "SS" | "WE" | "EA" | "MR" | "EQ";
  credit: string;
  round: string;
  status: string;
  focus: string;
  sourceName: string;
  sourceVersion: string;
  sourcePage: string;
  sourceExcerpt: string;
};

export const showcaseProjects: ShowcaseProject[] = [
  {
    id: "eag",
    name: "EAG 总部项目",
    location: "南京",
    phase: "首轮预审 · 审核员复核",
    status: "待人工复核",
    event: "优先车位数量冲突，等待确认",
    time: "09:20",
    owner: "EAG 集团",
    consultant: "绿衡可持续建筑咨询",
    designer: "南京筑境建筑设计院",
    grossArea: "37,900 m²",
    buildingUse: "商业办公",
  },
  {
    id: "river",
    name: "江滨科技园",
    location: "苏州",
    phase: "补件核对",
    status: "补件已到",
    event: "顾问方提交了 3 份补件材料，待核对 2 项补件要求",
    time: "08:45",
    owner: "江滨科技发展有限公司",
    consultant: "青禾绿色建筑咨询",
    designer: "苏州城市建筑设计院",
    grossArea: "28,600 m²",
    buildingUse: "研发办公",
  },
  {
    id: "north",
    name: "北辰商务中心",
    location: "上海",
    phase: "质控反馈",
    status: "质控退回",
    event: "质控方退回了 1 条审核意见",
    time: "16:30",
    owner: "北辰商务置业有限公司",
    consultant: "华境低碳咨询",
    designer: "上海城建建筑设计",
    grossArea: "41,200 m²",
    buildingUse: "商业办公",
  },
  {
    id: "lake",
    name: "湖畔研发大楼",
    location: "杭州",
    phase: "本轮已归档",
    status: "质控通过",
    event: "本轮意见已通过质控",
    time: "11:10",
    owner: "湖畔研发产业发展有限公司",
    consultant: "绿衡可持续建筑咨询",
    designer: "杭州建筑设计研究院",
    grossArea: "32,100 m²",
    buildingUse: "研发办公",
  },
  {
    id: "central",
    name: "新城行政中心",
    location: "合肥",
    phase: "首轮预审 · 待启动",
    status: "首次审核",
    event: "审核范围已确认，2 项信用项待开始",
    time: "10:15",
    owner: "新城公共建设中心",
    consultant: "青禾绿色建筑咨询",
    designer: "合肥城市规划设计院",
    grossArea: "25,400 m²",
    buildingUse: "行政办公",
  },
  {
    id: "bay",
    name: "海湾科创中心",
    location: "深圳",
    phase: "设计阶段 · 技术审核",
    status: "继续审核",
    event: "2 项信用项仍在证据复核中",
    time: "14:40",
    owner: "海湾科创产业有限公司",
    consultant: "南方绿色建筑顾问",
    designer: "深圳前沿建筑设计",
    grossArea: "35,800 m²",
    buildingUse: "科研办公",
  },
  {
    id: "forest",
    name: "绿谷研发园",
    location: "成都",
    phase: "设计阶段 · 首轮预审",
    status: "首次审核",
    event: "项目资料已核对，等待启动预审",
    time: "11:10",
    owner: "绿谷产业发展有限公司",
    consultant: "西部绿色建筑顾问",
    designer: "成都西岭建筑设计",
    grossArea: "26,500 m²",
    buildingUse: "研发办公",
  },
  {
    id: "garden",
    name: "华庭科创楼",
    location: "广州",
    phase: "设计阶段 · 专业复核",
    status: "继续审核",
    event: "低排放材料的证明范围待核对",
    time: "15:20",
    owner: "华庭科技置业有限公司",
    consultant: "南方绿色建筑顾问",
    designer: "广州筑新设计院",
    grossArea: "30,700 m²",
    buildingUse: "科研办公",
  },
];

export const showcaseTasks: ShowcaseTask[] = [
  {
    id: "eag-green",
    projectId: "eag",
    category: "LT",
    credit: "Green Vehicles",
    round: "设计阶段 · 首轮预审",
    status: "待人工复核",
    focus: "申报 37 个与图注 32 个优先车位冲突，充电设施证据待补",
    sourceName: "F01 绿色车辆申报说明.pdf",
    sourceVersion: "v1",
    sourcePage: "第 1—2 页",
    sourceExcerpt:
      "F01 第 1 页申报 37 个优先车位，第 2 页图注为 32 个；须按同版图纸与数量表核对。",
  },
  {
    id: "river-bike",
    projectId: "river",
    category: "LT",
    credit: "Bicycle Facilities",
    round: "设计阶段 · 补件轮次",
    status: "补件已到",
    focus: "核对新版自行车停放平面图是否回应上轮意见",
    sourceName: "自行车停放平面图.pdf",
    sourceVersion: "v2",
    sourcePage: "第 1 页",
    sourceExcerpt: "顾问方提交了新版自行车停放位置与出入口关系图。",
  },
  {
    id: "river-heat",
    projectId: "river",
    category: "SS",
    credit: "Heat Island Reduction",
    round: "设计阶段 · 补件轮次",
    status: "补件已到",
    focus: "核对屋面材料的新提交说明",
    sourceName: "屋面材料说明.pdf",
    sourceVersion: "v2",
    sourcePage: "第 3 页",
    sourceExcerpt: "补件新增屋面材料选型与覆盖范围说明。",
  },
  {
    id: "north-parking",
    projectId: "north",
    category: "LT",
    credit: "Reduced Parking Footprint",
    round: "设计阶段 · 质控退回",
    status: "质控退回",
    focus: "补充停车数量的证据定位与判断依据",
    sourceName: "停车统计说明.pdf",
    sourceVersion: "v1",
    sourcePage: "第 2 页",
    sourceExcerpt: "申报文件给出停车位统计，质控方要求补充来源定位。",
  },
  {
    id: "north-emitting",
    projectId: "north",
    category: "EQ",
    credit: "Low-Emitting Materials",
    round: "设计阶段 · 质控退回",
    status: "质控退回",
    focus: "修订材料证明与空间范围的对应说明",
    sourceName: "低排放材料汇总表.xlsx",
    sourceVersion: "v1",
    sourcePage: "表 1",
    sourceExcerpt: "材料汇总表列出产品与使用区域，待补充证明文件对应关系。",
  },
  {
    id: "lake-heat",
    projectId: "lake",
    category: "SS",
    credit: "Heat Island Reduction",
    round: "设计阶段 · 首轮预审",
    status: "质控通过",
    focus: "本轮信用项意见已完成质控",
    sourceName: "场地与屋面设计说明.pdf",
    sourceVersion: "v1",
    sourcePage: "第 4 页",
    sourceExcerpt: "材料内容与适用范围仍需对照原件核对。",
  },
  {
    id: "lake-water",
    projectId: "lake",
    category: "WE",
    credit: "Outdoor Water Use Reduction",
    round: "设计阶段 · 首轮预审",
    status: "质控通过",
    focus: "本轮节水相关意见已完成质控",
    sourceName: "景观灌溉说明.pdf",
    sourceVersion: "v1",
    sourcePage: "第 2 页",
    sourceExcerpt: "材料内容与适用范围仍需对照原件核对。",
  },
  {
    id: "central-water",
    projectId: "central",
    category: "WE",
    credit: "Indoor Water Use Reduction",
    round: "设计阶段 · 首轮预审",
    status: "首次审核",
    focus: "首次核对室内用水设备清单及计算依据",
    sourceName: "室内用水设备清单.xlsx",
    sourceVersion: "v1",
    sourcePage: "设备表",
    sourceExcerpt: "顾问方提交了卫生器具型号、数量与计算汇总。",
  },
  {
    id: "central-daylight",
    projectId: "central",
    category: "EQ",
    credit: "Daylight",
    round: "设计阶段 · 首轮预审",
    status: "首次审核",
    focus: "首次核对采光分析报告与空间范围",
    sourceName: "采光分析报告.pdf",
    sourceVersion: "v1",
    sourcePage: "第 6 页",
    sourceExcerpt: "报告给出采光分析范围与主要输入条件。",
  },
  {
    id: "bay-energy",
    projectId: "bay",
    category: "EA",
    credit: "Optimize Energy Performance",
    round: "设计阶段 · 首轮预审",
    status: "继续审核",
    focus: "继续复核能耗模拟输入与模型版本",
    sourceName: "能耗模拟报告.pdf",
    sourceVersion: "v2",
    sourcePage: "第 12 页",
    sourceExcerpt: "模型版本更新，围护结构输入与设备参数待核对。",
  },
  {
    id: "bay-lca",
    projectId: "bay",
    category: "MR",
    credit: "Building Life-Cycle Impact Reduction",
    round: "设计阶段 · 首轮预审",
    status: "继续审核",
    focus: "继续核对生命周期评价报告的范围与比较基准",
    sourceName: "生命周期评价报告.pdf",
    sourceVersion: "v1",
    sourcePage: "第 8 页",
    sourceExcerpt: "报告列出评价范围与比较方案，待审核员确认口径。",
  },
  {
    id: "forest-water",
    projectId: "forest",
    category: "WE",
    credit: "Outdoor Water Use Reduction",
    round: "设计阶段 · 首轮预审",
    status: "首次审核",
    focus: "首次核对景观用水与灌溉计算",
    sourceName: "景观灌溉计算书.pdf",
    sourceVersion: "v1",
    sourcePage: "第 4 页",
    sourceExcerpt: "顾问方提交景观灌溉用水计算和植物配置说明。",
  },
  {
    id: "garden-materials",
    projectId: "garden",
    category: "EQ",
    credit: "Low-Emitting Materials",
    round: "设计阶段 · 首轮预审",
    status: "继续审核",
    focus: "核对产品证明与使用区域的对应关系",
    sourceName: "低排放材料证明汇总.pdf",
    sourceVersion: "v2",
    sourcePage: "第 3 页",
    sourceExcerpt: "新版汇总列出涂料、胶粘剂及地面材料的使用区域。",
  },
];

export const showcaseCategories = [
  { code: "LT", name: "交通与场地" },
  { code: "SS", name: "可持续场地" },
  { code: "WE", name: "水资源效率" },
  { code: "EA", name: "能源与大气" },
  { code: "MR", name: "材料与资源" },
  { code: "EQ", name: "室内环境质量" },
] as const;

export function showcaseProject(id: string) {
  return showcaseProjects.find((item) => item.id === id);
}
export function showcaseTask(id: string) {
  return showcaseTasks.find((item) => item.id === id);
}
// 原型项目按六个展示阶段映射进度；仅供样例浏览，不参与真实任务进度计算。
export function showcaseProgress(project: ShowcaseProject) {
  if (project.status === "质控通过") return 100;
  if (project.status === "质控退回") return 83;
  if (
    project.status === "补件已到" ||
    project.status === "继续审核" ||
    project.status === "待人工复核"
  )
    return 67;
  return 33;
}
export function showcaseRuleCode(id: string) {
  const codes: Record<string, string> = {
    "eag-green": "LT-GV-R03",
    "river-bike": "LT-BF-01",
    "river-heat": "SS-HI-01",
    "north-parking": "LT-RPF-01",
    "north-emitting": "EQ-LEM-01",
    "lake-heat": "SS-HI-01",
    "lake-water": "WE-OWUR-01",
    "central-water": "WE-IWUR-01",
    "central-daylight": "EQ-DL-01",
    "bay-energy": "EA-OEP-01",
    "bay-lca": "MR-LCA-01",
    "forest-water": "WE-OWUR-01",
    "garden-materials": "EQ-LEM-01",
  };
  return codes[id] ?? "";
}
