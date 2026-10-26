"use client";

import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { SourceImage } from "@/components/workspace/source-image";
import type { ShowcaseProject, ShowcaseTask } from "@/lib/gv/showcase";
import {
  materialDossiers,
  type ReviewDossier,
} from "@/lib/gv/showcase-dossiers";
import {
  deleteShowcaseAttachment,
  listShowcaseAttachments,
  type ShowcaseAttachment,
  type ShowcaseDecision,
  saveShowcaseAttachment,
  showcaseDecisionKey,
} from "@/lib/gv/showcase-review-storage";

type Tab = "overview" | "materials" | "review" | "opinion";
const tabs: [Tab, string][] = [
  ["overview", "本轮任务概览"],
  ["materials", "本轮材料"],
  ["review", "审核与复核"],
  ["opinion", "意见与归档"],
];

type Finding = "证据冲突" | "证据不足" | "需人工复核" | "支持候选";
const findingOrder: Finding[] = [
  "证据冲突",
  "证据不足",
  "需人工复核",
  "支持候选",
];
const findingStyle: Record<Finding, string> = {
  证据冲突: "bg-[#fff0ea] text-[#b9533c]",
  证据不足: "bg-[#fff1dc] text-[#a46718]",
  需人工复核: "bg-[#e7efff] text-[#3673a5]",
  支持候选: "bg-[#e4f5e9] text-[#168052]",
};
const findingByTask: Record<string, Finding[]> = {
  "eag-green": ["证据冲突", "证据不足", "需人工复核"],
  "river-bike": ["需人工复核", "证据不足", "需人工复核"],
  "river-heat": ["需人工复核", "证据不足", "证据不足"],
  "north-parking": ["证据不足", "需人工复核", "证据不足"],
  "north-emitting": ["证据不足", "需人工复核", "证据不足"],
  "lake-heat": ["支持候选", "支持候选", "需人工复核"],
  "lake-water": ["支持候选", "需人工复核", "支持候选"],
  "central-water": ["需人工复核", "证据不足", "需人工复核"],
  "central-daylight": ["证据不足", "需人工复核", "证据不足"],
  "bay-energy": ["需人工复核", "证据不足", "需人工复核"],
  "bay-lca": ["需人工复核", "证据不足", "需人工复核"],
  "forest-water": ["证据不足", "需人工复核", "证据不足"],
  "garden-materials": ["证据不足", "需人工复核", "证据不足"],
};
const reviewChoices = [
  ["pass", "支持符合"],
  ["fail", "不符合要求"],
  ["supplement", "需要补件"],
  ["conflict", "证据冲突，需澄清"],
  ["defer", "暂缓判断，继续复核"],
  ["not_applicable", "本项不适用"],
] as const;
function displayDecision(saved: ShowcaseDecision | undefined) {
  if (!saved) return "";
  return saved.decision === "defer" && saved.factCheck === "conflict"
    ? "conflict"
    : saved.decision;
}
function factStatus(choice: string) {
  return choice === "conflict"
    ? "conflict"
    : choice === "supplement"
      ? "missing"
      : choice === "pass" || choice === "fail"
        ? "confirmed"
        : "unclear";
}

