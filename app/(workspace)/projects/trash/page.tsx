import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { TrashList } from "./trash-list";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { requireRole } from "@/lib/supabase/auth";

export const instant = false;

export default async function ProjectTrashPage() {
  await connection();
  let context: Awaited<ReturnType<typeof requireRole>>;
  try {
    context = await requireRole("admin");
  } catch {
    redirect("/projects");
  }
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    context.supabase.from("projects")
      .select("id, name, deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
    context.supabase.from("gv_tasks")
      .select("id, project_id, deleted_at, projects(name, deleted_at)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false }),
  ]);
  const items = [
    ...(projects ?? []).filter((item) => item.deleted_at).map((item) => ({
      id: item.id, kind: "project" as const, name: item.name, deletedAt: item.deleted_at!,
    })),
    ...(tasks ?? []).filter((item) => {
      const project = Array.isArray(item.projects) ? item.projects[0] : item.projects;
      return item.deleted_at && !project?.deleted_at;
    }).map((item) => {
      const project = Array.isArray(item.projects) ? item.projects[0] : item.projects;
      return { id: item.id, kind: "task" as const, name: "LT · Green Vehicles 审核", projectName: project?.name, deletedAt: item.deleted_at! };
    }),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return (
    <WorkspaceFrame actor={context.actor} active="projects">
      <div className="mx-auto max-w-[1100px]">
        <Link href="/projects" className="text-sm font-semibold text-[#0b7950]">← 返回项目中心</Link>
        <h1 className="mt-4 text-3xl font-bold">项目回收站</h1>
        <p className="mt-2 text-sm text-[#647c6f]">只有审核管理员可以查看和恢复。项目与任务的审核记录、原始材料仍完整保留。</p>
        <TrashList items={items} />
        <p className="mt-4 text-sm text-[#8a6b43]">永久删除需单独清理关联审核记录及存储原件；数据库清理方案通过审核后在此开放。</p>
      </div>
    </WorkspaceFrame>
  );
}
