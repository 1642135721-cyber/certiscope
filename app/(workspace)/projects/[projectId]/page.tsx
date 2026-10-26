import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminTrashControls } from "@/components/workspace/admin-trash-controls";
import { CategoryAssignment } from "@/components/workspace/category-assignment";
import {
  ProjectDetailPanels,
  type ProjectMaterialItem,
  type ProjectTaskItem,
} from "@/components/workspace/project-detail-panels";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { projectDisplayName, projectDisplayValue } from "@/lib/gv/presentation";
import { listAccessibleTasks, pathLabel } from "@/lib/gv/task-queries";
import { getCurrentActor } from "@/lib/supabase/auth";

export const instant = false;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await connection();
  const { projectId } = await params;
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try {
    context = await getCurrentActor();
  } catch {
    redirect("/login");
  }
  if (context.actor.role === "rule_maintainer") notFound();
  const tasks = (await listAccessibleTasks(context.supabase)).filter(
    (task) => task.project_id === projectId,
  );
  const { data: project } = await context.supabase
    .from("projects")
    .select(
      "id, name, project_type, location, area_value, area_unit, target_level, created_at, confirmed_at",
    )
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();
  project.name = projectDisplayName(project.name);
  project.project_type = projectDisplayValue(project.project_type);
  project.location = projectDisplayValue(project.location);
  project.target_level = projectDisplayValue(project.target_level);
  const roundIds = tasks
    .map((task) => task.current_round_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: rounds }, { data: files }] = await Promise.all([
    roundIds.length
      ? context.supabase
          .from("task_rounds")
          .select("id, sequence, status, scope_confirmed_at, source")
          .in("id", roundIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? context.supabase
          .from("material_versions")
          .select("id, task_id, file_name, version, parse_status")
          .in("round_id", roundIds)
          .is("removed_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const [{ data: projectFiles }, { data: assignments }, { data: auditors }] =
    await Promise.all([
      context.supabase
        .from("project_source_files")
        .select("id, file_name, parse_status, created_at")
        .eq("project_id", projectId)
        .is("removed_at", null)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("project_category_assignments")
        .select("category_code, auditor_id, assigned_at")
        .eq("project_id", projectId),
      context.actor.role === "admin"
        ? context.supabase
            .from("user_profiles")
            .select("id, display_name")
            .eq("role", "auditor")
            .eq("active", true)
            .order("display_name")
        : Promise.resolve({ data: [] }),
    ]);
  const [{ data: runs }, { data: opinions }, { data: summaries }] =
    await Promise.all([
      roundIds.length
        ? context.supabase
            .from("gv_processing_runs")
            .select("round_id, status, created_at")
            .in("round_id", roundIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      roundIds.length
        ? context.supabase
            .from("gv_round_opinions")
            .select("round_id")
            .in("round_id", roundIds)
        : Promise.resolve({ data: [] }),
      roundIds.length
        ? context.supabase
            .from("gv_admin_summaries")
            .select("round_id, confirmed, created_at")
            .in("round_id", roundIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
  const roundById = new Map((rounds ?? []).map((round) => [round.id, round]));
  const latestRunByRound = new Map<string, { status: string }>();
  for (const run of runs ?? [])
    if (!latestRunByRound.has(run.round_id))
      latestRunByRound.set(run.round_id, run);
  const opinionRoundIds = new Set(
    (opinions ?? []).map((opinion) => opinion.round_id),
  );
  const latestSummaryByRound = new Map<string, { confirmed: boolean }>();
  for (const summary of summaries ?? [])
    if (!latestSummaryByRound.has(summary.round_id))
      latestSummaryByRound.set(summary.round_id, summary);
  const taskItems: ProjectTaskItem[] = tasks.map((task) => {
    const round = roundById.get(task.current_round_id ?? "");
    const roundId = round?.id ?? "";
    return {
      id: task.id,
      category: "LT",
      credit: "Green Vehicles · 绿色车辆",
      round: `第 ${round?.sequence ?? 1} 轮 · ${task.stage || "阶段待核"} · ${pathLabel(task)}`,
      status: task.archived_at
        ? "已归档"
        : round?.status === "submitted"
          ? "意见已提交"
          : round?.status === "returned"
            ? "已退回复核"
            : round?.source === "supplement"
              ? "补件核对"
              : round?.scope_confirmed_at
                ? "审核中"
                : "范围待确认",
      href: `/tasks/${task.id}`,
      scopeHref: `/tasks/${task.id}#scope-confirmation`,
      materialHref: `/tasks/${task.id}/materials`,
      scopeConfirmed: Boolean(round?.scope_confirmed_at),
      aiComplete: latestRunByRound.get(roundId)?.status === "complete",
      opinionSubmitted: opinionRoundIds.has(roundId),
      summaryConfirmed: latestSummaryByRound.get(roundId)?.confirmed === true,
      archived: Boolean(task.archived_at),
    };
  });
  const materials: ProjectMaterialItem[] = [
    ...(projectFiles ?? []).map((file) => ({
      id: file.id,
      name: file.file_name,
      version: "项目原始材料",
      task: "项目档案",
      status: file.parse_status === "extracted" ? "已提取" : "待核对",
      href: `/api/projects/${projectId}/files/${file.id}`,
      kind: "source" as const,
    })),
    ...(files ?? []).map((file) => ({
      id: file.id,
      name: file.file_name,
      version: `第 ${file.version} 版`,
      task: "LT · Green Vehicles",
      status: file.parse_status === "extracted" ? "已解析" : "待核对",
      href: `/tasks/${file.task_id}/materials`,
      kind: "version" as const,
    })),
  ];
  const facts: [string, string][] = [
    ["项目名称", project.name],
    ["项目类型", project.project_type],
    ["项目地点", project.location],
    ["总建筑面积", `${project.area_value} ${project.area_unit}`],
    ["目标／申报等级", project.target_level],
    [
      "认证体系",
      tasks[0] ? `${tasks[0].system} ${tasks[0].system_version}` : "待确认",
    ],
    ["信用项任务", `${tasks.length} 项`],
    [
      "建档时间",
      new Date(project.created_at).toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
      }),
    ],
  ];
  const latest = taskItems.some((task) => task.status === "补件核对")
    ? "补件新轮已开启，请逐项核对上轮要求与本轮材料"
    : taskItems.some((task) => task.status === "意见已提交")
      ? "审核员意见已提交，等待管理员处理"
      : taskItems.some((task) => !task.scopeConfirmed)
        ? "请核对本轮审核范围，再进入信用项审核任务"
        : taskItems.length
          ? "本轮信用项任务正在处理中"
          : "项目档案已建立，等待分配审核任务";
  return (
    <WorkspaceFrame actor={context.actor} active="projects">
      <div className="mx-auto max-w-[1260px]">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm text-[#547466]"
        >
          <ArrowLeft size={17} /> 返回项目中心
        </Link>
        <section
          className="mt-3 rounded-[22px] bg-[#e9f8f4] p-6"
          style={{
            background:
              'linear-gradient(90deg, #e9f8f4 10%, rgba(233,248,244,.86) 47%, rgba(233,248,244,.06) 100%), url("/images/dashboard-hero.png") center / cover',
          }}
        >
          <p className="text-sm font-semibold text-[#17845b]">项目概况与进度</p>
          <h1 className="mt-1 text-[30px] font-bold">{project.name}</h1>
          <p className="mt-2 text-sm text-[#536e65]">
            {project.project_type} · {project.location} · {project.area_value}{" "}
            {project.area_unit} · {project.target_level}
          </p>
        </section>
        {context.actor.role === "admin" && (
          <CategoryAssignment
            projectId={projectId}
            auditors={auditors ?? []}
            assignments={assignments ?? []}
          />
        )}
        <ProjectDetailPanels
          facts={facts}
          tasks={taskItems}
          materials={materials}
          canManageMaterials={context.actor.role === "admin"}
          projectId={projectId}
          latest={latest}
          assignedCategories={(assignments ?? []).map(
            (item) => item.category_code,
          )}
          editableProject={context.actor.role === "admin" ? {
            id: projectId,
            name: project.name,
            projectType: project.project_type,
            location: project.location,
            areaValue: Number(project.area_value),
            areaUnit: project.area_unit,
            targetLevel: project.target_level,
          } : undefined}
        />
        {context.actor.role === "admin" && (
          <AdminTrashControls
            project={{ id: projectId, name: project.name }}
            tasks={taskItems.map((item) => ({
              id: item.id,
              label: `${item.category} · ${item.credit}`,
            }))}
          />
        )}
      </div>
    </WorkspaceFrame>
  );
}