export function ShowcaseTaskWorkspace({
  task,
  project,
  dossier,
  ruleCode,
}: {
  task: ShowcaseTask;
  project: ShowcaseProject;
  dossier: ReviewDossier;
  ruleCode: string;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [point, setPoint] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, ShowcaseDecision>>(
    {},
  );
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [attachments, setAttachments] = useState<ShowcaseAttachment[]>([]);
  const [message, setMessage] = useState("");
  const [materialCollapsed, setMaterialCollapsed] = useState(false);
  const [ruleCollapsed, setRuleCollapsed] = useState(false);
  useEffect(() => {
    setMaterialCollapsed(
      window.localStorage.getItem(`showcase-material-collapsed:${task.id}`) ===
        "true",
    );
    setRuleCollapsed(
      window.localStorage.getItem(`showcase-rule-collapsed:${task.id}`) ===
        "true",
    );
  }, [task.id]);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (tabs.some(([key]) => key === hash)) setTab(hash as Tab);
  }, []);
  useEffect(() => {
    try {
      setDecisions(
        JSON.parse(
          window.localStorage.getItem(showcaseDecisionKey(task.id)) ?? "{}",
        ) as Record<number, ShowcaseDecision>,
      );
    } catch {
      setDecisions({});
    }
    listShowcaseAttachments(task.id)
      .then(setAttachments)
      .catch(() => setMessage("本机材料读取失败，请检查浏览器存储设置。"));
  }, [task.id]);
  useEffect(() => {
    const saved = decisions[point];
    setDecision(displayDecision(saved));
    setRationale(saved?.rationale ?? "");
    setMessage("");
  }, [point, decisions]);
  const selectTab = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  };
  const chosen = dossier.ruleSections[point] ?? dossier.ruleSections[0];
  const files =
    task.id === "eag-green"
      ? [
          [
            "F01 绿色车辆申报说明.pdf",
            "/demo-materials/previews/eag-summary.png",
            "已登记",
          ],
          [
            "F02 车库标识说明.pdf",
            "/demo-materials/previews/eag-signage.png",
            "已登记",
          ],
          [
            "F03 充电设备资料.docx",
            "/demo-materials/previews/eag-equipment.png",
            "待核对",
          ],
          ["F04 车库平面图.pdf", "", "未提交"],
          ["F05 场地图.pdf", "", "未提交"],
        ]
      : [[task.sourceName, dossier.materialImage, "已登记"]];
  const isGv = task.id === "eag-green";
  const gvMaterialKeys = [
    "eag-parking",
    "eag-equipment",
    "eag-signage",
  ] as const;
  const activeMaterial = isGv
    ? materialDossiers[gvMaterialKeys[point] ?? "eag-parking"]
    : dossier;
  const activeFileName = isGv
    ? ([
        "F01 绿色车辆申报说明.pdf",
        "F03 充电设备资料.docx",
        "F02 车库标识说明.pdf",
      ][point] ?? task.sourceName)
    : task.sourceName;
  const activeNote = isGv
    ? activeMaterial.materialNotes[0]
    : (dossier.materialNotes[point] ?? dossier.materialNotes[0]);
  const activePage = isGv
    ? point === 1
      ? "第 1—2 页"
      : point === 2
        ? "第 1 页"
        : "第 1—2 页"
    : task.sourcePage;
  const toggleMaterial = () =>
    setMaterialCollapsed((current) => {
      window.localStorage.setItem(
        `showcase-material-collapsed:${task.id}`,
        String(!current),
      );
      return !current;
    });
  const toggleRule = () =>
    setRuleCollapsed((current) => {
      window.localStorage.setItem(
        `showcase-rule-collapsed:${task.id}`,
        String(!current),
      );
      return !current;
    });
  const showMaterial = () => {
    setMaterialCollapsed(false);
    window.localStorage.setItem(
      `showcase-material-collapsed:${task.id}`,
      "false",
    );
    window.requestAnimationFrame(() =>
      document
        .getElementById("showcase-material-source")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };
  const showRule = () => {
    setRuleCollapsed(false);
    window.localStorage.setItem(`showcase-rule-collapsed:${task.id}`, "false");
    window.requestAnimationFrame(() =>
      document
        .getElementById("showcase-rule-source")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };
  const overview: [string, string][] = [
    ["所属项目", project.name],
    ["LEED 类别", task.category],
    ["信用项", task.credit],
    ["轮次与阶段", task.round],
    ["当前状态", task.status],
    ["参考材料", task.sourceName],
    ["得分路径", isGv ? "A + C · 待审核员核对" : "待核对"],
    ["规则包 ID", ruleCode || "待关联"],
    ["规则版本", "LEED v4 BD+C NC · 待核对"],
  ];
  const finding = (index: number) =>
    findingByTask[task.id]?.[index] ?? "需人工复核";
  const sortedPoints = findingOrder.flatMap((status) =>
    dossier.ruleSections
      .map((_, index) => index)
      .filter((index) => finding(index) === status),
  );
  const ruleImage = isGv ? `/rules/gv-page-${point > 0 ? 2 : 1}.png` : null;
  const rulePage = Number(
    dossier.ruleReference.match(/第\s*(\d+)\s*页/)?.[1] ?? 1,
  );

  function saveDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision || (decision !== "pass" && !rationale.trim())) return;
    const advance =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
        ?.value === "next";
    const next = {
      ...decisions,
      [point]: {
        factCheck: factStatus(decision),
        decision: decision === "conflict" ? "defer" : decision,
        rationale: rationale.trim(),
        savedAt: new Date().toISOString(),
      },
    };
    try {
      window.localStorage.setItem(
        showcaseDecisionKey(task.id),
        JSON.stringify(next),
      );
      setDecisions(next);
      if (advance && point < dossier.ruleSections.length - 1)
        setPoint(point + 1);
      else if (advance) selectTab("opinion");
      setMessage("本条审核意见已保存。");
    } catch {
      setMessage("保存失败，请检查浏览器存储空间。");
    }
  }

  async function uploadAttachment(file: File | undefined) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setMessage("单个文件不能超过 50 MB。");
      return;
    }
    if (!/\.(pdf|docx?|xlsx?|png|jpe?g)$/i.test(file.name)) {
      setMessage("支持 PDF、Word、Excel、JPG 和 PNG 文件。");
      return;
    }
    try {
      const item: ShowcaseAttachment = {
        id: crypto.randomUUID(),
        taskId: task.id,
        point,
        name: file.name,
        size: file.size,
        addedAt: new Date().toISOString(),
        file,
      };
      await saveShowcaseAttachment(item);
      setAttachments((current) => [...current, item]);
      setMessage("材料已保存到当前浏览器，可在本任务中查看。");
    } catch {
      setMessage("材料保存失败，请检查浏览器存储空间。");
    }
  }

  function openAttachment(file: File) {
    const url = URL.createObjectURL(file);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="mx-auto max-w-[1370px]">
      <section
        className="materials-project-hero relative overflow-hidden rounded-[22px] px-6 py-5"
        style={{
          background:
            '#e9f8f4 url("/images/dashboard-hero.png") center 47% / cover no-repeat',
        }}
      >
        <Link
          href={`/showcase/projects/${project.id}#tasks`}
          className="inline-flex items-center gap-2 text-sm text-[#506d64]"
        >
          <ArrowLeft size={17} /> 返回{project.name}
        </Link>
        <h1 className="mt-3 text-[30px] font-bold">
          {task.category} · {task.credit}
        </h1>
        <p className="mt-1 text-sm text-[#5f7180]">
          {project.name} · LEED v4 BD+C NC · {task.round}
        </p>
        <p className="mt-3 text-sm text-[#536777]">
          {project.location} · {project.buildingUse} · {project.grossArea}　
          <span className="text-[#0a7d53]">
            {Object.keys(decisions).length === dossier.ruleSections.length
              ? "本轮逐项复核已记录"
              : task.status}
          </span>
        </p>
      </section>
      <nav
        aria-label="任务页面"
        className="mt-2 flex gap-7 overflow-x-auto rounded-2xl bg-white px-5 text-sm text-[#73828f]"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`shrink-0 py-3 ${tab === key ? "border-b-[3px] border-[#129262] font-bold text-[#087b52]" : "hover:text-[#087c53]"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_.9fr]">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">任务概览</h2>
            <p className="mt-2 text-sm text-[#708779]">
              项目、路径、规则包及材料线索集中核对。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {overview.map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl bg-[#f7faf8] px-4 py-3 text-sm"
                >
                  <span className="block text-[#82948a]">{label}</span>
                  <strong className="mt-1 block">{value}</strong>
                </div>
              ))}
            </div>
          </section>
          <aside className="self-start space-y-4">
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">本轮材料与任务</h2>
              <p className="mt-3 text-sm leading-6">
                {task.sourceName} · {task.sourceVersion} · {task.sourcePage}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#657c6c]">
                {task.sourceExcerpt}
              </p>
              <button
                type="button"
                onClick={() => selectTab("materials")}
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#0b8255]"
              >
                查看材料与版本 <ArrowRight size={16} />
              </button>
            </section>
            <section className="rounded-2xl border border-[#dcebe2] bg-[#f4faf6] p-5">
              <h2 className="font-semibold">当前关注</h2>
              <p className="mt-2 text-sm leading-6">{task.focus}</p>
            </section>
          </aside>
        </div>
      )}

      {tab === "materials" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">本轮材料</h2>
            <p className="mt-2 text-sm text-[#82948a]">
              文件、版本及来源位置按当前信用项展示。
            </p>
            <div className="mt-4 space-y-2">
              {files.map(([name, image, status]) => (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-xl border border-[#e3ede6] p-3"
                >
                  <FileText size={20} className="shrink-0 text-[#128456]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {name}
                  </span>
                  <span className="text-xs text-[#82948a]">{status}</span>
                  {image && (
                    <a
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-[#0b8255]"
                    >
                      查看页图
                    </a>
                  )}
                </div>
              ))}
              {attachments.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-[#d4e9da] bg-[#f7fbf8] p-3"
                >
                  <FileText size={20} className="shrink-0 text-[#128456]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {item.name}
                  </span>
                  <span className="text-xs text-[#82948a]">
                    核对点 {item.point + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => openAttachment(item.file)}
                    className="text-xs font-semibold text-[#0b8255]"
                  >
                    查看原件
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteShowcaseAttachment(item.id);
                      setAttachments((current) =>
                        current.filter((entry) => entry.id !== item.id),
                      );
                    }}
                    aria-label={`移除${item.name}`}
                    className="text-[#9e6b59]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#85c49d] px-3 py-2 text-sm font-semibold text-[#087b52]">
              <Upload size={16} /> 上传补充材料
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                className="sr-only"
                onChange={(event) => {
                  void uploadAttachment(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <div className="mt-4 rounded-xl bg-[#fff7f2] p-4">
              <h3 className="font-semibold">材料核对提示</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-[#725d4e]">
                {activeMaterial.materialNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </section>
          <aside className="self-start rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">材料事实与来源</h2>
            <div className="mt-4 divide-y divide-[#edf1ee]">
              {activeMaterial.materialFacts.map((fact) => (
                <div
                  key={fact.label}
                  className="grid grid-cols-[115px_1fr] gap-3 py-2.5 text-sm"
                >
                  <span className="text-[#80948a]">{fact.label}</span>
                  <strong>{fact.value}</strong>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[#82948a]">
              {activeMaterial.materialTitle}
            </p>
            <button
              type="button"
              onClick={() => selectTab("review")}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#0b8255]"
            >
              进入审核与复核 <ArrowRight size={16} />
            </button>
          </aside>
        </div>
      )}

      {tab === "review" && (
        <div className="mt-4 grid min-w-0 items-stretch gap-4 xl:grid-cols-[305px_minmax(0,1fr)]">
          <aside className="flex min-w-0 min-h-0 flex-col overflow-hidden rounded-2xl border border-[#bcd9c7] bg-[#edf7ef] shadow-sm">
            <div className="border-b border-[#c3ddcb] bg-[#ddefe2] p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-[#075b3d]">
                  AI 初审结论
                </h2>
                <span className="inline-flex min-h-7 items-center rounded-full bg-white px-2.5 text-xs font-semibold leading-none text-[#8f6b2e]">
                  人工已确认 {Object.keys(decisions).length}/
                  {dossier.ruleSections.length}
                </span>
              </div>
              <p className="mt-2 text-xs text-[#5f7a6a]">
                AI 结果为候选意见，专业结论以审核员核对和保存的判断为准。
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              {findingOrder.map((status) => {
                const indexes = sortedPoints.filter(
                  (index) => finding(index) === status,
                );
                if (!indexes.length) return null;
                return (
                  <div key={status}>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span
                        className={`rounded-full px-2.5 py-1 font-semibold ${findingStyle[status]}`}
                      >
                        {status === "支持候选" ? "AI 支持判断" : status}
                      </span>
                      <span className="text-[#6b8675]">
                        {indexes.length} 项
                      </span>
                    </div>
                    <div className="space-y-2">
                      {indexes.map((index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setPoint(index)}
                          className={`w-full rounded-xl border p-3 text-left text-sm ${point === index ? "ring-2 ring-[#4ba776] shadow-sm" : ""} ${finding(index) === "证据冲突" ? "border-[#f1c4b2] bg-[#fff8f4]" : finding(index) === "证据不足" ? "border-[#f1d7aa] bg-[#fffaf0]" : finding(index) === "支持候选" ? "border-[#c2e1ce] bg-[#f4fbf6]" : "border-[#cadff1] bg-[#f6faff]"}`}
                        >
                          <strong className="block leading-5">
                            {dossier.ruleSections[index].title}
                          </strong>
                          <span className="mt-1 block text-xs font-semibold text-[#315f4b]">
                            AI 态度：
                            {finding(index) === "支持候选"
                              ? "部分支持，仍有待核问题"
                              : finding(index)}
                          </span>
                          <span className="mt-1 flex items-center justify-between gap-2 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 font-semibold ${findingStyle[finding(index)]}`}
                            >
                              {finding(index) === "支持候选"
                                ? "AI 部分支持判断"
                                : finding(index)}
                            </span>
                            <span className="text-[#738b7d]">
                              {decisions[index] ? "已保存判断" : "待人工判断"}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
          <section className="min-w-0 overflow-hidden rounded-2xl border border-[#c4ddcb] bg-white shadow-sm">
            <h2 className="p-4 text-xl font-bold">{chosen.title}</h2>
            <div
              className={`grid min-w-0 border-t border-[#dcebe1] ${materialCollapsed && ruleCollapsed ? "lg:grid-cols-[minmax(0,1fr)_56px_56px]" : materialCollapsed ? "lg:grid-cols-[minmax(0,1.6fr)_56px_minmax(0,1fr)]" : ruleCollapsed ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_56px]" : "lg:grid-cols-3"}`}
            >
              <EvidenceColumn
                title="AI 意见解释"
                icon={<ShieldCheck size={18} />}
              >
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${findingStyle[finding(point)]}`}
                >
                  AI 态度：
                  {finding(point) === "支持候选"
                    ? "部分支持，仍有待核问题"
                    : finding(point)}
                </span>
                {isGv && point === 0 && (
                  <div className="mt-3 rounded-lg border border-[#efc9b8] bg-[#fff7f2] p-3 text-sm leading-6 text-[#843e2d]">
                    <h4 className="font-bold">具体证据冲突</h4>
                    <p>
                      F01 第 1 页申报 37 个优先车位，第 2 页图注只有 32 个。700
                      个总车位按 5% 计算为 35 个；须先核对同版图纸与数量表。
                    </p>
                  </div>
                )}
                <h4 className="mt-4 text-sm font-bold text-[#126946]">
                  已支持的条件与已提取事实
                </h4>
                <div className="mt-2 rounded-lg bg-[#f1f8f3] p-2 text-sm leading-6">
                  <p>
                    {activeMaterial.materialFacts
                      .slice(0, 3)
                      .map((fact) => `${fact.label}：${fact.value}`)
                      .join("；")}
                  </p>
                  <button
                    type="button"
                    onClick={showMaterial}
                    className="mt-1 text-xs font-semibold text-[#0b8255]"
                  >
                    查看材料 · {activeFileName} {activePage} →
                  </button>
                </div>
                <h4 className="mt-4 text-sm font-bold text-[#9b5d16]">
                  审核员下一步核对
                </h4>
                <div className="mt-2 rounded-lg bg-[#fff8eb] p-2 text-sm leading-6 text-[#6d8374]">
                  <p>{activeNote}</p>
                  <button
                    type="button"
                    onClick={showRule}
                    className="mt-1 text-xs font-semibold text-[#0b8255]"
                  >
                    核对规则原页与本条要求 →
                  </button>
                </div>
              </EvidenceColumn>
              <EvidenceColumn
                title="材料来源"
                icon={<FileText size={18} />}
                id="showcase-material-source"
                collapsed={materialCollapsed}
                onToggle={toggleMaterial}
              >
                {isGv && point === 0 && (
                  <div className="mb-3">
                    <SourceImage
                      src="/demo-materials/previews/eag-summary.png"
                      alt="F01 第 1 页申报说明"
                      caption="F01 · 第 1 页申报说明"
                    />
                  </div>
                )}
                <SourceImage
                  src={activeMaterial.materialImage}
                  alt={`${activeFileName}页图`}
                  caption={
                    isGv && point === 0
                      ? "F01 · 第 2 页车位图注"
                      : activeMaterial.materialTitle
                  }
                />
                <div className="mt-3 space-y-2 rounded-lg bg-[#fff9e4] p-2 text-sm leading-6">
                  {activeMaterial.materialNotes.map((note) => (
                    <p key={note}>
                      <KeyText text={note} />
                    </p>
                  ))}
                </div>
                <p className="mt-4 border-t pt-3 text-xs leading-5 text-[#72887b]">
                  {activeFileName} · {task.sourceVersion} · {activePage}
                </p>
              </EvidenceColumn>
              <EvidenceColumn
                title="规则来源"
                icon={<BookOpen size={18} />}
                id="showcase-rule-source"
                collapsed={ruleCollapsed}
                onToggle={toggleRule}
              >
                <p className="rounded-lg border border-[#d9e9dc] bg-[#f5faf6] p-2 text-xs leading-5 text-[#7c9182]">
                  规则来源
                  <br />
                  {isGv
                    ? `LEED v4 BD+C NC · Green Vehicles · 官方标准第 ${point > 0 ? 2 : 1} 页`
                    : dossier.ruleReference}
                </p>
                <div className="mt-3">
                  {ruleImage ? (
                    <SourceImage
                      src={ruleImage}
                      alt="绿色车辆规则原文页图"
                      caption="LEED v4 BD+C · Green Vehicles · 官方标准原页"
                    />
                  ) : (
                    <SourcePdf page={rulePage} />
                  )}
                </div>
                <div className="mt-4 rounded-lg border-l-4 border-[#d9bd42] bg-[#fff9e4] p-3">
                  <h4 className="text-sm font-bold">
                    {chosen.title} · 规则核对重点
                  </h4>
                  <p className="mt-2 text-sm leading-6">{chosen.body}</p>
                  <h4 className="mt-4 text-sm font-bold">所需材料</h4>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
                    {dossier.requiredEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <a
                  href={
                    isGv
                      ? `/rules/gv-source.pdf#page=${point > 0 ? 2 : 1}`
                      : `/rules/leed-v4-bdc-zh.pdf#page=${rulePage}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-xs font-semibold text-[#0b8255]"
                >
                  查看完整规则原文 →
                </a>
              </EvidenceColumn>
            </div>
            <form
              onSubmit={saveDecision}
              className="mt-3 rounded-xl border border-[#9ccaa8] p-4"
            >
              <h3 className="font-bold">审核员判断 · {chosen.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#718779]">
                重点核对：
                {activeNote}
              </p>
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold">本轮审核决定</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {reviewChoices.map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 rounded-lg border border-[#dce9df] px-2 py-1.5 text-xs"
                    >
                      <input
                        type="radio"
                        name="decision"
                        checked={decision === value}
                        onChange={() => setDecision(value)}
                        required
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="mt-4 block text-sm font-semibold">
                判断依据、证据位置与下一步要求
                <textarea
                  value={rationale}
                  onChange={(event) => setRationale(event.target.value)}
                  required={decision !== "pass"}
                  rows={3}
                  placeholder="写明采信的材料和页码、规则条件、差异，以及补件或复核要求。"
                  className="mt-2 w-full rounded-lg border border-[#dce9df] p-3 text-sm"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#0b8054]">
                  <Upload size={16} /> 上传本条补充材料
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(event) => {
                      void uploadAttachment(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    value="save"
                    className="rounded-lg bg-[#087e52] px-4 py-2 text-sm font-semibold text-white"
                  >
                    保存审核意见
                  </button>
                  <button
                    type="submit"
                    value="next"
                    className="rounded-lg border border-[#9ccaa8] px-4 py-2 text-sm font-semibold text-[#087e52]"
                  >
                    {point < dossier.ruleSections.length - 1
                      ? "保存并审核下一要点"
                      : "保存并查看意见"}{" "}
                    <ArrowRight size={15} className="inline" />
                  </button>
                </div>
              </div>
              {attachments
                .filter((item) => item.point === point)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openAttachment(item.file)}
                    className="mt-2 mr-2 text-xs font-semibold text-[#0b8054]"
                  >
                    {item.name} ↗
                  </button>
                ))}
              {message && (
                <output className="mt-2 block text-xs text-[#497b5e]">
                  {message}
                </output>
              )}
            </form>
          </section>
        </div>
      )}

      {tab === "opinion" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_.9fr]">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">专业意见与处理记录</h2>
            <p className="mt-4 rounded-xl bg-[#f3faf6] p-4 text-sm leading-7">
              {project.event}
            </p>
            <h3 className="mt-5 font-semibold">
              本轮逐项判断 · {Object.keys(decisions).length}/
              {dossier.ruleSections.length}
            </h3>
            <div className="mt-3 space-y-2">
              {dossier.ruleSections.map((item, index) => (
                <article
                  key={item.title}
                  className="rounded-xl border border-[#dcebe2] p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>{item.title}</strong>
                    <span className="text-xs text-[#728d7b]">
                      {decisions[index]
                        ? new Date(decisions[index].savedAt).toLocaleString(
                            "zh-CN",
                            { timeZone: "Asia/Shanghai" },
                          )
                        : "待复核"}
                    </span>
                  </div>
                  {decisions[index] ? (
                    <p className="mt-2 leading-6">
                      {decisions[index].rationale}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPoint(index);
                        selectTab("review");
                      }}
                      className="mt-2 text-xs font-semibold text-[#0b8255]"
                    >
                      进入本条复核 →
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
          <aside className="self-start rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">任务状态</h2>
            <p className="mt-4 font-semibold text-[#0b7950]">
              {Object.keys(decisions).length === dossier.ruleSections.length
                ? "本轮逐项复核已记录"
                : task.status}
            </p>
            <p className="mt-2 text-sm text-[#718779]">{task.round}</p>
            <Link
              href={`/showcase/projects/${project.id}#tasks`}
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0b8255]"
            >
              返回项目全貌 <ArrowRight size={16} />
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}

