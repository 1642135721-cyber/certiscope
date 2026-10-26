import { NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai/qwen";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { decisionNeedsReconfirmation } from "@/lib/gv/decision-freshness";
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import type { FactCandidate, ReviewOutcome, RuleResult, SourceLocation } from "@/lib/gv/types";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

const outcomes: Record<string, ReviewOutcome> = {
  pass: "PASS", fail: "FAIL", supplement: "INSUFFICIENT_EVIDENCE", defer: "HUMAN_REVIEW_REQUIRED",
};

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase, task, actor } = await requireTaskAccess(taskId, true);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure("FORBIDDEN", "仅当前审核员可生成本轮意见草稿。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: round } = await supabase.from("task_rounds")
      .select("id, status, scope_confirmed_at").eq("id", task.current_round_id ?? "").maybeSingle();
    if (!round?.scope_confirmed_at || !["open", "returned"].includes(round.status)) {
      const result = failure("CONFLICT", "请先确认本轮范围并完成规则判断。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: decisions, error } = await supabase.from("gv_rule_decisions")
      .select("rule_code, scope_confirmed_at, fact_check, decision, rationale, created_at")
      .eq("round_id", round.id).eq("scope_confirmed_at", round.scope_confirmed_at)
      .order("created_at", { ascending: false });
    if (error) throw error;
    type DecisionRow = NonNullable<typeof decisions>[number];
    const latest = new Map<string, DecisionRow>();
    for (const item of decisions ?? []) if (!latest.has(item.rule_code)) latest.set(item.rule_code, item);
    const applicable = gvRules.filter((rule) => ruleApplies(rule.code, task.incentive_path, task.facility_path));
    if (applicable.some((rule) => !latest.has(rule.code))) {
      const result = failure("VALIDATION", "仍有适用规则未保存审核员判断，暂不能生成完整草稿。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: confirmations, error: confirmationError } = await supabase.from("gv_fact_confirmations")
      .select("field_key, value, unit, source_location, created_at").eq("round_id", round.id)
      .eq("scope_confirmed_at", round.scope_confirmed_at).order("created_at", { ascending: false });
    if (confirmationError) throw confirmationError;
    const stale = applicable.filter((rule) => decisionNeedsReconfirmation(rule.code, latest.get(rule.code)!.created_at, confirmations ?? []));
    if (stale.length) {
      const result = failure("CONFLICT", `${stale.map((rule) => rule.code).join("、")} 的依据事实已修改，请重新确认判断后生成草稿。`);
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const latestFacts = new Map<string, FactCandidate>();
    for (const item of confirmations ?? []) {
      if (latestFacts.has(item.field_key) || !item.source_location) continue;
      latestFacts.set(item.field_key, { key: item.field_key, value: Number(item.value), unit: item.unit,
        source: item.source_location as SourceLocation, state: "confirmed" });
    }
    const evaluatedResults: RuleResult[] = applicable.map((rule) => {
      const item = latest.get(rule.code)!;
      return { ruleId: rule.code, outcome: outcomes[item.decision] ?? "UNCLEAR", explanation: item.rationale,
        inputs: { factCheck: item.fact_check }, sources: [] };
    });
    const openIssues = applicable.filter((rule) => {
      const item = latest.get(rule.code)!;
      return item.fact_check !== "confirmed" || ["supplement", "defer"].includes(item.decision);
    }).map((rule) => `${rule.code} ${rule.title}: ${latest.get(rule.code)!.rationale}`);
    const body = await request.json().catch(() => ({})) as { referenceRoundIds?: string[] };
    const selected = new Set(Array.isArray(body.referenceRoundIds) ? body.referenceRoundIds.slice(0, 5) : []);
    const { data: history } = await supabase.rpc("applicable_historical_gv_opinions", { p_task_id: taskId });
    const historicalOpinions = (history ?? []).filter((item: { source_round_id: string }) => selected.has(item.source_round_id)).slice(0, 5).map((item: { source_task_id: string; submitted_at: string; english_opinion: string; chinese_explanation: string }) => ({ sourceTaskId: item.source_task_id, submittedAt: item.submitted_at, englishOpinion: item.english_opinion, chineseExplanation: item.chinese_explanation }));
    const ai = await aiProvider.draftOpinion({ taskId, roundId: round.id, evaluatedResults, openIssues,
      confirmedFacts: [...latestFacts.values()], historicalOpinions });
    if (!ai.ok) {
      const result = failure(ai.retryable ? "RETRYABLE" : "VALIDATION", ai.message);
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    return NextResponse.json(success(ai.value, "意见草稿已生成，请审核员逐句核对、修改后提交。"));
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "意见草稿暂时无法生成，请人工填写。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
