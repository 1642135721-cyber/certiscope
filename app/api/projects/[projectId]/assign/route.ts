import { NextResponse } from "next/server";
import { saveMaterialVersion } from "@/lib/gv/materials";
import { isRuleReferenceDocument } from "@/lib/gv/project-intake";
import { AuthorizationError, requireRole } from "@/lib/supabase/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { supabase, actor } = await requireRole("admin");
    const body = (await request.json()) as {
      category?: string;
      auditorId?: string;
    };
    if (!body.category || !body.auditorId)
      return NextResponse.json(
        { ok: false, message: "请选择类别和审核员。" },
        { status: 400 },
      );
    const { data, error } = await supabase.rpc("assign_project_category", {
      p_project_id: projectId,
      p_category_code: body.category,
      p_auditor_id: body.auditorId,
    });
    if (error || !Array.isArray(data) || !data[0])
      return NextResponse.json(
        { ok: false, message: error?.message ?? "分配失败。" },
        { status: 400 },
      );
    const taskId = data[0].task_id as string | null;
    const roundId = data[0].round_id as string | null;
    let synced = 0;
    let failed = 0;
    if (body.category === "LT" && taskId && roundId) {
      const { data: files } = await supabase
        .from("project_source_files")
        .select("id, file_name, storage_path")
        .eq("project_id", projectId)
        .is("removed_at", null);
      for (const source of (files ?? []).filter(
        (file) => !isRuleReferenceDocument(file.file_name),
      )) {
        const { data: blob, error: downloadError } = await supabase.storage
          .from("gv-intake")
          .download(source.storage_path);
        if (downloadError || !blob) {
          failed++;
          continue;
        }
        const file = new File([await blob.arrayBuffer()], source.file_name, {
          type: blob.type,
        });
        const result = await saveMaterialVersion(supabase, {
          taskId,
          roundId,
          file,
          purpose: "项目建档材料",
          sourceKind: "original",
          requestKey: `project-source-${source.id}`,
          actorId: actor.id,
        });
        if (result.ok) synced++;
        else failed++;
      }
    }
    return NextResponse.json({
      ok: true,
      data: { taskId, roundId, synced, failed },
      message: failed
        ? `类别已分配；${failed} 份材料同步未完成，请在任务材料页核对。`
        : "类别已分配，材料已同步。",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof AuthorizationError
            ? error.message
            : "分配失败，请稍后重试。",
      },
      { status: error instanceof AuthorizationError ? error.status : 500 },
    );
  }
}
