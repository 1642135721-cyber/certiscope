export type ReviewDossier = {
  materialTitle: string;
  materialImage: string;
  materialFileUrl: string;
  materialFacts: { label: string; value: string }[];
  materialNotes: string[];
  ruleSections: { title: string; body: string }[];
  requiredEvidence: string[];
  ruleReference: string;
};

type MaterialContent = Pick<
  ReviewDossier,
  "materialTitle" | "materialImage" | "materialFacts" | "materialNotes"
>;
type RuleContent = Pick<
  ReviewDossier,
  "ruleSections" | "requiredEvidence" | "ruleReference"
>;
const facts = (items: [string, string][]) =>
  items.map(([label, value]) => ({ label, value }));
const sections = (items: [string, string][]) =>
  items.map(([title, body]) => ({ title: `${title} · 核对要点`, body }));

export const materialDossiers: Record<string, MaterialContent> = {
  "eag-parking": {
    materialTitle: "F01 绿色车辆申报说明 · v1 · 第 1—2 页",
    materialImage: "/demo-materials/previews/eag-parking.png",
    materialFacts: facts([
      ["项目 / 建筑面积", "EAG 总部项目 / 37,900 m²"],
      ["机动车停车位", "700 个（申报统计）"],
      ["优先车位", "正文 37 个 / 图注 32 个"],
      ["充电车位", "14 个 / 2.0%"],
      ["数量核对值", "700 × 5% = 35 个"],
      ["文件定位", "正文第 1 页；车位图注第 2 页"],
    ]),
    materialNotes: [
      "F01 第 1 页叙述总车位 700 个、优先车位 37 个；应核实统计口径是否包含全部项目用车位。",
      "F01 第 2 页图注为 32 个，与第 1 页申报的 37 个冲突；完整同版图纸和数量表待补。",
      "14 个充电车位仅有申报数量；F04 完整车库平面图与 F05 场地图仍未提交，位置、独立性及编号需补证。",
    ],
  },
  "eag-signage": {
    materialTitle: "F02 车库标识说明 · v1 · 第 1 页",
    materialImage: "/demo-materials/previews/eag-signage.png",
    materialFacts: facts([
      ["标识类型", "绿色车辆专用 / 充电专用 / 导向"],
      ["优先车位编号", "GV-01—GV-37（申报清单）"],
      ["充电位编号", "EV-01—EV-14"],
      ["标识位置", "车库电梯厅及车位；需核对设计图"],
      ["图纸对应", "完整车库平面图尚未提交"],
      ["待核事项", "37 个清单与 32 个图注差异"],
    ]),
    materialNotes: [
      "F02 说明在车库电梯厅设置停车平面示意，并在车位设置专用标识；需核查标识设计图及实际使用管理。",
      "F01 申报 37 个优先车位，图注只有 32 个；标识说明不能代替完整车位布置图，应逐项建立编号对应。",
      "充电车位与优先车位是否重叠，应由完整平面图与管理说明共同确认。",
    ],
  },
  "eag-equipment": {
    materialTitle: "F03 充电设备资料 · v1 · 第 1—12 页",
    materialImage: "/demo-materials/previews/eag-equipment.png",
    materialFacts: facts([
      ["设备数量", "14 台交流充电设备"],
      ["型号 / 功率", "AC-7K / 7 kW"],
      ["供电范围", "208—240 V AC（样本标注）"],
      ["设备与车位", "EV-01—EV-14 待图纸对应"],
      ["联网能力", "未给出可定位证明"],
      ["DR / TOU", "需求响应与分时充电证明待补"],
    ]),
    materialNotes: [
      "F03 第 2—3 页列出 14 台 AC-7K 交流充电设备和样本参数；应核对其与项目车位编号及安装配置的关系。",
      "设备与 EV-01—EV-14 的对应图纸尚未提供，样本参数不能单独证明项目实际采用配置。",
      "现有资料未给出联网、需求响应或分时充电的可定位证明，需补项目技术说明。",
    ],
  },
  "river-bike": {
    materialTitle: "江滨科技园 · 自行车停放平面图 v2 · 第 1 页",
    materialImage: "/demo-materials/previews/river-bike.png",
    materialFacts: facts([
      ["项目建筑面积", "28,600 m²"],
      ["设施总数", "48 处：A 区 30 / B 区 18"],
      ["主要入口", "E1 东入口 / E2 南入口"],
      ["步行路线", "A—E1 42 m；B—E2 68 m"],
      ["版本变更", "v2 增加分区编号和入口路径"],
      ["补件关联", "SUP-01 位置与数量对应"],
    ]),
    materialNotes: [
      "第 1 页平面：A、B 停放区通过步行路线连到 E1、E2 主入口，图例区分停放设施、入口与路线，须核实距离测量起终点。",
      "配套《设施数量与位置说明》将 A 区 30 处、B 区 18 处对应到图纸编号，总数为 48；短期和长期分类仍需结合使用人群清单确认。",
      "v1 只标区域，v2 补了编号和路径。自行车道路网络、常驻人数及淋浴设施证明应另外核查，不能仅凭平面图完整即判通过。",
    ],
  },
  "river-heat": {
    materialTitle: "江滨科技园 · 屋面材料说明 v2 · 第 3 页",
    materialImage: "/demo-materials/previews/river-heat.png",
    materialFacts: facts([
      ["核对屋面面积", "4,200 m²"],
      ["R1 高反射面层", "2,800 m²"],
      ["R2 种植屋面", "600 m²"],
      ["设备与其他区域", "800 m²"],
      ["材料样本", "RF-01 / RF-02"],
      ["版本变更", "新增分区及覆盖范围表"],
    ]),
    materialNotes: [
      "第 3 页表 R-1 将 4,200 m² 屋面拆为高反射面层、种植屋面和设备区域，三项相加须与屋面总平面边界一致。",
      "RF-01 是高反射材料候选，现附选型说明，但产品的初始及老化性能证明仍应逐页定位，不能用宣传描述代替检测。",
      "补件 v2 增加 R1/R2 分区对应。后续需核对非屋面铺装、屋面坡度及面积排除条件，形成完整热岛计算口径。",
    ],
  },
  "north-parking": {
    materialTitle: "北辰商务中心 · 停车统计说明 v1 · 第 2 页",
    materialImage: "/demo-materials/previews/north-parking.png",
    materialFacts: facts([
      ["项目建筑面积", "41,200 m²"],
      ["申报停车容量", "364 个"],
      ["待核比较基数", "520 个"],
      ["待核减量比例", "30.0%（口径待核）"],
      ["租赁 / 场外车位", "尚未附核对清单"],
      ["质控反馈", "补充统计来源与适用路径"],
    ]),
    materialNotes: [
      "第 2 页统计表列地下 340 个、地面 24 个，总计 364 个；应核对既有、新建、租赁及项目使用的场外非路边车位。",
      "待核基数 520 个来自申报计算表，30% 为待核复算值。适用基准、当地法规及是否属于密度/交通服务地点需证据支持。",
      "质控要求补全表 2 的来源索引和路径说明；本轮复核重点是补足可追溯依据，避免把单一减量比例直接当成结论。",
    ],
  },
  "north-emitting": {
    materialTitle: "北辰商务中心 · 低排放材料汇总表 v1 · 表 1",
    materialImage: "/demo-materials/previews/north-emitting.png",
    materialFacts: facts([
      ["产品数量", "26 项"],
      ["已关联证明", "22 项"],
      ["待补证明对应", "4 项"],
      ["产品分类", "涂料 / 胶粘剂 / 地板"],
      ["使用范围", "办公区、会议区、公共走廊"],
      ["质控焦点", "证明型号与使用区域对应"],
    ]),
    materialNotes: [
      "表 1 将产品编码与采购名称、使用区域关联；26 项中 22 项已有证明索引，剩余 4 项不能自动视为合规。",
      "产品表应分别标识 VOC 含量和释放测试，检测类别、型号及有效期与采购产品一致，不能用一类证明替代另一类要求。",
      "质控要求核对空间范围与产品分类统计口径；数量覆盖率只作清单检查，正式合规比例须按所选分类方法计算。",
    ],
  },
  "lake-heat": {
    materialTitle: "湖畔研发大楼 · 场地与屋面设计说明 v1 · 第 4 页",
    materialImage: "/demo-materials/previews/lake-heat.png",
    materialFacts: facts([
      ["项目建筑面积", "32,100 m²"],
      ["屋面总面积", "3,600 m²"],
      ["高反射屋面", "2,700 m²"],
      ["种植屋面", "450 m²"],
      ["硬质铺装", "2,100 m²"],
      ["记录状态", "本轮已完成质控，留存追溯"],
    ]),
    materialNotes: [
      "第 4 页总表分别统计屋面与非屋面硬质铺装，避免将建筑面积当作热岛计算面积；每个区域均应能返回图纸边界。",
      "屋面使用高反射面层与种植区组合，产品检测索引、植物覆盖范围和图纸编号已列入归档资料。",
      "本页用于追溯已归档轮次的采用版本。修改区域面积或材料后，应建立新轮次并重新核查适用计算，不能覆盖历史记录。",
    ],
  },
  "lake-water": {
    materialTitle: "湖畔研发大楼 · 景观灌溉说明 v1 · 第 2 页",
    materialImage: "/demo-materials/previews/lake-water.png",
    materialFacts: facts([
      ["景观计算面积", "4,800 m²"],
      ["高峰月基线需水", "960 m³"],
      ["设计需水", "510 m³"],
      ["待核减量", "46.9%"],
      ["灌溉系统", "滴灌与分区控制"],
      ["归档索引", "L-02 植物表 / W-02 计算附件"],
    ]),
    materialNotes: [
      "第 2 页以景观计算面积及高峰需水月份建立基线，面积表区分种植区域与不计入的硬质铺装。",
      "设计方案使用耐旱植物、滴灌和分区控制，待核设计需水量为 510 m³；气候、植物系数和系统效率应与计算附件对应。",
      "本轮已归档的数据仅用于追溯，灌溉减量不等同于非饮用水替代量；引用计算结果时应保留完整单位和月度口径。",
    ],
  },
  "central-water": {
    materialTitle: "新城行政中心 · 室内用水设备清单 v1 · 设备表",
    materialImage: "/demo-materials/previews/central-water.png",
    materialFacts: facts([
      ["常驻使用人数", "920 人"],
      ["基线年用水", "1,860 m³"],
      ["设计年用水", "1,240 m³"],
      ["待核节水率", "33.3%"],
      ["坐便器冲水量", "4.8 L/次"],
      ["公共洗手龙头", "1.5 L/min"],
    ]),
    materialNotes: [
      "设备表按坐便器、小便器、公共洗手龙头及淋浴分类列出型号、数量和额定用水量；额定参数需与产品样本一致。",
      "计算附件采用 920 名常驻人员并列出访客、男女比例及年运行日。使用频次和人数口径决定年用水结果，应核查是否遗漏人群。",
      "33.3% 为待核汇总比例，需区分室内用水先决条件与得分点申报档位；当地等效标签或 WaterSense 证明仍应定位。",
    ],
  },
  "central-daylight": {
    materialTitle: "新城行政中心 · 采光分析报告 v1 · 第 6 页",
    materialImage: "/demo-materials/previews/central-daylight.png",
    materialFacts: facts([
      ["常用空间面积", "12,200 m²"],
      ["sDA300/50%", "68.0%（模拟结果）"],
      ["ASE1000,250", "8.7%（模拟结果）"],
      ["玻璃可见光透射比", "0.62"],
      ["分析网格", "0.6 m / 工作面 0.76 m"],
      ["排除空间", "设备及卫生间 1,480 m²"],
    ]),
    materialNotes: [
      "第 6 页结果表将办公区、会议区和大厅分别列示，常用空间面积 12,200 m²；排除空间应有明确用途和面积依据。",
      "模拟输入采用可见光透射比 0.62、0.6 m 网格和 0.76 m 工作面；需检查天气文件、遮阳构件与家具假设是否对应当前设计。",
      "sDA 与 ASE 应使用一致的空间边界并结合眩光控制方案。汇总结果不能替代逐区域计算附件和设计图纸的核对。",
    ],
  },
  "bay-energy": {
    materialTitle: "海湾科创中心 · 能耗模拟报告 v2 · 第 12 页",
    materialImage: "/demo-materials/previews/bay-energy.png",
    materialFacts: facts([
      ["模拟建筑面积", "35,800 m²"],
      ["基线年电耗", "4,556,000 kWh"],
      ["设计年电耗", "3,298,000 kWh"],
      ["电量差值", "1,258,000 kWh / 27.6%"],
      ["模型版本", "HB-Energy-v2 / 2026-10-20"],
      ["待核输入", "幕墙参数、冷机性能、运行时刻表"],
    ]),
    materialNotes: [
      "第 12 页汇总基线与设计方案年电耗，按空调、照明、设备、风机及水泵分项列示；电量减幅不直接等同于信用项计分使用的改善率。",
      "v2 更新幕墙传热系数和主机性能，但第 5 页围护结构参数仍引用 v1 图纸。审核员需核对模型、设计文件及输入表的版本对应。",
      "运行时刻表采用工作日 08:00—18:00；实验及夜间负荷是否一致、费用或能源换算口径是否符合采用路径，需计算附件佐证。",
    ],
  },
  "bay-lca": {
    materialTitle: "海湾科创中心 · 生命周期评价报告 v1 · 第 8 页",
    materialImage: "/demo-materials/previews/bay-lca.png",
    materialFacts: facts([
      ["比较边界", "主体结构与围护系统"],
      ["评估使用期", "60 年（待核假设）"],
      ["基准温室效应", "412 kgCO₂e/m²"],
      ["设计温室效应", "359 kgCO₂e/m²"],
      ["待核变化率", "下降 12.9%"],
      ["模型范围", "35,800 m² 同功能比较"],
    ]),
    materialNotes: [
      "第 8 页以相同功能、建筑面积和使用期比较基准与设计方案，结构与围护系统的范围需保持一致，防止通过缩小评价边界产生改善。",
      "待核温室效应结果从 412 降至 359 kgCO₂e/m²，但评价还应覆盖所选方法要求的其他环境影响类别和材料清单。",
      "材料数量、运输、替换周期和数据集来源会影响结果；应核对模型版本与设计工程量，而不是仅采信单项百分比。",
    ],
  },
  "forest-water": {
    materialTitle: "绿谷研发园 · 景观灌溉计算书 v1 · 第 4 页",
    materialImage: "/demo-materials/previews/forest-water.png",
    materialFacts: facts([
      ["景观计算面积", "6,400 m²"],
      ["耐旱植物区域", "5,200 m²"],
      ["高峰月基线需水", "1,280 m³"],
      ["设计需水", "640 m³"],
      ["待核减量", "50.0%"],
      ["灌溉方式", "分区滴灌 / 雨感控制"],
    ]),
    materialNotes: [
      "第 4 页按植物分区列出 6,400 m² 景观面积，耐旱植物 5,200 m²；需将每个植物分区与图纸编号及面积表关联。",
      "计算使用高峰月份气候条件、植物需水系数和灌溉效率，设计需水 640 m³；控制策略不能直接替代设备效率及参数证据。",
      "当前待核采用减少灌溉量路径。若改为无需永久灌溉，应提供植物建立期和后续维护策略，不能只删除灌溉系统说明。",
    ],
  },
  "garden-materials": {
    materialTitle: "华庭科创楼 · 低排放材料证明汇总 v2 · 第 3 页",
    materialImage: "/demo-materials/previews/garden-materials.png",
    materialFacts: facts([
      ["产品清单", "34 项"],
      ["已关联有效证明", "29 项"],
      ["待核证明", "5 项"],
      ["重点类别", "涂料、胶粘剂、地面材料"],
      ["空间范围", "办公层 2F—12F"],
      ["版本变化", "v2 增补产品与区域对应"],
    ]),
    materialNotes: [
      "第 3 页汇总 34 项产品，按涂料、胶粘剂与地面材料分类，29 项已关联证明索引。5 项缺项需进一步区分缺文件还是型号不匹配。",
      "v2 新增 2F—12F 的使用区域，产品编码、采购清单与检测证明应能互相回查；相同品牌不同型号不能默认共用证明。",
      "本页仅展示证明清单覆盖，类别合规比例需按标准要求的面积、体积或成本等口径计算，并检查 VOC 含量与释放测试适用性。",
    ],
  },
};

