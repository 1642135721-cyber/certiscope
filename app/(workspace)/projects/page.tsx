import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import {
  ProjectDirectory,
  type ProjectDirectoryRow,
} from "@/components/workspace/project-directory";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { projectDisplayName, projectDisplayValue } from "@/lib/gv/presentation";
import { showcaseProjects, showcaseTasks } from "@/lib/gv/showcase";
import { listAccessibleTasks } from "@/lib/gv/task-queries";
import { getCurrentActor } from "@/lib/supabase/auth";

export const instant = false;

export default async function ProjectsPage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try {
    context = await getCurrentActor();
  } catch {
    redirect("/login");
  }
  if (context.actor.role === "rule_maintainer") redirect("/rules");
  const tasks = await listAccessibleTasks(context.supabase).catch(() => []);
  const { data: projects } = await context.supabase
    .from("projects")
    .select("id, name, location, project_type, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const { data: categoryAssignments } = await context.supabase
    .from("project_category_assignments")
    .select("project_id, category_code");
  const roundIds = tasks
    .map((task) => task.current_round_id)
    .filter((id): id is string => Boolean(id));
  const { data: rounds } = roundIds.length
    ? await context.supabase
        .from("task_rounds")
        .select("id, sequence, status, source, scope_confirmed_at")
        .in("id", roundIds)
    : { data: [] };
  const roundById = new Map((rounds ?? []).map((round) => [round.id, round]));
  const realRows: ProjectDirectoryRow[] = (projects ?? []).map((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const assigned = (categoryAssignments ?? []).filter(
      (item) => item.project_id === project.id,
    );
    const task = projectTasks[0];
    const round = roundById.get(task?.current_round_id ?? "");
    const status = !task
      ? assigned.length
        ? "类别已分配"
        : "待分配"
      : task.archived_at
        ? "已归档"
        : round?.status === "submitted"
          ? "意见已提交"
          : round?.status === "returned"
            ? "已退回复核"
            : round?.source === "supplement"
              ? "补件核对"
              : !round?.scope_confirmed_at
                ? "范围待确认"
                : "审核中";
    return {
      id: project.id,
      name: projectDisplayName(project.name),
      location: projectDisplayValue(project.location),
      stage: !task
        ? assigned.length
          ? "项目已建档 · 材料核对"
          : "项目已建档 · 待派单"
        : round?.source === "supplement"
          ? "补件核对"
          : `第 ${round?.sequence ?? 1} 轮 · ${task.stage}`,
      status,
      tasks: assigned.length
        ? `${assigned.length} 类 · ${assigned.map((item) => item.category_code).join("、")}${projectTasks.length ? " · GV 可审核" : ""}`
        : projectTasks.length
          ? `${projectTasks.length} 项 · LT / Green Vehicles`
          : "尚未分配类别",
      latest: !task
        ? assigned.length
          ? "类别已分配，项目材料可查"
          : "项目已建立，等待分配审核"
        : round?.status === "submitted"
          ? "审核员意见已提交，等待管理员处理"
          : round?.source === "supplement"
            ? "请核对补件要求及本轮材料"
            : !round?.scope_confirmed_at
              ? "请核对本轮审核范围"
              : "信用项审核正在处理",
      time: new Date(project.created_at).toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
      }),
      attention: !task ? (assigned.length ? "材料核对" : "待派单") : status,
      href: `/projects/${project.id}`,
    };
  });
  const sampleRows: ProjectDirectoryRow[] = showcaseProjects
    .filter((project) => !realRows.some((row) => row.name === project.name))
    .map((project) => {
      const projectTasks = showcaseTasks.filter(
        (task) => task.projectId === project.id,
      );
      return {
        id: `sample-${project.id}`,
        name: project.name,
        location: project.location,
        stage: project.phase,
        status: project.status,
        tasks: `${projectTasks.length} 项 · ${[...new Set(projectTasks.map((task) => task.category))].join("、")}`,
        latest: project.event,
        time: project.time,
        attention:
          project.status === "补件已到" ? "待核对补件" : project.status,
        href: `/showcase/projects/${project.id}`,
      };
    });
  return (
    <WorkspaceFrame actor={context.actor} active="projects">
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#168358]">项目档案</p>
            <h1 className="mt-1 text-3xl font-bold">项目中心</h1>
            <p className="mt-2 text-[#688176]">
              查看项目资料、LEED 类别任务、范围确认和最新状态。
            </p>
          </div>
          {context.actor.role === "admin" && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/projects/trash"
                className="rounded-xl border border-[#b7d5c2] px-5 py-3 font-semibold text-[#0b754c]"
              >
                项目回收站
              </Link>
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 rounded-xl bg-[#0b754c] px-5 py-3 font-semibold text-white"
              >
                <Plus size={19} /> 新建项目
              </Link>
            </div>
          )}
        </div>
        <ProjectDirectory rows={[...realRows, ...sampleRows]} />
      </div>
    </WorkspaceFrame>
  );
}
