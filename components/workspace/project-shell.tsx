import { ArrowLeft, Bell, Building2, Leaf, MapPin, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { BusinessRole } from "@/lib/gv/types";
import { projectDisplayName, projectDisplayValue, userDisplayName } from "@/lib/gv/presentation";
import { WorkspaceNav } from "./workspace-nav";

type ProjectSummary = {
  name: string;
  project_type: string;
  location: string;
  area_value: number;
  area_unit: string;
} | null;

export function ProjectShell({
  actor,
  task,
  project,
  roundSequence,
  active,
  children,
}: {
  actor: { displayName: string; role: BusinessRole };
  task: {
    id: string;
    system: string;
    system_version: string;
    stage: string;
  };
  project: ProjectSummary;
  roundSequence: number;
  active: "overview" | "materials" | "review" | "opinion";
  children: ReactNode;
}) {
  const tabs = [
    { label: "本轮任务概览", href: `/tasks/${task.id}`, key: "overview" },
    {
      label: "本轮材料",
      href: `/tasks/${task.id}/materials`,
      key: "materials",
    },
    { label: "审核与复核", href: `/tasks/${task.id}/review`, key: "review" },
    { label: "意见与提交", href: `/tasks/${task.id}/opinion`, key: "opinion" },
  ] as const;
  const declaredScope = [task.system, task.system_version]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen bg-[#f4faf8] text-[#112b25]">
      <header className="flex h-[72px] items-center justify-between border-b border-[#e4edeb] bg-white px-5 md:px-9">
        <Link
          href="/welcome"
          className="flex items-center gap-3 whitespace-nowrap font-bold"
        >
          <Image src="/images/certiscope-mark.png" alt="" width={38} height={38} className="object-contain" />
          <span className="text-[22px] tracking-tight">Certi<span className="text-[#31951f]">Scope</span></span>
          <span className="hidden text-base md:inline">绿色建筑审核</span>
        </Link>
        <div className="hidden h-11 w-[440px] items-center gap-3 rounded-xl bg-[#f3f6f6] px-4 text-[#93a1aa] lg:flex">
          <Search size={20} />
          <span>搜索项目、条款、证据或文档…</span>
        </div>
        <div className="flex items-center gap-5 text-[#5d7181]">
          <Bell size={21} />
          <span className="hidden text-sm sm:inline">{userDisplayName(actor.displayName, actor.role)}</span>
        </div>
      </header>

      <div className="materials-layout grid md:grid-cols-[184px_minmax(0,1fr)]">
        <WorkspaceNav role={actor.role} active="tasks" />
        <main className="min-w-0 p-3 md:p-4">
          <div className="mx-auto max-w-[1370px]">
            <section
              className="materials-project-hero relative overflow-hidden rounded-[22px] px-6 py-6 md:px-7"
              style={{
                background:
                  '#e9f8f4 url("/images/dashboard-hero.png") center 47% / cover no-repeat',
              }}
            >
              <div className="relative z-10">
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 text-sm text-[#506d64] hover:underline"
                >
                  <ArrowLeft size={17} /> 返回项目中心
                </Link>
                <h1 className="mt-4 text-3xl font-bold md:text-[42px]">
                  {project ? projectDisplayName(project.name) : "项目"} · GV 审核任务
                </h1>
                <p className="mt-2 text-sm text-[#5f7180] md:text-lg">
                  {declaredScope || "认证体系与版本待核对"} · LT / Green Vehicles ·{" "}
                  {task.stage || "审核阶段待核对"} · 第 {roundSequence} 轮
                </p>
                <div className="mt-5 flex flex-wrap gap-x-7 gap-y-2 text-sm text-[#536777] md:text-base">
                  <span className="inline-flex items-center gap-2">
                    <MapPin size={18} />
                    {project ? projectDisplayValue(project.location) : "地点待核对"}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Building2 size={18} />
                    {project ? projectDisplayValue(project.project_type) : "类型待核对"}
                  </span>
                  <span>
                    {project
                      ? `${project.area_value} ${project.area_unit}`
                      : "面积待核对"}
                  </span>
                  <span className="inline-flex items-center gap-2 text-[#0a7d53]">
                    <Leaf size={18} /> LT · Green Vehicles
                  </span>
                </div>
              </div>
            </section>

            <nav
              aria-label="任务页面"
              className="mt-2 flex gap-8 overflow-x-auto rounded-2xl bg-white px-6 text-sm text-[#73828f] md:text-base"
            >
              {tabs.map((tab) => {
                const className = `shrink-0 py-4 ${active === tab.key ? "border-b-[3px] border-[#129262] font-bold text-[#087b52]" : "hover:text-[#087c53]"}`;
                return <Link key={tab.key} href={tab.href} aria-current={active === tab.key ? "page" : undefined} className={className}>{tab.label}</Link>;
              })}
            </nav>
            <div className="mt-4">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
