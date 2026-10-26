import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { decisionNeedsReconfirmation } from "@/lib/gv/decision-freshness";
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase, task, actor } = await requireTaskAccess(taskId, true);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure("FORBIDDEN", "仅当前审核员可提交专业意见。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const body = (await request.json()) as Record<string, unknown>;
    if (body.roundId !== task.current_round_id) {
      const result = failure("CONFLICT", "轮次已变化，请刷新页面。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: round } = await supabase.from("task_rounds").select("scope_confirmed_at").eq("id", task.current_round_id ?? "").maybeSingle();
    if (!round?.scope_confirmed_at) {
      const result = failure("CONFLICT", "请先确认本轮审核范围。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: latestRun } = await supabase.from("gv_processing_runs")
      .select("created_at, scope_confirmed_at").eq("round_id", task.current_round_id ?? "")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latestRun && latestRun.scope_confirmed_at === round.scope_confirmed_at) {
      const { data: newerFact } = await supabase.from("gv_fact_confirmations").select("created_at")
        .eq("round_id", task.current_round_id ?? "").eq("scope_confirmed_at", round.scope_confirmed_at)
        .gt("created_at", latestRun.created_at).limit(1).maybeSingle();
      if (newerFact) {
        const result = failure("CONFLICT", "人工事实已更新，请重新运行规则计算后提交意见。");
        return NextResponse.json(result, { status: actionStatus(result) });
      }
    }
    const [{ data: decisions, error: decisionError }, { data: confirmations, error: confirmationError }] = await Promise.all([
      supabase.from("gv_rule_decisions").select("rule_code, created_at").eq("round_id", task.current_round_id ?? "")
        .eq("scope_confirmed_at", round.scope_confirmed_at).order("created_at", { ascending: false }),
      supabase.from("gv_fact_confirmations").select("field_key, created_at").eq("round_id", task.current_round_id ?? "")
        .eq("scope_confirmed_at", round.scope_confirmed_at),
    ]);
    if (decisionError || confirmationError) throw decisionError ?? confirmationError;
    const latestDecisions = new Map<string, string>();
    for (const item of decisions ?? []) if (!latestDecisions.has(item.rule_code)) latestDecisions.set(item.rule_code, item.created_at);
    const stale = gvRules.filter((rule) => ruleApplies(rule.code, task.incentive_path, task.facility_path) &&
      latestDecisions.has(rule.code) && decisionNeedsReconfirmation(rule.code, latestDecisions.get(rule.code)!, confirmations ?? []));
    if (stale.length) {
      const result = failure("CONFLICT", `${stale.map((rule) => rule.code).join("、")} 的事实已修改，请重新确认判断后提交意见。`);
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data, error } = await supabase.rpc("submit_gv_opinion", {
      p_task_id: taskId, p_round_id: task.current_round_id,
      p_english: String(body.english ?? ""), p_chinese: String(body.chinese ?? ""),
    });
    if (error) {
      const known = ["仍有适用规则未保存判断", "请先确认本轮范围", "英文意见和中文解释均须填写", "申报路径尚未确认", "当前任务不可提交", "人工事实已更新", "事实已修改，须重新确认规则判断"];
      const message = known.find((part) => error.message.includes(part));
      const result = failure("CONFLICT", message ? error.message : "提交失败，请刷新后核对规则判断和轮次状态。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    return NextResponse.json(success(data, "本轮专业意见已提交，材料已锁定。"));
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "意见提交暂时失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
