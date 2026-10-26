import { NextResponse } from "next/server";
import { AuthorizationError, requireRole } from "@/lib/supabase/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { supabase, actor } = await requireRole("admin");
    const body = (await request.json()) as { action?: string };
    if (body.action !== "remove" && body.action !== "restore")
      return NextResponse.json({ ok: false, message: "操作无效。" }, { status: 400 });
    const { data: task, error: readError } = await supabase
      .from("gv_tasks")
      .select("id, project_id, deleted_at, projects(deleted_at)")
      .eq("id", taskId)
      .maybeSingle();
    if (readError || !task)
      return NextResponse.json({ ok: false, message: "审核任务不存在。" }, { status: 404 });
    const project = Array.isArray(task.projects) ? task.projects[0] : task.projects;
    if (project?.deleted_at)
      return NextResponse.json({ ok: false, message: "请先恢复所属项目。" }, { status: 409 });
    if (body.action === "remove" && task.deleted_at)
      return NextResponse.json({ ok: false, message: "任务已经在回收站。" }, { status: 409 });
    if (body.action === "restore") {
      if (!task.deleted_at)
        return NextResponse.json({ ok: false, message: "任务尚未移入回收站。" }, { status: 409 });
      const { count } = await supabase.from("gv_tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", task.project_id).is("deleted_at", null);
      if (count)
        return NextResponse.json({ ok: false, message: "所属项目已有进行中的 GV 任务，无法同时恢复旧任务。" }, { status: 409 });
    }
    const { data, error } = await supabase
      .from("gv_tasks")
      .update({
        deleted_at: body.action === "remove" ? new Date().toISOString() : null,
        deleted_by: body.action === "remove" ? actor.id : null,
      })
      .eq("id", taskId)
      .select("id")
      .single();
    if (error || !data)
      return NextResponse.json({ ok: false, message: "任务状态更新失败，请重试。" }, { status: 503 });
    return NextResponse.json({ ok: true, message: body.action === "remove" ? "任务已移入回收站。" : "任务已恢复。" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof AuthorizationError ? error.message : "操作失败，请重试。" },
      { status: error instanceof AuthorizationError ? error.status : 500 },
    );
  }
}
