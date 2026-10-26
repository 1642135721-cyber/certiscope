import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { supabase, task, actor } = await requireTaskAccess(taskId, true);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure("FORBIDDEN", "仅当前审核员可保存判断。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const rule = gvRules.find((item) => item.code === body.ruleCode);
    const choice = String(body.decision ?? "");
    const mapped = {
      pass: { factCheck: "confirmed", decision: "pass" },
      fail: { factCheck: "confirmed", decision: "fail" },
      supplement: { factCheck: "missing", decision: "supplement" },
      conflict: { factCheck: "conflict", decision: "defer" },
      defer: { factCheck: "unclear", decision: "defer" },
      not_applicable: { factCheck: "unclear", decision: "not_applicable" },
    }[
      choice as
        | "pass"
        | "fail"
        | "supplement"
        | "conflict"
        | "defer"
        | "not_applicable"
    ];
    const rationale = String(body.rationale ?? "").trim();
    const { data: round } = await supabase
      .from("task_rounds")
      .select("id, status, scope_confirmed_at")
      .eq("id", task.current_round_id ?? "")
      .maybeSingle();
    if (
      !rule ||
      !round?.scope_confirmed_at ||
      !["open", "returned"].includes(round.status) ||
      !mapped ||
      (choice !== "pass" && !rationale) ||
      !ruleApplies(rule.code, task.incentive_path, task.facility_path)
    ) {
      const result = failure(
        "VALIDATION",
        "请先确认本轮范围并选择审核决定；非支持结论须填写依据。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data, error } = await supabase
      .from("gv_rule_decisions")
      .insert({
        task_id: taskId,
        round_id: round.id,
        rule_code: rule.code,
        scope_confirmed_at: round.scope_confirmed_at,
        fact_check: mapped.factCheck,
        decision: mapped.decision,
        rationale: rationale || "审核员选择支持符合；未填写补充说明。",
        created_by: actor.id,
      })
      .select("id, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json(success(data, "判断已保存并保留修改记录。"));
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "判断保存失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
