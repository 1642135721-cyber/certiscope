import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { supabase, actor, task } = await requireTaskAccess(taskId, true);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure(
        "FORBIDDEN",
        "仅当前审核员可清除本轮 AI 初审展示。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: round, error: roundError } = await supabase
      .from("task_rounds")
      .select("id, status, scope_confirmed_at")
      .eq("id", task.current_round_id ?? "")
      .maybeSingle();
    if (roundError) throw roundError;
    if (
      !round?.scope_confirmed_at ||
      !["open", "returned"].includes(round.status)
    ) {
      const result = failure("CONFLICT", "当前轮次不可清除初审，请刷新页面。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: latest, error: readError } = await supabase
      .from("gv_processing_runs")
      .select("id, scope_confirmed_at, cleared_at")
      .eq("task_id", taskId)
      .eq("round_id", round.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    if (
      !latest ||
      latest.scope_confirmed_at !== round.scope_confirmed_at ||
      latest.cleared_at
    ) {
      const result = failure("CONFLICT", "本轮没有可清除的 AI 初审结果。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: cleared, error: clearError } = await supabase
      .from("gv_processing_runs")
      .update({ cleared_at: new Date().toISOString(), cleared_by: actor.id })
      .eq("id", latest.id)
      .eq("task_id", taskId)
      .eq("round_id", round.id)
      .is("cleared_at", null)
      .select("id")
      .maybeSingle();
    if (clearError) throw clearError;
    if (!cleared) {
      const result = failure("CONFLICT", "初审状态已变化，请刷新页面。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    return NextResponse.json(
      success(
        { id: cleared.id },
        "本轮 AI 初审已清除展示，可重新运行；历史记录及人工判断均保留。",
      ),
    );
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "清除初审失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
