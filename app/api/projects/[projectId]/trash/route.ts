import { NextResponse } from "next/server";
import { AuthorizationError, requireRole } from "@/lib/supabase/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { supabase, actor } = await requireRole("admin");
    const body = (await request.json()) as { action?: string };
    if (body.action !== "remove" && body.action !== "restore")
      return NextResponse.json({ ok: false, message: "操作无效。" }, { status: 400 });
    const { data: project, error: readError } = await supabase
      .from("projects")
      .select("id, deleted_at")
      .eq("id", projectId)
      .maybeSingle();
    if (readError || !project)
      return NextResponse.json({ ok: false, message: "项目不存在。" }, { status: 404 });
    if (body.action === "remove" && project.deleted_at)
      return NextResponse.json({ ok: false, message: "项目已经在回收站。" }, { status: 409 });
    if (body.action === "restore" && !project.deleted_at)
      return NextResponse.json({ ok: false, message: "项目尚未移入回收站。" }, { status: 409 });
    const { data, error } = await supabase
      .from("projects")
      .update({
        deleted_at: body.action === "remove" ? new Date().toISOString() : null,
        deleted_by: body.action === "remove" ? actor.id : null,
      })
      .eq("id", projectId)
      .select("id")
      .single();
    if (error || !data)
      return NextResponse.json({ ok: false, message: "项目状态更新失败，请重试。" }, { status: 503 });
    return NextResponse.json({ ok: true, message: body.action === "remove" ? "项目已移入回收站。" : "项目已恢复。" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof AuthorizationError ? error.message : "操作失败，请重试。" },
      { status: error instanceof AuthorizationError ? error.status : 500 },
    );
  }
}