function KeyText({ text }: { text: string }) {
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
            <mark key={start} className="rounded bg-[#ffe477] px-0.5">
              {part}
            </mark>
          ) : (
            <span key={start}>{part}</span>
          );
        })}
    </>
  );
}

function SourcePdf({ page }: { page: number }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  const src = `/rules/leed-v4-bdc-zh.pdf#page=${page}`;
  return (
    <>
      <div className="overflow-hidden rounded-lg border border-[#dcebe1]">
        <iframe
          src={`${src}&toolbar=0`}
          title={`LEED 规则第 ${page} 页`}
          className="h-[160px] w-full pointer-events-none"
        />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full bg-[#f5faf6] px-2 py-1 text-xs font-semibold text-[#0b8255]"
        >
          查看规则原页
        </button>
      </div>
      {expanded && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b15]/85 p-5">
          <button
            type="button"
            aria-label="关闭规则原页"
            onClick={() => setExpanded(false)}
            className="absolute inset-0"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`LEED 规则第 ${page} 页`}
            className="relative flex h-[92vh] w-[min(95vw,1100px)] flex-col overflow-hidden rounded-xl bg-white"
          >
            <div className="flex justify-between border-b px-4 py-3 text-sm font-semibold">
              <span>LEED v4 BD+C · 第 {page} 页</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="关闭规则原页"
              >
                <X size={20} />
              </button>
            </div>
            <iframe
              src={src}
              title="LEED 规则原文"
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      )}
    </>
  );
}

function EvidenceColumn({
  title,
  icon,
  id,
  children,
  collapsed = false,
  onToggle,
}: {
  title: string;
  icon: ReactNode;
  id?: string;
  children: ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
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
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? `展开${title}` : `收起${title}`}
            aria-expanded={!collapsed}
            title={collapsed ? `展开${title}` : `收起${title}`}
            className="ml-auto hidden rounded-md p-1 text-[#0b8255] hover:bg-[#dceee2] lg:ml-0 lg:inline-flex"
          >
            {title === "材料来源" ? (
              collapsed ? (
                <ChevronRight size={18} />
              ) : (
                <ChevronLeft size={18} />
              )
            ) : collapsed ? (
              <ChevronLeft size={18} />
            ) : (
              <ChevronRight size={18} />
            )}
          </button>
        )}
      </h3>
      <section
        aria-label={`${title}详情`}
        className={`h-[380px] min-h-0 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin] ${collapsed ? "lg:hidden" : ""}`}
      >
        {children}
      </section>
    </section>
  );
}
