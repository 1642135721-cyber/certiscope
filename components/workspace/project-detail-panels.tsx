"use client";

import {
  ArrowRight,
  ChevronDown,
  FileText,
  FolderOpen,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminProjectEditor } from "@/components/workspace/admin-project-editor";

export type ProjectTaskItem = {
  id: string;
  category: string;
  credit: string;
  round: string;
  status: string;
  href: string;
  scopeHref: string;
  materialHref: string;
  scopeConfirmed: boolean;
  aiComplete?: boolean;
  opinionSubmitted?: boolean;
  summaryConfirmed?: boolean;
  archived?: boolean;
};
export type ProjectMaterialItem = {
  id: string;
  name: string;
  version: string;
  task: string;
  status: string;
  href: string;
  kind?: "source" | "version";
};
type Tab = "overview" | "materials" | "scope" | "history";
const tabs: [Tab, string][] = [
  ["overview", "项目概况与进度"],
  ["materials", "项目材料"],
  ["scope", "审核范围确认"],
  ["history", "归档与历史审核意见"],
];

export function ProjectDetailPanels({
  facts,
  tasks,
  materials,
  latest,
  latestTime,
  assignedCategories = [],
  canManageMaterials = false,
  projectId,
  editableProject,
}: {
  facts: [string, string][];
  tasks: ProjectTaskItem[];
  materials: ProjectMaterialItem[];
  latest: string;
  latestTime?: string;
  assignedCategories?: string[];
  canManageMaterials?: boolean;
  projectId?: string;
  editableProject?: {
    id: string;
    name: string;
    projectType: string;
    location: string;
    areaValue: number;
    areaUnit: string;
    targetLevel: string;
  };
}) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [materialMessage, setMaterialMessage] = useState("");
  async function removeMaterial(item: ProjectMaterialItem) {
    if (
      !projectId ||
      !item.kind ||
      !window.confirm(
        `从当前项目移除“${item.name}”？已形成的历史审核引用会保留。`,
      )
    )
      return;
    setRemovingId(item.id);
    setMaterialMessage("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/materials/${item.id}?kind=${item.kind}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setMaterialMessage(result.message);
      if (result.ok) router.refresh();
    } catch {
      setMaterialMessage("移除失败，请重试。");
    } finally {
      setRemovingId(null);
    }
  }
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (tabs.some(([key]) => key === hash)) setTab(hash as Tab);
  }, []);
  const selectTab = (key: Tab) => {
    setTab(key);
    window.history.replaceState(null, "", `#${key}`);
  };
  const categories = [...new Set(tasks.map((task) => task.category))];
  const allTasks = (
    predicate: (task: ProjectTaskItem) => boolean | undefined,
  ) => tasks.length > 0 && tasks.every(predicate);
  const steps = [
    ["资料接收", true],
    ["审核范围确认", allTasks((task) => task.scopeConfirmed)],
    ["AI 预审", allTasks((task) => task.aiComplete)],
    ["审核与复核", allTasks((task) => task.opinionSubmitted)],
    ["意见汇总", allTasks((task) => task.summaryConfirmed)],
    ["归档", allTasks((task) => task.archived)],
  ] as const;
  const activeStep = Math.max(
    0,
    steps.findIndex(([, done]) => !done),
  );
  return (
    <>
      <nav
        aria-label="项目页面"
        className="mt-4 flex gap-5 overflow-x-auto rounded-2xl bg-white px-5 text-sm text-[#72877a] shadow-sm"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => selectTab(key)}
            className={`shrink-0 py-3 ${tab === key ? "border-b-[3px] border-[#119061] font-bold text-[#087b52]" : "hover:text-[#087b52]"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-[.8fr_1.5fr]">
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">项目进度</h2>
              <div className="mt-4 space-y-2">
                {steps.map(([label, done], index) => (
                  <div
                    key={label}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${done ? "bg-[#e8f5ed] text-[#087d52]" : index === activeStep ? "bg-[#fff2df] text-[#aa6d20]" : "bg-[#f2f6f3] text-[#80958a]"}`}
                  >
                    {done ? "✓" : "○"}　{label}
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-[#dcebe2] bg-[#f5faf7] p-3 text-sm">
                <span className="text-[#81978a]">
                  最新变化{latestTime ? ` · ${latestTime}` : ""}
                </span>
                <p className="mt-1 font-semibold">{latest}</p>
              </div>
            </section>
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">项目档案</h2>
                {editableProject && (
                  <AdminProjectEditor
                    projectId={editableProject.id}
                    initial={editableProject}
                  />
                )}
              </div>
              <div className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {facts.map(([label, value]) => (
                  <div key={label} className="border-b border-[#edf1ee] pb-2">
                    <span className="block text-[#82948a]">{label}</span>
                    <strong className="mt-1 block">{value || "待核对"}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
          {assignedCategories.length > 0 && (
            <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold">已分配 LEED 类别</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {assignedCategories.map((code) => (
                  <span
                    key={code}
                    className="rounded-full bg-[#eaf5ed] px-3 py-1 text-sm font-semibold text-[#137b51]"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </section>
          )}
          <TaskGroups tasks={tasks} categories={categories} />
        </>
      )}

      {tab === "materials" && (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileText size={21} className="text-[#128456]" />
            <h2 className="text-xl font-bold">项目材料</h2>
          </div>
          <p className="mt-2 text-sm text-[#82948a]">
            按信用项查看本轮文件与版本；原件请在对应任务内定位。
          </p>
          <div className="mt-4 divide-y divide-[#edf1ee]">
            {materialMessage && (
              <output className="block py-2 text-sm text-[#9e6230]">
                {materialMessage}
              </output>
            )}
            {materials.length ? (
              materials.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-4 py-3 text-sm"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-[#e7f5ec] text-[#118456]">
                    <FileText size={20} />
                  </span>
                  <Link
                    href={item.href}
                    className="min-w-0 flex-1 hover:text-[#087e52]"
                  >
                    <strong className="block truncate">{item.name}</strong>
                    <small className="mt-1 block text-[#82948a]">
                      {item.task} · {item.version}
                    </small>
                  </Link>
                  <span className="text-[#a07737]">{item.status}</span>
                  <Link href={item.href} aria-label={`查看${item.name}`}>
                    <ArrowRight size={17} className="text-[#128456]" />
                  </Link>
                  {canManageMaterials && item.kind && (
                    <button
                      type="button"
                      disabled={removingId === item.id}
                      onClick={() => void removeMaterial(item)}
                      aria-label={`移除${item.name}`}
                      className="inline-flex items-center gap-1 text-[#b45340] disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                      移除
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-[#f7faf8] p-5 text-sm text-[#82948a]">
                尚未登记项目材料。
              </p>
            )}
          </div>
        </section>
      )}

      {tab === "scope" && (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">审核范围确认</h2>
          <p className="mt-2 text-sm text-[#82948a]">
            每个信用项按本轮申报材料单独核对路径、版本、范围与文件。
          </p>
          <div className="mt-4 divide-y divide-[#edf1ee]">
            {tasks.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-4 py-4 text-sm"
              >
                <span className="grid size-10 place-items-center rounded-lg bg-[#e7f5ec] font-bold text-[#118456]">
                  {item.category}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block">{item.credit}</strong>
                  <small className="mt-1 block text-[#82948a]">
                    {item.round}
                  </small>
                </span>
                <span
                  className={
                    item.scopeConfirmed ? "text-[#168456]" : "text-[#b0772e]"
                  }
                >
                  {item.scopeConfirmed ? "范围已确认" : "待核对范围"}
                </span>
                <Link
                  href={item.scopeHref}
                  className="inline-flex items-center gap-1 font-semibold text-[#0b7950]"
                >
                  {item.scopeConfirmed ? "查看范围" : "核对范围"}
                  <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "history" && (
        <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">归档与历史审核意见</h2>
          <p className="mt-4 rounded-xl bg-[#f3faf6] p-4 text-sm">
            最近状态：{latest}
          </p>
          <div className="mt-4 space-y-2">
            {tasks.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center justify-between rounded-xl border border-[#e5eee7] px-4 py-3 text-sm hover:bg-[#f7fbf8]"
              >
                <span>
                  {item.category} · {item.credit}　
                  <span className="text-[#83968b]">{item.round}</span>
                </span>
                <span className="text-[#0b7950]">查看任务记录 →</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function TaskGroups({
  tasks,
  categories,
}: {
  tasks: ProjectTaskItem[];
  categories: string[];
}) {
  return (
    <section id="tasks" className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <FolderOpen className="text-[#128456]" />
        <div>
          <h2 className="text-xl font-bold">本项目审核任务</h2>
          <p className="text-sm text-[#82948a]">按 LEED 类别展开信用项。</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {categories.map((category) => (
          <details
            key={category}
            open
            className="rounded-xl border border-[#e1ebe5]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between bg-[#f3faf6] px-4 py-3 font-semibold text-[#0d6747]">
              {category} ·{" "}
              {(
                {
                  LT: "交通与场地",
                  SS: "可持续场地",
                  WE: "水资源效率",
                  EA: "能源与大气",
                  MR: "材料与资源",
                  EQ: "室内环境质量",
                } as Record<string, string>
              )[category] ?? "审核类别"}
              <ChevronDown size={18} />
            </summary>
            <div className="divide-y divide-[#edf1ee]">
              {tasks
                .filter((task) => task.category === category)
                .map((task) => (
                  <Link
                    key={task.id}
                    href={task.href}
                    className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm hover:bg-[#f8fcf9]"
                  >
                    <span className="min-w-0 flex-1">
                      <strong>{task.credit}</strong>
                      <small className="mt-1 block text-[#82948a]">
                        {task.round}
                      </small>
                    </span>
                    <span className="text-[#8b6934]">{task.status}</span>
                    <ArrowRight size={18} className="text-[#5f9a78]" />
                  </Link>
                ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
