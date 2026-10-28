"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Maximize2,
  ShieldCheck,
  X,
} from "lucide-react";
import Image from "next/image";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { SourceImage } from "@/components/workspace/source-image";
import { gvEvidenceFields } from "@/lib/gv/field-catalog";
import type { GvComputedResult } from "@/lib/gv/rule-engine";
import { fieldLabels } from "@/lib/gv/rule-engine";
import {
  hasMaterialConflict,
  refineSemanticFindings,
} from "@/lib/gv/semantic-findings";
import { dedupeRuleSupport } from "@/lib/gv/support-reconciliation";
import type { SourceLocation } from "@/lib/gv/types";
import { MaterialOpen } from "../materials/material-actions";

export type ReviewFile = {
  id: string;
  fileName: string;
  mimeType: string;
  version: number;
  parseStatus: string;
  parseReason: string | null;
  purpose: string;
};
export type ReviewFragment = {
  fileId: string;
  text: string;
  page: number | null;
  sheet?: string;
  cell?: string;
  paragraph?: number;
};
export type ReviewAssessment = {
  id: string;
  rule_code: string;
  support: string;
  citations: SourceLocation[];
  gaps: string[];
  human_questions: string[];
  provider: string;
  model: string;
  created_at: string;
  supported_findings?: {
    text: string;
    citations: SourceLocation[];
    sourceStatements?: string[];
  }[];
  unverified_findings?: { text: string; citations: SourceLocation[] }[];
};
const emptySources: SourceLocation[] = [];
const supportLabels: Record<string, string> = {
  supports: "证据支持候选，仍需人工确认",
  partial: "部分支持，仍有待核问题",
  insufficient: "证据不足",
  conflicts: "证据冲突",
  unknown: "无法判断",
};
export function aiSupportLabel(
  support?: string,
  ruleCode?: string,
  result?: GvComputedResult,
) {
  if (hasMaterialConflict(result))
    return result?.quantityThresholdMetDespiteConflict
      ? "数量暂达到要求，但分区证据冲突"
      : "证据冲突，需核对原件";
  if (
    support === "unknown" &&
    ruleCode === "R03" &&
    result?.outcome === "EVIDENCE_CONFLICT" &&
    typeof result.inputs?.preferred_spaces === "number" &&
    typeof result.inputs.minimum_preferred_spaces === "number" &&
    result.inputs.preferred_spaces >= result.inputs.minimum_preferred_spaces
  )
    return "数量暂达到要求，B2 证据冲突待核";
  if (
    support === "unknown" &&
    ruleCode === "R05" &&
    typeof result?.inputs?.evse_spaces === "number" &&
    typeof result.inputs.minimum_evse_spaces === "number" &&
    result.inputs.evse_spaces >= result.inputs.minimum_evse_spaces
  )
    return "数量条件有材料支持，车位独立性待核";
  return support ? (supportLabels[support] ?? "需人工核对") : "尚无 AI 意见";
}

function readable(text: string) {
  return text
    .replaceAll("停车分母", "总停车位")
    .replaceAll("申报分母", "申报总停车位")
    .replaceAll("used by the project", "供本项目使用")
    .replaceAll("EVSE 专用车位候选", "申报的充电专用车位")
    .replaceAll("候选 ", "申报 ");
}

function candidateAdvice(
  ruleCode: string,
  assessment?: ReviewAssessment,
  result?: GvComputedResult,
) {
  if (!assessment) return null;
  if (ruleCode === "R02")
    return assessment.support === "supports"
      ? "AI 候选建议：车辆资格证据已有支持，请核对适用规则版本、车型和评分原件后确认。"
      : assessment.support === "partial"
        ? "AI 候选建议：已有部分车辆资格依据，但车型、评分或适用口径尚待核对；暂不建议确认整项符合。"
        : "AI 候选建议：目前不建议确认绿色车辆资格符合。现有可读材料未给出可核对的车型资格、ACEEE 评分或适用的内部资格依据；请先查申报说明及资格政策。";
  if (ruleCode === "R03" && result?.outcome === "EVIDENCE_CONFLICT")
    return "AI 候选建议：已识别优先车位的申报数量与位置线索，但不同材料的数量存在冲突；请核对对应图纸与申报说明后再确认整项是否符合。";
  if (
    ruleCode === "R05" &&
    typeof result?.inputs?.evse_spaces === "number" &&
    typeof result.inputs.minimum_evse_spaces === "number" &&
    result.inputs.evse_spaces >= result.inputs.minimum_evse_spaces
  )
    return "AI 候选建议：申报充电专用车位数量暂达到下限；车位位号、独立性和项目图纸对应关系仍需核对，再确认整项是否符合。";
  return null;
}

function candidateFieldLabel(key: string) {
  return (
    gvEvidenceFields.find((field) => field.key === key)?.label ??
    fieldLabels[key as keyof typeof fieldLabels] ??
    key
  );
}

function reviewPriorities(ruleCode: string) {
  const checks: Record<string, string[]> = {
    R01: [
      "确认申报的总停车位是否覆盖本项目使用的全部路外车位；核对共享、排除和分配依据。",
      "核对申报表上选择的优先停车路径和替代燃料设施路径。",
    ],
    R02: ["核对绿色车辆的资格标准、车辆清单和本项目实际执行的管理政策。"],
    R03: [
      "核对优先车位的最终图纸、位号、入口位置、永久标识和专用管理；有冲突的数量须先澄清。",
    ],
    R04: [
      "核对普通费率和绿色车辆优惠费率是否同周期，以及优惠是否公开、长期适用。",
    ],
    R05: [
      "核对充电专用车位的位号、图纸和设备对应关系；如同时选优先停车，确认两类车位没有重复计算。",
    ],
    R06: [
      "对照本项目设备清单和图纸，确认实际安装的型号、数量及对应车位。",
      "用设备手册核对所选型号的电压、连接器及联网方式；手册中的其他型号不能算作本项目已采用。",
      "查找本项目需求响应或分时电价的配置说明；材料没有写明时，请申请补充或记录待确认。",
    ],
    R07: ["核对替代设施每天实际可服务的车辆数、运行条件和位置。"],
  };
  return checks[ruleCode] ?? [];
}