const rules: Record<string, RuleContent> = {
  "LT-GV": {
    ruleSections: sections([
      [
        "优先停车位范围与数量",
        "以项目使用的全部停车位为统计范围，核查绿色车辆优先车位占比、分布及清晰标识。待核按 5% 核对：700 个总车位对应 35 个；F01 正文 37 个与图注 32 个必须先澄清。",
      ],
      [
        "充电设施与技术条件",
        "采用电动汽车充电路径时，核查充电位数量、专用用途及其与优先车位的关系。待核核对 2% 数量，并回查充电等级、适用连接标准、联网及需求响应/分时充电能力证明。",
      ],
      [
        "路径与证据一致",
        "确认选用充电或替代燃料路径，保持申报说明、平面图、设备资料及管理规则一致。缺少完整图纸或关键设备证明时，应记录证据缺口，不能以数量满足代替整项通过。",
      ],
    ]),
    requiredEvidence: [
      "全部停车位统计及平面图",
      "专用车位编号和标识说明",
      "充电设备技术证明与管理方案",
    ],
    ruleReference: "LEED v4 BD+C NC · Green Vehicles · 官方标准第 1 页",
  },
  "LT-BF-01": {
    ruleSections: sections([
      [
        "自行车道路连接",
        "核查功能入口或车库外自行车存放处与合格自行车道路网络的关系，标出实际行走/骑行路线、距离和所连接的用途或交通目的地。",
      ],
      [
        "停车与淋浴设施",
        "依据常驻人员及高峰访客分别核算长期、短期自行车存放设施；商业办公路径还需核查淋浴、更衣设施配置。设施清单应对应具体位置与服务人群。",
      ],
      [
        "图纸与人数依据",
        "图纸须标明设施编号、入口、路径和测距起终点，并以人数统计及设施表支持数量。位置关系已回应不代表所有道路网络与配套条件都已满足。",
      ],
    ]),
    requiredEvidence: [
      "自行车网络与目的地示意",
      "存放区平面及人数计算",
      "淋浴更衣设施图纸",
    ],
    ruleReference: "LEED v4 BD+C 中文版 · 自行车设施 · 第 25 页；核对要点。",
  },
  "SS-HI-01": {
    ruleSections: sections([
      [
        "计算边界",
        "区分屋面和非屋面铺装，按采用路径核对高反射、种植、遮荫或停车遮盖措施的有效面积，避免把设备区或重复区域计入多种措施。",
      ],
      [
        "材料与遮荫性能",
        "高反射面层需提供适用的太阳反射性能证明，明确初始或老化数据；植物遮荫需说明达到规定生长年限后的覆盖范围，不能只引用种植数量。",
      ],
      [
        "综合面积计算",
        "将分区图、材料性能和面积计算逐项关联，按适用公式或加权方法评价。补件只说明材料型号时，应继续补足面积边界和有效性能证据。",
      ],
    ]),
    requiredEvidence: [
      "屋面/铺装分区及面积表",
      "反射性能检测资料",
      "种植与遮荫范围计算",
    ],
    ruleReference: "LEED v4 BD+C 中文版 · 降低热岛效应 · 第 42 页；核对要点。",
  },
  "LT-RPF-01": {
    ruleSections: sections([
      [
        "停车容量统计",
        "纳入项目使用的既有、新建、租赁及相关场外非路边停车位，核查统计边界和当地最低停车要求，保持用途与面积分类一致。",
      ],
      [
        "适用减量路径",
        "区分基线地点与具备密度或交通服务条件的地点，采用相应比较基准和减量要求；先证明路径适用性，再复算申报比例。",
      ],
      [
        "共享与优先停车",
        "共享停车应按项目获得的使用份额核算，并核查适用的拼车优先停车配置。提供法规、租赁与共享分配依据，不能只提交汇总数字。",
      ],
    ]),
    requiredEvidence: [
      "当地停车规定及采用基准",
      "全部停车位清单",
      "共享/场外停车与优先位说明",
    ],
    ruleReference: "LEED v4 BD+C 中文版 · 停车面积减量 · 第 29 页；核对要点。",
  },
  "EQ-LEM-01": {
    ruleSections: sections([
      [
        "产品类别与室内范围",
        "按涂料、胶粘剂、地板及其他适用类别建立清单，明确室内使用区域，选择对应的类别计算或预算方法，不同类别不能直接以件数合并。",
      ],
      [
        "VOC 含量与释放",
        "分别核查适用的 VOC 含量限制和释放测试要求，证明必须对应产品型号、测试方法和使用类别。宣传性低 VOC 描述不能替代有效检测文件。",
      ],
      [
        "统计与证据对应",
        "按所选方法要求的体积、面积、成本等口径计算合规份额，保留产品编码、采购清单、使用区域及检测索引；缺证明产品应明确列出。",
      ],
    ]),
    requiredEvidence: [
      "分类产品及使用区域清单",
      "VOC 含量/释放测试证明",
      "合规比例计算附件",
    ],
    ruleReference: "LEED v4 BD+C 中文版 · 低逸散材料 · 第 120 页；核对要点。",
  },
  "WE-OWUR-01": {
    ruleSections: sections([
      [
        "景观边界与路径",
        "区分种植景观与非植被区域，明确采用无需永久灌溉还是减少灌溉量路径。建立期灌溉与永久灌溉的边界应在维护策略中说明。",
      ],
      [
        "基线与设计需水",
        "使用场地高峰需水月份和一致景观面积，核查植物系数、气候参数、灌溉效率及控制策略，分别计算基线和设计需水量。",
      ],
      [
        "减量与得分区别",
        "证明所需减量先决条件，并单独核对所申报得分点的更高要求。非饮用水替代和植物/灌溉效率改善应按规则分别计算，不得重复抵扣。",
      ],
    ]),
    requiredEvidence: [
      "景观种植面积及植物清单",
      "高峰月份需水计算",
      "灌溉与维护/替代水源说明",
    ],
    ruleReference:
      "LEED v4 BD+C 中文版 · 室外用水减量 · 第 54 页主题；核对要点，得分点要求另核。",
  },
  "WE-IWUR-01": {
    ruleSections: sections([
      [
        "适用用水器具",
        "列出项目范围内坐便器、小便器、水龙头与淋浴等器具的型号、数量和额定流量/冲水量，核对适用的节水标签或当地等效证明。",
      ],
      [
        "使用人群与基线",
        "以常驻人员、访客及运行天数建立一致的使用量模型，按标准器具基线比较设计方案；不得改变使用频次来人为扩大节水率。",
      ],
      [
        "结果与证明",
        "逐类汇总设计与基线用水量，区分先决条件和得分点申报等级。产品样本、人数表与计算附件应相互对应，避免只引用总节水百分比。",
      ],
    ]),
    requiredEvidence: [
      "器具型号/流量与标签证明",
      "使用人数及运行日统计",
      "逐类基线/设计用水计算",
    ],
    ruleReference:
      "LEED v4 BD+C 中文版 · 室内用水减量 · 第 55 页主题；核对要点，得分点要求另核。",
  },
  "EQ-DL-01": {
    ruleSections: sections([
      [
        "常用空间与眩光",
        "明确全部常用空间及排除空间的面积，核查手动或自动且可手动控制的眩光控制设施，保持图纸和分析范围一致。",
      ],
      [
        "采光模拟方法",
        "采用空间自然采光照明和年度日光照射模拟时，同时核查 sDA 与 ASE。模型的天气、玻璃、遮阳、网格和工作面高度需留有可复核输入。",
      ],
      [
        "结果与阈值",
        "以统一空间边界计算 sDA 达标面积和 ASE 暴露比例，按所选得分档位核查。只报告平均照度或单个房间结果不能替代完整常用空间统计。",
      ],
    ]),
    requiredEvidence: [
      "常用空间面积与排除清单",
      "采光模型及输入参数",
      "分区 sDA/ASE 结果与眩光控制",
    ],
    ruleReference: "LEED v4 BD+C 中文版 · 自然采光 · 第 133 页；核对要点。",
  },
  "EA-OEP-01": {
    ruleSections: sections([
      [
        "比较路径与基准",
        "明确整栋建筑能耗模拟等采用路径，建立同功能、同气候及一致运行条件的基线和设计模型，并核查所采用标准与版本。",
      ],
      [
        "模型输入与设计",
        "将围护结构、照明、暖通设备和运行时刻表关联到设计文件及产品参数。版本更新应说明影响项，不能同时使用不同轮次输入而不说明。",
      ],
      [
        "改善率与附件",
        "依据所选路径要求的成本或能源口径计算性能改善，保留分项能耗和假设。电量减幅与正式计分改善率可能不同，需明确计算口径。",
      ],
    ]),
    requiredEvidence: [
      "基线/设计模型及参数表",
      "分项能耗与费用计算",
      "设计版本和设备性能依据",
    ],
    ruleReference: "LEED v4 BD+C 中文版 · 能源效率优化 · 第 77 页；核对要点。",
  },
  "MR-LCA-01": {
    ruleSections: sections([
      [
        "申报路径与范围",
        "区分既有建筑再利用和全建筑生命周期评价等路径。采用评价路径时，明确结构、围护及所包括的生命周期阶段，保持比较边界一致。",
      ],
      [
        "可比方案与模型",
        "基准与设计方案应具有可比的功能、规模和评价期，材料数量、替换和数据来源须可追溯；不能依靠缩小系统范围获得改善。",
      ],
      [
        "多类别影响核查",
        "除温室效应外，按适用路径核查其他环境影响类别及不利变化限制。单项碳排降低不能直接代表整个信用项通过。",
      ],
    ]),
    requiredEvidence: [
      "评价范围和可比方案说明",
      "材料工程量与数据集索引",
      "多环境影响类别结果",
    ],
    ruleReference:
      "LEED v4 BD+C 中文版 · 降低建筑生命周期影响 · 第 94 页主题；核对要点。",
  },
};

