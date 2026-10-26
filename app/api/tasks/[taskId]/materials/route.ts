import { NextResponse } from "next/server";
import { actionStatus, failure, readIdempotencyKey, success } from "@/lib/gv/action-result";
import { recordAuditEvent } from "@/lib/gv/audit-events";
import { saveMaterialVersion } from "@/lib/gv/materials";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase } = await requireTaskAccess(taskId);
    const { data, error } = await supabase.from("material_versions")
      .select("id, material_id, round_id, version, file_name, mime_type, extension, sha256, byte_size, source_kind, converted_from_version_id, conversion_note, parse_status, parse_reason, created_at, materials(purpose)")
      .eq("task_id", taskId).is("removed_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(success(data ?? [], "材料列表已加载"));
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "材料列表暂时无法读取。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase, actor, task } = await requireTaskAccess(taskId, true);
    const requestKey = readIdempotencyKey(request);
    if (!requestKey) {
      const result = failure("VALIDATION", "缺少请求标识，请重新选择文件后重试。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const form = await request.formData();
    const file = form.get("file");
    const roundId = String(form.get("roundId") ?? "");
    if (!(file instanceof File) || !roundId || roundId !== task.current_round_id) {
      const result = failure("CONFLICT", "文件或当前轮次不匹配，请刷新后重试。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const sourceKind = String(form.get("sourceKind") ?? "original");
    if (!["original", "converted", "screenshot"].includes(sourceKind)) {
      const result = failure("VALIDATION", "材料来源类型无效。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const result = await saveMaterialVersion(supabase, {
      taskId,
      roundId,
      file,
      purpose: String(form.get("purpose") ?? ""),
      materialId: String(form.get("materialId") ?? "") || undefined,
      sourceKind: sourceKind as "original" | "converted" | "screenshot",
      convertedFromVersionId: String(form.get("convertedFromVersionId") ?? "") || undefined,
      conversionNote: String(form.get("conversionNote") ?? "") || undefined,
      requestKey,
      actorId: actor.id,
    });
    await recordAuditEvent(supabase, { actorId: actor.id, type: "upload", success: result.ok, taskId, roundId, versionId: result.ok ? result.data.versionId : undefined, errorCode: result.ok ? undefined : result.code });
    return NextResponse.json(result, { status: actionStatus(result) });
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "材料处理失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