function conciseReviewerFindings(
  ruleCode: string,
  findings: { text: string; citations: SourceLocation[] }[],
  result?: GvComputedResult,
) {
  if (
    ruleCode === "R01" &&
    typeof result?.inputs.total_parking_spaces === "number"
  )
    return [
      {
        text: `目前申报总车位为 ${result.inputs.total_parking_spaces} 个。请对照地下车库和室外车位图核对完整统计范围；只有发现共享或排除车位时，再查相应分配说明。`,
        citations: [] as SourceLocation[],
      },
    ];
  const filtered = findings.filter(
    (finding) =>
      ruleCode !== "R01" ||
      !/路径|Option\s*[12]|停车折扣|discount/i.test(finding.text),
  );
  const grouped = new Map<string, (typeof findings)[number]>();
  for (const finding of filtered) {
    const key =
      ruleCode === "R03" && /B2|数量|冲突|11\s*个|12\s*个/.test(finding.text)
        ? "r03-quantity"
        : ruleCode === "R05" && /重叠|独立|分离/.test(finding.text)
          ? "r05-overlap"
          : ruleCode === "R06" &&
              /需求响应|分时电价|\bDR\b|\bTOU\b/.test(finding.text)
            ? "r06-dr"
            : ruleCode === "R06" && /型号|采用|设备清单/.test(finding.text)
              ? "r06-model"
              : ruleCode === "R06" &&
                  /联网|网络|IP.可寻址|IP.addressable/.test(finding.text)
                ? "r06-network"
                : ruleCode === "R06" &&
                    /连接器|Type\s*2|IEC\s*62196/.test(finding.text)
                  ? "r06-connector"
                  : finding.text.replace(/[\s，。；、]/g, "").slice(0, 28);
    const previous = grouped.get(key);
    if (previous) {
      previous.citations = [...previous.citations, ...finding.citations].filter(
        (source, index, all) =>
          all.findIndex(
            (other) =>
              other.materialVersionId === source.materialVersionId &&
              other.page === source.page,
          ) === index,
      );
    } else grouped.set(key, { ...finding });
  }
  const concise = [...grouped.values()];
  if (ruleCode === "R03" && result?.quantityThresholdMetDespiteConflict) {
    const first = concise.find((item) =>
      /B2|数量|冲突|11\s*个|12\s*个/.test(item.text),
    );
    if (first)
      first.text =
        "分区优先车位数在材料中有差异；按保守数字计算仍达到数量下限。请核对最终分区数量和位号。";
  }
  return concise.slice(0, ruleCode === "R06" ? 4 : 3);
}

function reviewerQuestion(
  ruleCode: string,
  text: string,
  supportedFindings: { text: string; citations: SourceLocation[] }[],
) {
  const readableText = readable(text);
  if (ruleCode !== "R06") return readableText;
  const manualText = supportedFindings
    .filter((finding) => finding.citations.length > 0)
    .map((finding) => finding.text)
    .join(" ");
  const modelNames = [
    ...new Set(
      manualText.match(/\b[A-Za-z][A-Za-z0-9]*-[A-Z0-9]+-[A-Z0-9]+\b/g) ?? [],
    ),
  ];
  if (/^本项目实际采用|实际采用.*型号|项目选型确认/.test(readableText)) {
    return modelNames.length
      ? `设备资料列出 ${modelNames.join("、")}${modelNames.length === 1 ? " 这一型号" : modelNames.length === 2 ? " 两款型号" : " 等型号"}；请在项目设备清单或图纸中核对实际选用哪款，并确认其技术资料。`
      : "请在项目设备清单或图纸中核对实际选用的 EVSE 型号，并确认所用型号与技术资料对应。";
  }
  if (
    /已实际配置为可寻址|IP-addressable|IP\s*可寻址|实际的网络连接状态/i.test(
      readableText,
    )
  ) {
    const networkModes = ["Wi-Fi", "Ethernet"].filter((mode) =>
      manualText.includes(mode),
    );
    return networkModes.length
      ? `设备资料列明 ${networkModes.join("／")} 联网方式；请核对本项目实际选用设备是否已接入网络并具备 IP 可寻址能力。`
      : "请核对本项目实际选用设备是否已接入网络并具备 IP 可寻址能力，查看项目设备配置或联网证明。";
  }
  if (
    /所选设备.*本项目配置.*(?:需求响应|分时电价|\bDR\b|\bTOU\b)|是否真正具备参与需求响应/i.test(
      readableText,
    )
  ) {
    const documentedCapability = /OCPP\s*1\.6/i.test(manualText)
      ? "OCPP 1.6"
      : /OCPP/i.test(manualText)
        ? "OCPP"
        : /定时充电/.test(manualText)
          ? "定时充电模式"
          : null;
    return documentedCapability
      ? `设备资料列有 ${documentedCapability}，但不能据此确认本项目配置支持需求响应（DR）或分时电价（TOU）；请核对项目配置或实施说明。`
      : "目前材料尚未证实本项目所选 EVSE 的配置支持需求响应（DR）或分时电价（TOU）；请核对项目配置或实施说明。";
  }
  return readableText;
}

function findingIsAboutRule(ruleCode: string, text: string) {
  const terms: Record<string, RegExp> = {
    R01: /总车位|停车位总|停车分母|路外车位|停车范围|共享|排除|申报路径|parking denominator|total parking|off.street parking/i,
    R02: /绿色车辆|车辆资格|车型|ACEEE|green vehicle|vehicle eligib|qualified vehicle|vehicle rating/i,
    R03: /优先车位|优先停车|B2|preferred parking|停车入口|35个|35 个|5%/i,
    R04: /优惠|折扣|费率|discount|parking rate|20%/i,
    R05: /充电车位|充电.{0,8}(?:车位|标识)|充电专用|充电设施|EVSE|charging.{0,16}(?:space|车位|标识)|2%|14个|14 个/i,
    R06: /设备|型号|电压|插座|充电等级|联网|连接器|需求响应|分时电价|Level 2|Type 2|\bDR\b|\bTOU\b|charger|equipment|voltage|socket/i,
    R07: /替代设施|替代燃料|每日服务|服务能力|alternative.fuel|daily service/i,
  };
  return terms[ruleCode]?.test(text) ?? false;
}

