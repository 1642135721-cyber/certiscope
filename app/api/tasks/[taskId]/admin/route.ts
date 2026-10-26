import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase, task, actor } = await requireTaskAccess(taskId, true);
    if (actor.role !== "admin") {
      const result = failure("FORBIDDEN", "仅审核管理员可处理汇总、退回、补件和归档。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const body = await request.json() as Record<string, unknown>;
    if (body.roundId !== task.current_round_id) {
      const result = failure("CONFLICT", "轮次已变化，请刷新页面。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    if (body.mode === "summary") {
      const english = String(body.english ?? "").trim();
      const chinese = String(body.chinese ?? "").trim();
      if (!english || !chinese) {
        const result = failure("VALIDATION", "英文汇总与中文解释均须填写。");
        return NextResponse.json(result, { status: actionStatus(result) });
      }
      const { data, error } = await supabase.from("gv_admin_summaries").insert({
        task_id: taskId, round_id: task.current_round_id, english_summary: english,
        chinese_summary: chinese, confirmed: body.confirmed === true, created_by: actor.id,
      }).select("id").single();
      if (error) {
        const result = failure("CONFLICT", "请确认审核员已提交当前轮次意见后再保存汇总。");
        return NextResponse.json(result, { status: actionStatus(result) });
      }
      return NextResponse.json(success(data, "管理员汇总已保存。"));
    }
    if (body.mode === "action") {
      const action = String(body.action ?? "");
      const reason = String(body.reason ?? "").trim();
      if (!["return", "supplement", "archive"].includes(action) || !reason) {
        const result = failure("VALIDATION", "请选择处理方式并填写依据。");
        return NextResponse.json(result, { status: actionStatus(result) });
      }
      const { data, error } = await supabase.rpc("admin_manage_gv_task", {
        p_task_id: taskId, p_round_id: task.current_round_id, p_action: action, p_reason: reason,
      });
      if (error) {
        const result = failure("CONFLICT", error.message.includes("仅在汇总已确认") ? "归档前须确认管理员汇总，且审核员意见中没有待跟进事项。" : "处理失败，请核对轮次状态并刷新页面。 ");
        return NextResponse.json(result, { status: actionStatus(result) });
      }
      return NextResponse.json(success(data, action === "supplement" ? "补件新轮已开启。" : action === "return" ? "已退回审核员复核。" : "任务已归档。"));
    }
    const result = failure("VALIDATION", "处理方式无效。");
    return NextResponse.json(result, { status: actionStatus(result) });
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "管理员处理暂时失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
