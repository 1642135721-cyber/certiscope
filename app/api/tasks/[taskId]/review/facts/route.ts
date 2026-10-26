import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { fieldUnits, numericFields, type NumericField } from "@/lib/gv/rule-engine";
import type { SourceLocation } from "@/lib/gv/types";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase, task, actor } = await requireTaskAccess(taskId, true);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure("FORBIDDEN", "仅当前审核员可确认本轮事实。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const body = await request.json() as Record<string, unknown>;
    const field = String(body.fieldKey ?? "") as NumericField;
    const rawValue = body.value;
    const value = typeof rawValue === "number" || (typeof rawValue === "string" && rawValue.trim() !== "") ? Number(rawValue) : Number.NaN;
    const reason = String(body.reason ?? "").trim();
    if (!numericFields.includes(field) || !Number.isFinite(value) || value < 0 || !reason ||
      (!["normal_rate", "green_rate"].includes(field) && !Number.isInteger(value))) {
      const result = failure("VALIDATION", "请填写有效数值、单位和原件核对依据；车位和日服务数量须为整数。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: round } = await supabase.from("task_rounds")
      .select("id, status, scope_confirmed_at, selected_material_version_ids")
      .eq("id", task.current_round_id ?? "").maybeSingle();
    if (!round?.scope_confirmed_at || !["open", "returned"].includes(round.status)) {
      const result = failure("CONFLICT", "本轮范围未确认或已锁定。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const ids: string[] = round.selected_material_version_ids ?? [];
    const candidateId = String(body.candidateId ?? "");
    let source: SourceLocation;
    if (candidateId) {
      const { data: candidate } = await supabase.from("fact_candidates")
        .select("id, field_key, material_version_id, source_location")
        .eq("id", candidateId).eq("round_id", round.id).eq("field_key", field).eq("state", "candidate").maybeSingle();
      if (!candidate || !candidate.material_version_id || !ids.includes(candidate.material_version_id) || !candidate.source_location) {
        const result = failure("VALIDATION", "所选候选不属于本轮已确认材料。");
        return NextResponse.json(result, { status: actionStatus(result) });
      }
      source = candidate.source_location as SourceLocation;
    } else {
      const materialVersionId = String(body.materialVersionId ?? "");
      const location = String(body.location ?? "").trim();
      if (!ids.includes(materialVersionId) || !location) {
        const result = failure("VALIDATION", "手工修正须选择本轮原件，并写明页码、工作表或图纸位置。");
        return NextResponse.json(result, { status: actionStatus(result) });
      }
      source = { materialVersionId, note: location };
    }
    const { data, error } = await supabase.from("gv_fact_confirmations").insert({
      task_id: taskId, round_id: round.id, scope_confirmed_at: round.scope_confirmed_at,
      field_key: field, value, unit: fieldUnits[field], candidate_id: candidateId || null,
      source_location: source, reason, created_by: actor.id,
    }).select("id, created_at").single();
    if (error) throw error;
    return NextResponse.json(success(data, "事实已保存；受影响规则需重新运行初审并复核。"));
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "事实保存失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