function supportedPoints(ruleCode: string, result?: GvComputedResult) {
  const inputs = result?.inputs ?? {};
  const total = inputs.total_parking_spaces;
  const points: string[] = [];
  if (ruleCode === "R01" && typeof total === "number" && total > 0)
    points.push(
      `目前材料已提取到申报总停车位 ${total} 个；统计范围仍须对照原件确认。`,
    );
  if (
    ruleCode === "R03" &&
    typeof inputs.preferred_spaces === "number" &&
    typeof inputs.minimum_preferred_spaces === "number"
  ) {
    points.push(
      `材料申报 ${inputs.preferred_spaces} 个绿色车辆优先车位；按申报总停车位计算，最低需 ${inputs.minimum_preferred_spaces} 个。${inputs.preferred_spaces >= inputs.minimum_preferred_spaces ? "数量暂达到下限。" : "数量低于下限。"}`,
    );
  }
  if (
    ruleCode === "R05" &&
    typeof inputs.evse_spaces === "number" &&
    typeof inputs.minimum_evse_spaces === "number"
  ) {
    points.push(
      `材料申报 ${inputs.evse_spaces} 个充电专用车位；按申报总停车位计算，最低需 ${inputs.minimum_evse_spaces} 个。${inputs.evse_spaces >= inputs.minimum_evse_spaces ? "数量暂达到下限。" : "数量低于下限。"}`,
    );
  }
  if (ruleCode === "R04" && typeof inputs.discount_percent === "number")
    points.push(
      `按材料中的费率计算，绿色车辆停车优惠为 ${inputs.discount_percent}%；费率的适用范围和公示方式仍须核对。`,
    );
  if (
    ruleCode === "R07" &&
    typeof inputs.daily_service_capacity === "number" &&
    typeof inputs.minimum_daily_capacity === "number"
  )
    points.push(
      `材料申报替代设施每天可服务 ${inputs.daily_service_capacity} 辆车；按申报总停车位计算，最低需 ${inputs.minimum_daily_capacity} 辆。`,
    );
  return points;
}

type RuleMark = { page: number; top: number; height: number; label: string };
const ruleMarks: Record<string, RuleMark> = {
  R01: { page: 1, top: 59, height: 6, label: "项目使用的全部停车位范围" },
  R02: { page: 1, top: 64, height: 5, label: "绿色车辆资格定义" },
  R03: { page: 1, top: 59, height: 6, label: "5% 优先车位与分布要求" },
  R04: { page: 1, top: 69, height: 5, label: "至少 20% 的停车优惠" },
  R05: { page: 1, top: 79, height: 5, label: "2% 充电专用车位要求" },
  R06: { page: 2, top: 9, height: 12, label: "EVSE 设备技术条件" },
  R07: { page: 2, top: 24, height: 6, label: "替代设施每日服务能力" },
};

