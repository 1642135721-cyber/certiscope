import { NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai/qwen";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { retrieveGvRuleEvidence, retrievedSource } from "@/lib/gv/evidence-retrieval";
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import { gvOfficialExcerpt } from "@/lib/gv/rule-source";
import type { SourceLocation } from "@/lib/gv/types";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const { taskId } = await params;
    const { supabase, task, actor } = await requireTaskAccess(taskId, true);
    const body = (await request.json()) as Record<string, unknown>;
    const rule = gvRules.find((item) => item.code === body.ruleCode);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id || !rule ||
      !ruleApplies(rule.code, task.incentive_path, task.facility_path)) {
      const result = failure("FORBIDDEN", "当前规则或身份不能发起 AI 初审。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: round } = await supabase.from("task_rounds")
      .select("id, status, scope_confirmed_at, selected_material_version_ids")
      .eq("id", task.current_round_id ?? "").maybeSingle();
    if (!round?.scope_confirmed_at || !["open", "returned"].includes(round.status)) {
      const result = failure("CONFLICT", "请先确认当前轮次的路径、版本、范围和材料。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: rulePackage } = await supabase.from("gv_rule_packages")
      .select("id, package_version, source_reference").eq("id", task.rule_version_id ?? "").maybeSingle();
    if (!rulePackage) {
      const result = failure("CONFLICT", "本轮尚未锁定 GV 规则包，请先确认范围。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const ids: string[] = round.selected_material_version_ids ?? [];
    if (!ids.length) {
      const result = failure("VALIDATION", "本轮没有已确认的材料版本。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: fragments, error: fragmentError } = await supabase.from("parsed_fragments")
      .select("material_version_id, text_content, source_location, status")
      .in("material_version_id", ids).order("sequence").limit(180);
    if (fragmentError) throw fragmentError;
    const evidenceParts = retrieveGvRuleEvidence((fragments ?? []) as {
      material_version_id: string; text_content: string; source_location: SourceLocation | null; status: string
    }[], [rule.code], ids).get(rule.code) ?? [];
    if (!evidenceParts.length) {
      const result = failure("VALIDATION", "本轮材料没有可供 AI 读取的文本；请对照原件人工核对。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const officialExcerpt = await gvOfficialExcerpt(rule.code).catch(() => null);
    const ai = await aiProvider.checkEvidence({
      taskId, roundId: round.id,
      ruleVersion: rulePackage.package_version,
      question: `${rule.code} ${rule.title}：${rule.summary}。所需证据：${rule.evidence}。不得仅因材料提及数字或设备而作专业通过结论。`,
      ruleExcerpts: [{ text: `${rulePackage.source_reference}。${officialExcerpt ?? "官方原文未能读取；请人工核对规则原件。"}。锁定包核对重点：${rule.summary}`, source: { materialVersionId: `rule:${rulePackage.id}`, note: officialExcerpt ? "GV 官方规则原件和锁定包摘要" : "仅锁定包摘要；官方原文待核" } }],
      facts: [], evidenceParts,
    });
    if (!ai.ok) {
      const result = failure(ai.retryable ? "RETRYABLE" : "VALIDATION", ai.message);
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const citations = ai.value.citations.map((source) => retrievedSource(source, evidenceParts))
      .filter((source): source is SourceLocation => source !== null);
    const unlocated = ai.value.support !== "unknown" && citations.length === 0;
    const { error } = await supabase.from("gv_rule_ai_assessments").insert({
      task_id: taskId, round_id: round.id, rule_code: rule.code,
      scope_confirmed_at: round.scope_confirmed_at, support: unlocated ? "unknown" : ai.value.support,
      citations, gaps: [...ai.value.gaps.filter((item) => typeof item === "string"), ...(unlocated ? ["AI 未提供可定位到本规则检索片段的引用，请核对原件。"] : [])],
      human_questions: ai.value.humanQuestions.filter((item) => typeof item === "string"),
      provider: ai.provider, model: ai.model, created_by: actor.id,
    });
    if (error) throw error;
    return NextResponse.json(success({ support: unlocated ? "unknown" : ai.value.support }, "AI 候选分析已保存；请核对原件并完成专业判断。"));
  } catch (error) {
    const result = error instanceof AuthorizationError
      ? failure(error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", error.message)
      : failure("INTERNAL", "AI 初审未完成，请重试或转人工核对。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
