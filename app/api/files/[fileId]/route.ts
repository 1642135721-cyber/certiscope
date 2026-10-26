import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: file } = await supabase.from("material_versions")
      .select("id, task_id, storage_path, file_name, mime_type, created_at")
      .eq("id", fileId).maybeSingle();
    if (!file) throw new AuthorizationError("无法访问该原件。", 403);
    const context = await requireTaskAccess(file.task_id);
    if (context.readonly) {
      const { data: history } = await context.supabase.from("task_participants")
        .select("joined_at, left_at")
        .eq("task_id", file.task_id).eq("user_id", context.actor.id);
      const withinParticipation = history?.some((entry) =>
        file.created_at >= entry.joined_at && (!entry.left_at || file.created_at <= entry.left_at),
      );
      if (!withinParticipation) throw new AuthorizationError("无法访问该原件。", 403);
    }
    const { data, error } = await context.supabase.storage.from("gv-materials")
      .createSignedUrl(file.storage_path, 60);
    if (error || !data?.signedUrl) {
      const result = failure("RETRYABLE", "原件暂时无法读取，请稍后重试。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    return NextResponse.json(success({ url: data.signedUrl, fileName: file.file_name, mimeType: file.mime_type, expiresInSeconds: 60 }, "原件读取地址已生成"));
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "原件读取失败。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
