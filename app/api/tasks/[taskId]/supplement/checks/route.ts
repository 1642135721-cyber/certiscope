import { NextResponse } from "next/server";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase, actor, task, readonly } = await requireTaskAccess(taskId);
    if (actor.role !== "auditor" || actor.id !== task.current_auditor_id || readonly) return NextResponse.json({ ok: false, message: "当前账号不能核对本轮补件。" }, { status: 403 });
    const { data: round } = await supabase.from("task_rounds").select("id, source, status").eq("id", task.current_round_id ?? "").maybeSingle();
    if (!round || round.source !== "supplement" || !["open", "returned"].includes(round.status)) return NextResponse.json({ ok: false, message: "当前轮次不接受补件核对。" }, { status: 409 });
    const body = await request.json() as { index?: number; text?: string; verdict?: string; note?: string };
    if (!Number.isInteger(body.index) || (body.index ?? -1) < 0 || !body.text?.trim() || !["responded", "still_missing"].includes(body.verdict ?? "")) return NextResponse.json({ ok: false, message: "请逐项选择核对结果。" }, { status: 400 });
    const { error } = await supabase.from("gv_supplement_checks").upsert({ task_id: taskId, round_id: round.id, requirement_index: body.index, requirement_text: body.text.trim(), verdict: body.verdict, note: body.note?.trim() ?? "", saved_by: actor.id, saved_at: new Date().toISOString() }, { onConflict: "round_id,requirement_index" });
    if (error) throw error;
    return NextResponse.json({ ok: true, message: "补件核对已保存。" });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof AuthorizationError ? error.message : "补件核对暂时无法保存。" }, { status: error instanceof AuthorizationError ? error.status : 500 });
  }
}
