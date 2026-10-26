import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { ProjectShell } from "@/components/workspace/project-shell";
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";
import { OpinionForm } from "./opinion-form";

export const instant = false;

export default async function OpinionPage({ params }: { params: Promise<{ taskId: string }> }) {
  await connection();
  const { taskId } = await params;
  let context: Awaited<ReturnType<typeof requireTaskAccess>>;
  try { context = await requireTaskAccess(taskId); }
  catch (error) { if (error instanceof AuthorizationError && error.status === 401) redirect("/login"); notFound(); }
  const [{ data: project }, { data: round }, { data: decisions }, { data: opinions }, { data: history }] = await Promise.all([
    context.supabase.from("projects").select("name, project_type, location, area_value, area_unit").eq("id", context.task.project_id).maybeSingle(),
    context.supabase.from("task_rounds").select("id, sequence, status, scope_confirmed_at, submitted_at").eq("id", context.task.current_round_id ?? "").maybeSingle(),
    context.supabase.from("gv_rule_decisions").select("rule_code, fact_check, decision, rationale, scope_confirmed_at, created_at").eq("round_id", context.task.current_round_id ?? "").order("created_at", { ascending: false }),
    context.supabase.from("gv_round_opinions").select("id, english_opinion, chinese_explanation, has_pending_items, submitted_at").eq("round_id", context.task.current_round_id ?? "").order("submitted_at", { ascending: false }).limit(1),
    context.actor.role === "auditor" ? context.supabase.rpc("applicable_historical_gv_opinions", { p_task_id: taskId }) : Promise.resolve({ data: [] }),
  ]);
  const applicable = gvRules.filter((rule) => ruleApplies(rule.code, context.task.incentive_path, context.task.facility_path));
  const latest = new Map<string, { fact_check: string; decision: string; rationale: string }>();
  for (const item of decisions ?? []) if (item.scope_confirmed_at === round?.scope_confirmed_at && !latest.has(item.rule_code)) latest.set(item.rule_code, item);
  const rows = applicable.map((rule) => ({ code: rule.code, title: rule.title, factCheck: latest.get(rule.code)?.fact_check ?? null, decision: latest.get(rule.code)?.decision ?? null }));
  return <ProjectShell actor={context.actor} task={context.task} project={project} roundSequence={round?.sequence ?? 1} active="opinion">
    {context.actor.role === "admin" && <Link href={`/tasks/${taskId}/admin`} className="mb-4 inline-flex rounded-full bg-[#0b8255] px-5 py-2.5 text-sm font-semibold text-white">进入管理员汇总与轮次处理</Link>}
    <OpinionForm taskId={taskId} roundId={round?.id ?? ""} scopeConfirmed={Boolean(round?.scope_confirmed_at)}
      canSubmit={Boolean(round && ["open", "returned"].includes(round.status) && !context.readonly && context.actor.role === "auditor" && context.actor.id === context.task.current_auditor_id)}
      projectName={project?.name ?? "项目"} rows={rows} submitted={round?.status === "returned" ? null : opinions?.[0] ?? null} history={history ?? []}/>
  </ProjectShell>;
}