export function getReviewDossier({
  projectId,
  ruleCode,
  sourceName,
  sourcePage,
}: {
  projectId: string;
  ruleCode: string;
  sourceName: string;
  sourcePage?: string;
}): ReviewDossier {
  let key = "eag-parking";
  if (projectId === "eag" || ruleCode.startsWith("LT-GV"))
    key =
      sourceName.includes("F03") || sourceName.includes("充电设备")
        ? "eag-equipment"
        : sourceName.includes("F02") || sourceName.includes("标识")
          ? "eag-signage"
          : "eag-parking";
  else if (ruleCode === "LT-BF-01") key = "river-bike";
  else if (ruleCode === "SS-HI-01")
    key = projectId === "river" ? "river-heat" : "lake-heat";
  else if (ruleCode === "LT-RPF-01") key = "north-parking";
  else if (ruleCode === "EQ-LEM-01")
    key = projectId === "garden" ? "garden-materials" : "north-emitting";
  else if (ruleCode === "WE-OWUR-01")
    key = projectId === "forest" ? "forest-water" : "lake-water";
  else if (ruleCode === "WE-IWUR-01") key = "central-water";
  else if (ruleCode === "EQ-DL-01") key = "central-daylight";
  else if (ruleCode === "EA-OEP-01") key = "bay-energy";
  else if (ruleCode === "MR-LCA-01") key = "bay-lca";
  const rule =
    rules[ruleCode.startsWith("LT-GV") ? "LT-GV" : ruleCode] ?? rules["LT-GV"];
  if (
    projectId === "eag" &&
    (sourceName.includes("F04") ||
      sourceName.includes("F05") ||
      sourceName.includes("未提交"))
  ) {
    return {
      materialTitle: `${sourceName} · 尚未提交`,
      materialImage: "/demo-materials/previews/missing-material.png",
      materialFileUrl: "",
      materialFacts: facts([
        ["提交状态", "本轮未收到原始文件"],
        ["需要资料", "完整车库平面图 / 场地关系图"],
        ["审核影响", "位置、编号和场地关系未覆盖"],
      ]),
      materialNotes: [
        "F04 车库平面图和 F05 场地图未列入本轮已提交材料，当前没有可预览的原件。",
        "已有 F01 局部示意仅用于定位数量冲突，不能代替完整车库或场地图。",
        "请在补件要求中写明图纸范围、版本和需要核查的关系，收到后再纳入本轮审核。",
      ],
      ...rule,
    };
  }
  const fileMap: Record<string, string> = {
    "eag-parking": "F01.html",
    "eag-signage": "F02.html",
    "eag-equipment": "F03.html",
    "river-bike": "river-plan-v2.html",
    "river-heat": "river-roof-v2.html",
    "north-parking": "north-parking-v1.html",
    "north-emitting": "north-emitting-v1.html",
    "lake-heat": "lake-heat-v1.html",
    "lake-water": "lake-water-v1.html",
    "central-water": "central-water-v1.html",
    "central-daylight": "central-daylight-v1.html",
    "bay-energy": "bay-energy-v2.html",
    "bay-lca": "bay-lca-v1.html",
    "forest-water": "forest-water-v1.html",
    "garden-materials": "garden-materials-v2.html",
  };
  const material = materialDossiers[key];
  const firstPage =
    key === "eag-parking" && /第\s*1\s*页/.test(sourcePage ?? "");
  return {
    ...material,
    ...(key === "eag-parking"
      ? { materialTitle: "F01 绿色车辆申报说明 · 关联车位图注第 2 页" }
      : {}),
    ...(firstPage
      ? {
          materialImage: "/demo-materials/previews/eag-summary.png",
          materialTitle: "F01 绿色车辆申报说明 · v1 · 第 1 页",
        }
      : {}),
    materialFileUrl: `/demo-materials/${fileMap[key]}`,
    ...rule,
  };
}
