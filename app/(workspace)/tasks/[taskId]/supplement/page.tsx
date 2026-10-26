import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ProjectShell } from "@/components/workspace/project-shell";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";
import { MaterialOpen } from "../materials/material-actions";
import { SupplementChecks } from "./supplement-checks";

export const instant = false;

export default async function SupplementPage({ params }: { params: Promise<{ taskId: string }> }) {
  await connection();
  const { taskId } = await params;
  let context: Awaited<ReturnType<typeof requireTaskAccess>>;
  try { context = await requireTaskAccess(taskId); }
  catch (error) { if (error instanceof AuthorizationError && error.status === 401) redirect("/login"); notFound(); }
  const [{ data: project }, { data: rounds }, { data: materials }, { data: opinions }, { data: actions }, { data: checks }] = await Promise.all([
    context.supabase.from("projects").select("name, project_type, location, area_value, area_unit").eq("id", context.task.project_id).maybeSingle(),
    context.supabase.from("task_rounds").select("id, sequence, status, source, started_at, scope_confirmed_at").eq("task_id", taskId).order("sequence", { ascending: false }),
    context.supabase.from("material_versions").select("id, round_id, file_name, version, created_at, parse_status").eq("task_id", taskId).is("removed_at", null).order("created_at", { ascending: false }),
    context.supabase.from("gv_round_opinions").select("round_id, chinese_explanation, has_pending_items, submitted_at").eq("task_id", taskId).order("submitted_at", { ascending: false }),
    context.supabase.from("gv_admin_actions").select("round_id, new_round_id, reason, created_at").eq("task_id", taskId).eq("action", "supplement").order("created_at", { ascending: false }),
    context.supabase.from("gv_supplement_checks").select("round_id, requirement_index, verdict, note").eq("task_id", taskId),
  ]);
  const current = rounds?.find((round) => round.id === context.task.current_round_id);
  if (!current || current.source !== "supplement") notFound();
  const previous = rounds?.find((round) => round.sequence === current.sequence - 1);
  const request = actions?.find((action) => action.new_round_id === current.id);
  const previousOpinion = opinions?.find((opinion) => opinion.round_id === previous?.id);
  const oldFiles = (materials ?? []).filter((file) => file.round_id === previous?.id);
  const newFiles = (materials ?? []).filter((file) => file.round_id === current.id);
  const requirements = request?.reason?.trim() ? request.reason.split(/\r?\n/).map((item: string) => item.trim()).filter(Boolean) : [];
  const canEdit = context.actor.role === "auditor" && context.actor.id === context.task.current_auditor_id && !context.readonly && ["open", "returned"].includes(current.status);
  return <ProjectShell actor={context.actor} task={context.task} project={project} roundSequence={current.sequence} active="materials">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,.8fr)]">
      <section className="rounded-2xl bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[23px] font-bold">补件核对</h2><p className="mt-2 text-sm text-[#82948a]">对照上轮要求、历史材料与本轮文件。所有材料按原轮次保存。</p></div><Link href={`/tasks/${taskId}/materials`} className="rounded-full bg-[#0b8255] px-5 py-2 text-sm font-semibold text-white">上传或查看本轮材料</Link></div>
        <div className="mt-5 rounded-xl border border-[#dcebe2] bg-[#f5faf7] p-4"><h3 className="font-bold">上轮补件要求</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#446b53]">{request?.reason ?? "管理员补件要求尚未记录。"}</p>{previousOpinion?.has_pending_items && <p className="mt-3 text-sm text-[#9b7038]">上轮审核员意见包含待跟进事项。</p>}{previousOpinion?.chinese_explanation && <details className="mt-3 text-sm"><summary className="cursor-pointer text-[#0b7950]">查看上轮专业意见</summary><p className="mt-2 whitespace-pre-wrap leading-7">{previousOpinion.chinese_explanation}</p></details>}</div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h3 className="font-bold">历史材料 · 第 {previous?.sequence ?? current.sequence - 1} 轮</h3><div className="mt-3 space-y-2">{oldFiles.length ? oldFiles.map((file)=><div key={file.id} className="flex items-center gap-3 rounded-xl border border-[#e4ede7] p-3"><FileText size={20} className="shrink-0 text-[#188258]"/><span className="min-w-0 flex-1 truncate text-sm">{file.file_name}</span><MaterialOpen fileId={file.id}/></div>) : <p className="rounded-xl bg-[#f7faf8] p-4 text-sm text-[#82948a]">上轮没有登记材料。</p>}</div></div><div><h3 className="font-bold">本轮提交 · 第 {current.sequence} 轮</h3><div className="mt-3 space-y-2">{newFiles.length ? newFiles.map((file)=><div key={file.id} className="flex items-center gap-3 rounded-xl border border-[#e4ede7] p-3"><FileText size={20} className="shrink-0 text-[#188258]"/><span className="min-w-0 flex-1 truncate text-sm">{file.file_name}</span><MaterialOpen fileId={file.id}/></div>) : <p className="rounded-xl bg-[#f7faf8] p-4 text-sm text-[#82948a]">本轮尚未登记补件文件。</p>}</div></div></div>
        <div className="mt-5"><SupplementChecks taskId={taskId} requirements={requirements} initial={(checks ?? []).filter((item) => item.round_id === current.id)} canEdit={canEdit} nextHref={current.scope_confirmed_at ? `/tasks/${taskId}/review` : `/tasks/${taskId}#scope-confirmation`}/></div>
      </section>
      <aside className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">本轮状态</h2><p className="mt-3 text-sm text-[#738a7b]">{current.status === "submitted" ? "专业意见已提交" : current.status === "returned" ? "已退回复核" : "补件核对中"}</p><div className="mt-5 space-y-2 text-sm"><p>上轮文件：{oldFiles.length} 份</p><p>本轮文件：{newFiles.length} 份</p><p>补件要求：{requirements.length} 项</p><p>已核对：{(checks ?? []).filter((item) => item.round_id === current.id).length} 项</p></div><p className="mt-5 text-xs leading-6 text-[#82948a]">逐项保存核对后进入本轮范围确认与规则审核。</p></aside>
    </div>
  </ProjectShell>;
}