export function ReviewEvidenceTriad({
  taskId,
  rule,
  files,
  fragments,
  assessment,
  result,
  retrievedSources = emptySources,
}: {
  taskId: string;
  rule: { code: string; title: string; summary: string; evidence: string };
  files: ReviewFile[];
  fragments: ReviewFragment[];
  assessment?: ReviewAssessment;
  result?: GvComputedResult;
  retrievedSources?: SourceLocation[];
}) {
  const [fileId, setFileId] = useState(files[0]?.id ?? "");
  const [materialCollapsed, setMaterialCollapsed] = useState(false);
  const [ruleCollapsed, setRuleCollapsed] = useState(false);
  const [focusedCitation, setFocusedCitation] = useState<SourceLocation | null>(
    null,
  );
  const materialScrollRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setMaterialCollapsed(
      window.localStorage.getItem(`gv-material-collapsed:${taskId}`) === "true",
    );
    setRuleCollapsed(
      window.localStorage.getItem(`gv-rule-collapsed:${taskId}`) === "true",
    );
  }, [taskId]);
  const toggleMaterial = () => {
    const next = !materialCollapsed;
    setMaterialCollapsed(next);
    window.localStorage.setItem(
      `gv-material-collapsed:${taskId}`,
      String(next),
    );
  };
  const toggleRule = () => {
    const next = !ruleCollapsed;
    setRuleCollapsed(next);
    window.localStorage.setItem(`gv-rule-collapsed:${taskId}`, String(next));
  };
  const openRule = () => {
    setRuleCollapsed(false);
    window.localStorage.setItem(`gv-rule-collapsed:${taskId}`, "false");
    window.requestAnimationFrame(() =>
      document.getElementById("gv-rule-source")?.scrollIntoView({
        block: "nearest",
      }),
    );
  };
  const openCitation = (source: SourceLocation) => {
    if (!files.some((item) => item.id === source.materialVersionId)) return;
    setFileId(source.materialVersionId);
    setFocusedCitation(source);
    setMaterialCollapsed(false);
    window.localStorage.setItem(`gv-material-collapsed:${taskId}`, "false");
    window.requestAnimationFrame(() =>
      materialScrollRef.current?.scrollTo({ top: 0 }),
    );
  };
  useEffect(() => {
    if (focusedCitation && !materialCollapsed)
      materialScrollRef.current?.scrollTo({ top: 0 });
  }, [focusedCitation, materialCollapsed]);
  const preferredFileId =
    (rule.code === "R02"
      ? files.find((item) =>
          /green.vehicles.narrative\.pdf/i.test(item.fileName),
        )?.id
      : undefined) ??
    assessment?.citations.find((item) =>
      files.some((file) => file.id === item.materialVersionId),
    )?.materialVersionId ??
    retrievedSources.find((item) =>
      files.some((file) => file.id === item.materialVersionId),
    )?.materialVersionId ??
    files[0]?.id ??
    "";
  useEffect(() => {
    setFileId(preferredFileId);
  }, [preferredFileId]);
  const file = files.find((item) => item.id === fileId) ?? files[0];
  const citedFileIds = new Set(
    assessment?.citations.map((item) => item.materialVersionId) ?? [],
  );
  const retrievedFileIds = new Set(
    retrievedSources.map((item) => item.materialVersionId),
  );
  const citations =
    assessment?.citations.filter(
      (item) => item.materialVersionId === file?.id,
    ) ?? [];
  const retrieved = retrievedSources.filter(
    (item) => item.materialVersionId === file?.id,
  );
  const located = fragments.filter((item) => item.fileId === file?.id);
  const citedPages = new Set(
    citations
      .map((item) => item.page)
      .filter((page): page is number => typeof page === "number"),
  );
  const retrievedPages = new Set(
    retrieved
      .map((item) => item.page)
      .filter((page): page is number => typeof page === "number"),
  );
  const citedCells = new Set(
    citations.map((item) => `${item.sheet ?? ""}:${item.cell ?? ""}`),
  );
  const retrievedCells = new Set(
    retrieved.map((item) => `${item.sheet ?? ""}:${item.cell ?? ""}`),
  );
  const isCited = (item: ReviewFragment) =>
    citedPages.has(item.page ?? -1) ||
    Boolean(
      item.sheet && item.cell && citedCells.has(`${item.sheet}:${item.cell}`),
    );
  const isRetrieved = (item: ReviewFragment) =>
    retrievedPages.has(item.page ?? -1) ||
    Boolean(
      item.sheet &&
        item.cell &&
        retrievedCells.has(`${item.sheet}:${item.cell}`),
    );
  const orderedFragments = [...located].sort(
    (a, b) =>
      Number(isCited(b)) * 2 +
      Number(isRetrieved(b)) -
      (Number(isCited(a)) * 2 + Number(isRetrieved(a))),
  );
  const focusedFragment =
    orderedFragments.find(
      (item) =>
        focusedCitation?.materialVersionId === item.fileId &&
        (focusedCitation.page
          ? focusedCitation.page === item.page
          : focusedCitation.sheet
            ? focusedCitation.sheet === item.sheet &&
              focusedCitation.cell === item.cell
            : focusedCitation.paragraph === item.paragraph),
    ) ??
    orderedFragments.find((item) => item.page === citations[0]?.page) ??
    orderedFragments[0];
  const focusedPage =
    focusedCitation?.materialVersionId === file?.id
      ? (focusedCitation.page ?? focusedFragment?.page ?? undefined)
      : (focusedFragment?.page ?? citations[0]?.page ?? retrieved[0]?.page);
  const ruleMark = ruleMarks[rule.code];
  const supported = supportedPoints(rule.code, result);
  const allSupportedFindings = dedupeRuleSupport(
    rule.code,
    (assessment?.supported_findings ?? []).filter((finding) =>
      findingIsAboutRule(rule.code, finding.text),
    ),
  );
  const { supported: supportedFindings, unverified: rawUnverifiedFindings } =
    refineSemanticFindings(
      rule.code,
      allSupportedFindings,
      (assessment?.unverified_findings ?? []).filter((finding) =>
        findingIsAboutRule(rule.code, finding.text),
      ),
      result,
    );
  const rawConciseFindings = conciseReviewerFindings(
    rule.code,
    rawUnverifiedFindings,
    result,
  );
  const scopedGaps = [
    ...new Set(
      (assessment?.gaps ?? [])
        .map(readable)
        .filter((gap) => findingIsAboutRule(rule.code, gap)),
    ),
  ];
  const scopedQuestions = [
    ...new Set(
      (assessment?.human_questions ?? [])
        .map(readable)
        .filter((question) => findingIsAboutRule(rule.code, question)),
    ),
  ];
  const resultConflicts = (result?.issues ?? []).filter((issue) =>
    /冲突|不一致|有差异/.test(issue),
  );
  const conflictDetails =
    hasMaterialConflict(result) || assessment?.support === "conflicts"
      ? [
          ...new Set(
            resultConflicts.length
              ? resultConflicts
              : scopedGaps.filter((gap) => /冲突|不一致|有差异/.test(gap)),
          ),
        ].slice(0, 2)
      : [];
  const unverifiedFindings = conflictDetails.length
    ? rawConciseFindings.filter(
        (finding) => !/分区优先车位数|B2.*(?:数量|车位)/.test(finding.text),
      )
    : rawConciseFindings;
  const priorities = reviewPriorities(rule.code);
  const materialClues = [
    ...supportedFindings.flatMap((finding) => finding.citations),
    ...unverifiedFindings.flatMap((finding) => finding.citations),
    ...(result?.conditionCoverage ?? []).flatMap(
      (condition) => condition.citations,
    ),
    ...retrievedSources,
  ]
    .filter((source) =>
      files.some((item) => item.id === source.materialVersionId),
    )
    .filter(
      (source) =>
        rule.code !== "R02" ||
        /green.vehicles.narrative/i.test(
          files.find((item) => item.id === source.materialVersionId)
            ?.fileName ?? "",
        ),
    )
    .filter((source) => rule.code !== "R06" || source.page !== 9)
    .filter(
      (source, index, all) =>
        all.findIndex(
          (other) =>
            other.materialVersionId === source.materialVersionId &&
            other.page === source.page &&
            other.sheet === source.sheet &&
            other.cell === source.cell,
        ) === index,
    )
    .slice(0, 3);
  const materialForReview = (finding: {
    text: string;
    citations: SourceLocation[];
  }) => {
    const direct = finding.citations.filter((source) =>
      files.some((item) => item.id === source.materialVersionId),
    );
    if (direct.length) return { sources: direct.slice(0, 2), direct: true };
    const terms =
      rule.code === "R05" && /重叠|分离|独立/.test(finding.text)
        ? ["preferred", "charging", "优先", "充电"]
        : rule.code === "R05" && /标识/.test(finding.text)
          ? ["sign", "charging", "标识", "充电"]
          : rule.code === "R06" && /型号|采用/.test(finding.text)
            ? ["scharger", "model", "型号", "设备"]
            : (finding.text.match(/[A-Za-z0-9]{3,}|[\u4e00-\u9fff]{2,4}/g) ??
              []);
    const matching = fragments
      .filter(
        (fragment) =>
          rule.code !== "R02" ||
          /green.vehicles.narrative/i.test(
            files.find((item) => item.id === fragment.fileId)?.fileName ?? "",
          ) ||
          /aceee|green score|vehicle rating|qualif/i.test(fragment.text),
      )
      .map((fragment) => {
        const fileName =
          files.find((item) => item.id === fragment.fileId)?.fileName ?? "";
        const fileBoost =
          rule.code === "R01" && /garage floor plan|site plan/i.test(fileName)
            ? 5
            : rule.code === "R03" &&
                /B2|11|12/.test(finding.text) &&
                /garage floor plan/i.test(fileName)
              ? 5
              : rule.code === "R05" &&
                  /重叠|分离|独立/.test(finding.text) &&
                  /garage floor plan/i.test(fileName)
                ? 4
                : rule.code === "R05" &&
                    /标识/.test(finding.text) &&
                    /sign system design/i.test(fileName)
                  ? 4
                  : 0;
        return {
          fragment,
          hits:
            fileBoost +
            terms.filter((term) =>
              fragment.text.toLowerCase().includes(term.toLowerCase()),
            ).length,
        };
      })
      .filter((item) => item.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 2)
      .map(({ fragment }) => ({
        materialVersionId: fragment.fileId,
        page: fragment.page ?? undefined,
        sheet: fragment.sheet,
        cell: fragment.cell,
        paragraph: fragment.paragraph,
      }))
      .filter((source) =>
        files.some((item) => item.id === source.materialVersionId),
      );
    return {
      sources: matching.length ? matching : materialClues.slice(0, 1),
      direct: false,
    };
  };
  return (
    <div
      className={`grid min-w-0 border-t border-[#dcebe1] ${materialCollapsed && ruleCollapsed ? "lg:grid-cols-[minmax(0,1fr)_56px_56px]" : materialCollapsed ? "lg:grid-cols-[minmax(0,1.6fr)_56px_minmax(0,1fr)]" : ruleCollapsed ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_56px]" : "lg:grid-cols-3"}`}
    >
      <EvidenceColumn title="AI 意见解释" icon={<ShieldCheck size={18} />}>
        <span
          className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${assessment?.support === "conflicts" || assessment?.support === "insufficient" ? "bg-[#fff0e8] text-[#a45c35]" : "bg-[#e8f5ed] text-[#0f7d52]"}`}
        >
          AI 态度：{aiSupportLabel(assessment?.support, rule.code, result)}
        </span>
        {conflictDetails.length > 0 && (
          <div className="mt-3 rounded-lg border border-[#efc9b8] bg-[#fff7f2] p-3 text-sm leading-6 text-[#843e2d]">
            <h4 className="font-bold">具体证据冲突</h4>
            {conflictDetails.map((detail) => (
              <p key={detail} className="mt-1">
                {readable(detail)}
              </p>
            ))}
          </div>
        )}
        {candidateAdvice(rule.code, assessment, result) && (
          <p className="mt-3 rounded-lg bg-[#fff8eb] p-2 text-sm leading-6 text-[#78551e]">
            {candidateAdvice(rule.code, assessment, result)}
          </p>
        )}
        {assessment ? (
          <>
            <h4 className="mt-4 text-sm font-bold text-[#126946]">
              已支持的条件与已提取事实
            </h4>
            {supported.length || supportedFindings.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6">
                {supported.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-6 text-[#718579]">
                {materialClues.length
                  ? "已找到与本条相关的材料片段，但还不能确认项目采用情况或全部条件；请打开材料原页核对。"
                  : "本条尚未找到可定位的项目材料，请核对原件或补充证据。"}
              </p>
            )}
            {supported.length > 0 && result?.sources?.length ? (
              <SourceCitationButtons
                sources={result.sources}
                files={files}
                onOpen={openCitation}
              />
            ) : null}
            {result?.conditionCoverage?.length ? (
              <details className="mt-3 rounded-lg border border-[#dce8df] bg-[#f8fbf9] px-3 py-2 text-xs">
                <summary className="cursor-pointer font-semibold text-[#126946]">
                  逐条件字段核对（{result.conditionCoverage.length} 项）
                </summary>
                <p className="mt-2 leading-5 text-[#708578]">
                  这里显示结构化字段的提取覆盖情况，不表示条件符合或专业结论通过。
                  {result.ruleId === "R06" && supportedFindings.length > 0
                    ? " 上方引用的设备手册规格属于产品能力，尚不能填作本项目已采用的设备配置。"
                    : ""}
                </p>
                <div className="mt-2 space-y-2">
                  {result.conditionCoverage.map((condition) => (
                    <div
                      key={condition.id}
                      className="rounded-lg border border-[#e2ece5] bg-white p-2"
                    >
                      <p className="font-semibold">
                        {condition.id} · {condition.title}
                      </p>
                      <p className="mt-1 text-[#5d7668]">
                        {condition.status === "requires_scope"
                          ? "需核对路径、适用性或人工记录"
                          : condition.status === "candidate_present"
                            ? "相关字段已有候选，仍须核对内容"
                            : condition.status === "partial"
                              ? "只提取到部分字段"
                              : result.ruleId === "R06"
                                ? "尚未提取到本项目采用配置的字段候选"
                                : "尚未提取到相关字段"}
                      </p>
                      {condition.missingFields.length > 0 && (
                        <p className="mt-1 text-[#986934]">
                          {result.ruleId === "R06"
                            ? "待找项目配置证据："
                            : "待找："}
                          {condition.missingFields
                            .map(candidateFieldLabel)
                            .join("、")}
                        </p>
                      )}
                      <SourceCitationButtons
                        sources={condition.citations}
                        files={files}
                        onOpen={openCitation}
                      />
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {supportedFindings.map((finding, index) => (
              <div
                key={`${finding.text}-${index}`}
                className="mt-2 rounded-lg bg-[#f1f8f3] p-2 text-sm leading-6"
              >
                <p>AI 判断有材料支持 · {readable(finding.text)}</p>
                {(finding.sourceStatements?.length ?? 0) > 1 ? (
                  <details className="mt-1 text-xs text-[#527265]">
                    <summary className="cursor-pointer">
                      查看合并前的 {finding.sourceStatements?.length} 条原始表述
                    </summary>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {finding.sourceStatements?.map(
                        (statement, sourceIndex) => (
                          <li key={`${sourceIndex}-${statement}`}>
                            {statement}
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                ) : null}
                <SourceCitationButtons
                  sources={finding.citations}
                  files={files}
                  onOpen={openCitation}
                />
                <button
                  type="button"
                  onClick={openRule}
                  className="mt-1 inline-block text-xs font-semibold text-[#0b8255]"
                >
                  核对规则 {rule.code} · 官方原文第{" "}
                  {result?.basisRetrieval?.selectedBasisRefs[0]?.page ??
                    ruleMark.page}{" "}
                  页 →
                </button>
              </div>
            ))}
            <h4 className="mt-4 text-sm font-bold text-[#94601f]">
              审核员下一步核对
            </h4>
            {unverifiedFindings.length > 0 ? (
              unverifiedFindings.map((finding, index) => {
                const related = materialForReview(finding);
                return (
                  <div
                    key={`${finding.text}-${index}`}
                    className="mt-2 rounded-lg bg-[#fff8eb] p-2 text-sm leading-6"
                  >
                    <p>
                      {reviewerQuestion(
                        rule.code,
                        finding.text,
                        supportedFindings,
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={openRule}
                      className="mt-1 inline-block text-xs font-semibold text-[#0b8255]"
                    >
                      核对规则 {rule.code} · 官方原文第{" "}
                      {result?.basisRetrieval?.selectedBasisRefs[0]?.page ??
                        ruleMark.page}{" "}
                      页 →
                    </button>
                    <p className="mt-2 text-xs text-[#795d26]">
                      {related.direct
                        ? "查看该问题引用的材料原文："
                        : "尚无直接证明，查看相关材料线索并核对："}
                    </p>
                    {related.sources.length ? (
                      <SourceCitationButtons
                        sources={related.sources}
                        files={files}
                        onOpen={openCitation}
                      />
                    ) : (
                      <p className="mt-1 text-xs text-[#986934]">
                        本轮未找到对应材料，请补充或在本轮材料中查找。
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6">
                  {priorities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {scopedGaps.slice(0, 3).map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
                <SourceCitationButtons
                  sources={materialClues}
                  files={files}
                  onOpen={openCitation}
                />
              </>
            )}
            {scopedGaps.length > 0 && (
              <details className="mt-3 rounded-lg border border-[#e4ebe4] px-3 py-2 text-xs">
                <summary className="cursor-pointer font-semibold text-[#80612f]">
                  查看 AI 发现的具体缺口（{scopedGaps.length}）
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-4 leading-5">
                  {scopedGaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </details>
            )}
            {scopedQuestions.length > 0 && (
              <details className="mt-2 rounded-lg border border-[#e4ebe4] px-3 py-2 text-xs">
                <summary className="cursor-pointer font-semibold text-[#80612f]">
                  查看 AI 提出的核对问题（{scopedQuestions.length}）
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-4 leading-5">
                  {scopedQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </details>
            )}
            {result?.ruleGuidanceStatus && (
              <section className="mt-4 border-t border-[#dce8df] pt-3">
                <h4 className="text-sm font-bold text-[#126946]">
                  LEED 规则核对要点
                </h4>
                <p className="mt-1 text-xs leading-5 text-[#718579]">
                  根据待核问题从受控 GV 原文补充检索并整理，供核对材料使用。
                </p>
                {result.ruleGuidance?.length ? (
                  <div className="mt-2 space-y-2">
                    {result.ruleGuidance.map((guidance) => (
                      <div
                        key={`${guidance.chunkId}-${guidance.questionIndex}`}
                        className="rounded-lg bg-[#f1f8f3] p-2 text-sm leading-6"
                      >
                        <p>{guidance.text}</p>
                        <a
                          href={`/rules/gv-source.pdf#page=${guidance.page}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs font-semibold text-[#0b8255]"
                        >
                          补充检索所得 · {guidance.clause} · 官方原文第{" "}
                          {guidance.page} 页 ↗
                        </a>
                        <details className="mt-1 text-xs text-[#718579]">
                          <summary className="cursor-pointer">
                            查看检索来源
                          </summary>
                          <p>
                            来源：{guidance.sourceId} · {guidance.sourceVersion}
                          </p>
                          <p>
                            规则包：{guidance.rulePackageVersion} · 分块：
                            {guidance.chunkId}
                          </p>
                        </details>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-[#986934]">
                    {result.ruleGuidanceStatus === "FAILED"
                      ? "本次补充解释未生成，请直接核对右侧规则原文。"
                      : "没有找到足以解释待核问题的可靠规则片段，请核对右侧规则原文。"}
                  </p>
                )}
              </section>
            )}
            <p className="mt-4 border-t pt-3 text-xs leading-5 text-[#718579]">
              AI 仅给出证据支持程度，最终是否符合由审核员核对原件后决定。
              {assessment.provider} · {assessment.model} ·{" "}
              {new Date(assessment.created_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6">
            运行整轮 GV 初审后，将先列出有依据的事实，再列出待人工核对的问题。
          </p>
        )}
      </EvidenceColumn>
      <EvidenceColumn
        title="材料来源"
        icon={<FileText size={18} />}
        collapsed={materialCollapsed}
        contentRef={materialScrollRef}
        action={
          <button
            type="button"
            onClick={toggleMaterial}
            aria-label={materialCollapsed ? "展开材料来源" : "收起材料来源"}
            aria-expanded={!materialCollapsed}
            className="ml-auto hidden rounded-md p-1 text-[#0b8255] hover:bg-[#dceee2] lg:ml-0 lg:inline-flex"
          >
            {materialCollapsed ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronLeft size={18} />
            )}
          </button>
        }
      >
        {files.length ? (
          <>
            {rule.code === "R02" && (
              <p className="mb-3 rounded-lg bg-[#fff8eb] p-2 text-xs leading-5 text-[#795d26]">
                优先查看绿色车辆申报说明。车库图纸中的绿色车位标注不能证明车辆资格。
              </p>
            )}
            <label className="block text-xs text-[#708578]">
              本轮材料
              <select
                value={file?.id}
                onChange={(event) => {
                  setFileId(event.target.value);
                  setFocusedCitation(null);
                }}
                className="mt-1 w-full rounded-lg border border-[#dce9de] bg-white p-2 text-sm font-semibold text-[#173e2c]"
              >
                {files.map((item) => (
                  <option key={item.id} value={item.id}>
                    {citedFileIds.has(item.id)
                      ? "★ AI 引用 · "
                      : retrievedFileIds.has(item.id)
                        ? "◇ 检索线索 · "
                        : ""}
                    {item.fileName} · 第 {item.version} 版
                  </option>
                ))}
              </select>
            </label>
            {focusedFragment && (
              <div className="mt-3 rounded-lg border border-[#e7c55b] bg-[#fff9e6] p-2 text-xs leading-5">
                <strong className="text-[#7d5816]">
                  先核对原件
                  {focusedFragment.page
                    ? `第 ${focusedFragment.page} 页`
                    : focusedFragment.sheet
                      ? ` · ${focusedFragment.sheet} ${focusedFragment.cell ?? ""}`
                      : "对应位置"}
                </strong>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap">
                  <HighlightedNumbers
                    text={focusedFragment.text.slice(0, 420)}
                  />
                </p>
                <p className="mt-1 text-[#8d7440]">
                  黄色数字标在提取原文中，请与下方原件同页对照。
                </p>
              </div>
            )}
            {file && (
              <>
                <div className="mt-3">
                  <LiveSourcePreview
                    key={file.id}
                    file={file}
                    page={focusedPage}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-[#6c8376]">
                  {file.purpose} ·{" "}
                  {file.parseStatus === "extracted"
                    ? "已解析"
                    : citations.some(
                          (source) =>
                            source.materialVersionId === file.id &&
                            source.note?.includes("视觉识别"),
                        )
                      ? "文字层受限 · 千问视觉已提供候选，请核对原页"
                      : "需人工核对"}
                </p>
                {citations.length > 0 && (
                  <p className="mt-2 text-xs text-[#087c52]">
                    AI 有效引用：
                    {citations
                      .map((item) =>
                        item.page
                          ? `第 ${item.page} 页`
                          : item.sheet
                            ? `${item.sheet} ${item.cell ?? ""}`
                            : "文件内容",
                      )
                      .join("、")}
                  </p>
                )}
                {retrieved.length > 0 && (
                  <p className="mt-2 text-xs text-[#9a6a25]">
                    检索线索（待人工核对）：
                    {retrieved
                      .map((item) =>
                        item.page
                          ? `第 ${item.page} 页`
                          : item.sheet
                            ? `${item.sheet} ${item.cell ?? ""}`
                            : "文件内容",
                      )
                      .join("、")}
                  </p>
                )}
                {file.parseReason && (
                  <p className="mt-2 text-xs text-[#a66a43]">
                    {file.parseReason}
                  </p>
                )}
                <div className="mt-3">
                  <MaterialOpen fileId={file.id} />
                </div>
              </>
            )}
            {located.length > 0 && (
              <section className="mt-4 border-t pt-3">
                <h4 className="text-sm font-bold">原文摘录与定位</h4>
                <p className="mt-1 text-xs text-[#7e9385]">
                  高亮数值与检索线索供人工对照原件，不等于专业确认。
                </p>
                {orderedFragments.slice(0, 6).map((item, index) => (
                  <div
                    key={`${item.page ?? item.sheet ?? item.paragraph}-${index}`}
                    className={`mt-2 rounded-lg border p-2 text-xs leading-5 ${isCited(item) ? "border-[#eac75b] bg-[#fff9e4]" : isRetrieved(item) ? "border-[#cbdccf] bg-[#f3f9f4]" : "border-transparent bg-[#f5faf6]"}`}
                  >
                    <span className="font-semibold text-[#0b8055]">
                      {item.page
                        ? `第 ${item.page} 页`
                        : item.sheet
                          ? `${item.sheet} · ${item.cell ?? "工作表"}`
                          : item.paragraph
                            ? `第 ${item.paragraph} 段`
                            : "文件内容"}
                      {isCited(item)
                        ? " · AI 引用"
                        : isRetrieved(item)
                          ? " · 检索线索"
                          : ""}
                    </span>
                    <p className="mt-1 whitespace-pre-wrap">
                      <HighlightedNumbers text={item.text.slice(0, 1000)} />
                    </p>
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <p className="text-sm text-[#88978e]">本轮没有已确认的材料版本。</p>
        )}
      </EvidenceColumn>
      <EvidenceColumn
        title="规则来源"
        icon={<BookOpen size={18} />}
        id="gv-rule-source"
        collapsed={ruleCollapsed}
        action={
          <button
            type="button"
            onClick={toggleRule}
            aria-label={ruleCollapsed ? "展开规则来源" : "收起规则来源"}
            aria-expanded={!ruleCollapsed}
            className="ml-auto hidden rounded-md p-1 text-[#0b8255] hover:bg-[#dceee2] lg:ml-0 lg:inline-flex"
          >
            {ruleCollapsed ? (
              <ChevronLeft size={18} />
            ) : (
              <ChevronRight size={18} />
            )}
          </button>
        }
      >
        {result?.basisRetrieval && (
          <div className="rounded-lg border border-[#d9e9dc] bg-[#f5faf6] p-2 text-xs leading-5">
            <p className="font-semibold text-[#0b7650]">
              规则依据：
              {result.basisRetrieval.retrievalStatus !== "FOUND"
                ? "规则原文待定位"
                : result.basisRetrieval.retrievalMode === "HYBRID_RAG"
                  ? "补充检索所得"
                  : "按规则精确定位"}
            </p>
            <p>
              LEED v4 BD+C NC · 规则包{" "}
              {result.basisRetrieval.rulePackageVersion}
            </p>
            {result.basisRetrieval.selectedBasisRefs.map((basis) => (
              <div
                key={`${basis.page}-${basis.contentHash}`}
                className="mt-2 rounded-md border-l-2 border-[#d9bd42] bg-white p-2"
              >
                <a
                  href={`/rules/gv-source.pdf#page=${basis.page}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#0b8255]"
                >
                  官方原文 PDF 第 {basis.page} 页 ↗
                </a>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[#536b5d]">
                  {basis.quote}
                </p>
              </div>
            ))}
            {result.basisRetrieval.retrievalMode === "HYBRID_RAG" && (
              <details className="mt-1">
                <summary className="cursor-pointer">查看检索来源与版本</summary>
                <p>
                  受控资料：gv-source.pdf ·{" "}
                  {result.basisRetrieval.filters.sourceVersion}
                </p>
                <p>检索原因：{result.basisRetrieval.triggerReason}</p>
              </details>
            )}
          </div>
        )}
        <p className="text-xs leading-5 text-[#6d8378]">
          LEED v4 BD+C · LT Green Vehicles · 官方规则原页
        </p>
        <p className="mt-2 rounded-lg bg-[#fff5d9] px-2 py-1.5 text-xs font-semibold text-[#795d26]">
          PDF 第 {ruleMark.page} 页（原书第 {120 + ruleMark.page} 页）· 黄色框：
          {ruleMark.label}
        </p>
        <div className="mt-3">
          <RuleMarkedSource mark={ruleMark} ruleCode={rule.code} />
        </div>
        <div className="mt-4 rounded-xl border-l-4 border-[#d9bd42] bg-[#fff9e4] p-3">
          <h4 className="text-sm font-bold text-[#67501e]">
            {rule.code} · 规则核对重点
          </h4>
          <p className="mt-1 text-sm leading-6">{rule.summary}</p>
          <p className="mt-2 text-xs leading-5 text-[#795d26]">
            所需证据：{rule.evidence}
          </p>
        </div>
        <a
          href={`/rules/gv-source.pdf#page=${ruleMark.page}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0b8255]"
        >
          查看规则原件 <ExternalLink size={13} />
        </a>
      </EvidenceColumn>
    </div>
  );
}

function SourceCitationButtons({
  sources,
  files,
  onOpen,
}: {
  sources: SourceLocation[];
  files: ReviewFile[];
  onOpen: (source: SourceLocation) => void;
}) {
  const unique = sources.filter(
    (source, index, all) =>
      all.findIndex(
        (other) =>
          other.materialVersionId === source.materialVersionId &&
          other.page === source.page &&
          other.sheet === source.sheet &&
          other.cell === source.cell,
      ) === index,
  );
  if (!unique.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {unique.map((source, index) => {
        const fileName =
          files.find((file) => file.id === source.materialVersionId)
            ?.fileName ?? "材料";
        const location = source.page
          ? `第 ${source.page} 页`
          : source.sheet
            ? `${source.sheet} ${source.cell ?? ""}`.trim()
            : "原文";
        return (
          <button
            key={`${source.materialVersionId}-${source.page ?? source.sheet ?? index}-${index}`}
            type="button"
            onClick={() => onOpen(source)}
            title={`${fileName} · ${location}`}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-[#c5dfcc] bg-white px-2 py-1 text-xs font-semibold text-[#087c52] hover:bg-[#e8f5ed]"
          >
            <span className="max-w-40 truncate">{fileName}</span>
            <span className="shrink-0">· {location} →</span>
          </button>
        );
      })}
    </div>
  );
}

function HighlightedNumbers({ text }: { text: string }) {
  let offset = 0;
  return (
    <>
      {text
        .split(/(\b\d+(?:[.,]\d+)?\s?(?:%|㎡|m²|个|辆|台|处|车位)?\b)/g)
        .filter(Boolean)
        .map((part) => {
          const start = offset;
          offset += part.length;
          return /^\d/.test(part) ? (
            <mark
              key={start}
              className="rounded bg-[#ffe477] px-0.5 text-[#473514]"
            >
              {part}
            </mark>
          ) : (
            part
          );
        })}
    </>
  );
}

function RuleMarkedSource({
  mark,
  ruleCode,
}: {
  mark: RuleMark;
  ruleCode: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroll = (element: HTMLDivElement | null) => {
      if (element)
        element.scrollTop = Math.max(
          0,
          (element.scrollWidth * (1100 / 850) * mark.top) / 100 - 28,
        );
    };
    scroll(previewRef.current);
    if (expanded) scroll(detailRef.current);
  }, [expanded, mark.top]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  const src = `/rules/gv-page-${mark.page}.png`;
  const markedImage = (large: boolean) => (
    <div className="relative mx-auto w-full max-w-[850px]">
      <Image
        src={src}
        alt={`${ruleCode} 官方规则原文第 ${mark.page} 页`}
        width={850}
        height={1100}
        unoptimized
        className="block h-auto w-full"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-[15%] w-[75%] rounded-sm border-[3px] border-[#df9b14] bg-[#ffe879]/25 shadow-[0_0_0_2px_white]"
        style={{ top: `${mark.top}%`, height: `${mark.height}%` }}
      />
      {large && (
        <span
          className="absolute left-[15%] rounded bg-[#9b6710] px-2 py-1 text-xs font-bold text-white"
          style={{ top: `${Math.max(0, mark.top - 3)}%` }}
        >
          {ruleCode} · {mark.label}
        </span>
      )}
    </div>
  );
  return (
    <>
      <div
        ref={previewRef}
        className="max-h-[220px] overflow-y-auto rounded-lg border border-[#dce9de] bg-white [scrollbar-width:thin]"
      >
        {markedImage(false)}
      </div>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0b8255]"
      >
        <Maximize2 size={13} /> 放大查看黄色框对应的官方原文
      </button>
      {expanded && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b15]/85 p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${ruleCode} 规则原文`}
            className="flex max-h-[92vh] w-[min(95vw,850px)] flex-col overflow-hidden rounded-xl bg-white"
          >
            <div className="flex items-center justify-between border-b px-4 py-3 text-sm font-semibold">
              <span>
                {ruleCode} · PDF 第 {mark.page} 页（原书第 {120 + mark.page}{" "}
                页）· {mark.label}
              </span>
              <button
                type="button"
                aria-label="关闭规则原文"
                onClick={() => setExpanded(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div ref={detailRef} className="min-h-0 overflow-y-auto">
              {markedImage(true)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EvidenceColumn({
  title,
  icon,
  children,
  action,
  collapsed = false,
  contentRef,
  id,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  collapsed?: boolean;
  contentRef?: Ref<HTMLElement>;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="flex min-w-0 flex-col border-b border-[#dcebe1] last:border-b-0 lg:border-r lg:border-b-0 lg:last:border-r-0"
    >
      <h3
        className={`flex min-h-12 items-center gap-2 bg-[#eaf5ed] px-4 font-bold ${collapsed ? "lg:h-full lg:flex-col lg:justify-start lg:px-1 lg:py-3" : ""}`}
      >
        {icon}
        <span className={collapsed ? "lg:[writing-mode:vertical-rl]" : ""}>
          {title}
        </span>
        {action}
      </h3>
      <section
        ref={contentRef}
        aria-label={`${title}详情`}
        className={`h-[380px] min-h-0 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin] ${collapsed ? "lg:hidden" : ""}`}
      >
        {children}
      </section>
    </section>
  );
}

function LiveSourcePreview({
  file,
  page,
}: {
  file: ReviewFile;
  page?: number;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/${file.id}`)
      .then((response) => response.json())
      .then(
        (result: { ok: boolean; data?: { url: string }; message?: string }) => {
          if (!cancelled)
            result.ok && result.data?.url
              ? setUrl(result.data.url)
              : setError(result.message ?? "原件暂时无法预览");
        },
      )
      .catch(() => {
        if (!cancelled) setError("原件暂时无法预览");
      });
    return () => {
      cancelled = true;
    };
  }, [file.id]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  if (error)
    return (
      <p className="rounded-lg bg-[#fff7f3] p-3 text-xs text-[#a66a43]">
        {error}
      </p>
    );
  if (!url)
    return (
      <p className="rounded-lg bg-[#f4f9f5] p-3 text-xs text-[#718579]">
        正在读取原件预览…
      </p>
    );
  if (file.mimeType.startsWith("image/"))
    return (
      <SourceImage src={url} alt={file.fileName} caption={file.fileName} />
    );
  if (file.mimeType !== "application/pdf")
    return (
      <p className="rounded-lg bg-[#f4f9f5] p-3 text-xs text-[#718579]">
        此格式请通过“查看原件”核对；已解析文字显示在下方。
      </p>
    );
  const source = `${url}#page=${page ?? 1}&toolbar=0`;
  return (
    <>
      <div className="overflow-hidden rounded-lg border border-[#dcebe1]">
        <iframe
          src={source}
          title={`${file.fileName}原文预览`}
          className="h-[230px] w-full"
        />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          onDoubleClick={() => setExpanded(true)}
          className="w-full border-t bg-[#f5faf6] px-2 py-1 text-xs font-semibold text-[#0b8255]"
        >
          双击查看原件大图
        </button>
      </div>
      {expanded && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b15]/85 p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={file.fileName}
            className="flex h-[92vh] w-[min(95vw,1100px)] flex-col overflow-hidden rounded-xl bg-white"
          >
            <div className="flex justify-between border-b px-4 py-3 text-sm font-semibold">
              <span>{file.fileName}</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="关闭原件"
              >
                <X size={20} />
              </button>
            </div>
            <iframe
              src={`${url}#page=${page ?? 1}`}
              title={file.fileName}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      )}
    </>
  );
}
