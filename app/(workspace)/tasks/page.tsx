import { ArrowRight, ChevronDown, ClipboardList } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { listAccessibleTasks, pathLabel } from "@/lib/gv/task-queries";
import { showcaseCategories, showcaseProject, showcaseTasks } from "@/lib/gv/showcase";
import { getCurrentActor } from "@/lib/supabase/auth";

export const instant = false;

export default async function TasksPage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try {
    context = await getCurrentActor();
  } catch {
    redirect("/login");
  }
  if (context.actor.role === "rule_maintainer") redirect("/rules");

  let tasks: Awaited<ReturnType<typeof listAccessibleTasks>> = [];
  let error = "";
  try {
    tasks = await listAccessibleTasks(context.supabase);
  } catch {
    error = "审核任务暂时无法读取，请稍后刷新。";
  }
  const current = tasks.filter(
    (task) => !task.archived_at &&
      (context.actor.role === "admin" || task.current_auditor_id === context.actor.id),
  );
  const history = tasks.filter((task) => !current.some((item) => item.id === task.id));
  const roundIds = current.map((task) => task.current_round_id).filter((id): id is string => Boolean(id));
  const { data: rounds } = roundIds.length
    ? await context.supabase.from("task_rounds")
        .select("id, sequence, status, scope_confirmed_at")
        .in("id", roundIds)
    : { data: [] };
  const roundById = new Map((rounds ?? []).map((round) => [round.id, round]));
  const [{ data: runs }, { data: decisions }] = await Promise.all([
    roundIds.length
      ? context.supabase
          .from("gv_processing_runs")
          .select("round_id, scope_confirmed_at, cleared_at")
          .in("round_id", roundIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? context.supabase
          .from("gv_rule_decisions")
          .select("round_id, scope_confirmed_at")
          .in("round_id", roundIds)
      : Promise.resolve({ data: [] }),
  ]);
  const latestRunByRound = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? [])
    if (!latestRunByRound.has(run.round_id))
      latestRunByRound.set(run.round_id, run);
  const decidedRounds = new Set(
    (decisions ?? [])
      .filter(
        (item) =>
          item.scope_confirmed_at ===
          roundById.get(item.round_id)?.scope_confirmed_at,
      )
      .map((item) => item.round_id),
  );

  return (
    <WorkspaceFrame actor={context.actor} active="tasks">
      <div className="mx-auto max-w-[1260px]">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#e5f5eb] text-[#087a50]"><ClipboardList size={23} /></span>
          <div>
            <h1 className="text-[28px] font-bold">审核任务</h1>
            <p className="text-sm text-[#748a7d]">按 LEED 类别查看有权处理的跨项目信用项任务。</p>
          </div>
        </div>
        {error && <p role="alert" className="mb-4 rounded-xl bg-[#fff0ec] p-4 text-[#a64532]">{error}</p>}
        <details open className="rounded-2xl border border-[#dfece3] bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between border-b border-[#e6efe9] px-6 py-4">
            <span className="flex items-center gap-3"><strong className="text-lg text-[#0b5d3e]">LT · 交通与场地</strong><span className="rounded-full bg-[#e9f6ef] px-2.5 py-1 text-xs text-[#168258]">{current.length + showcaseTasks.filter((item) => item.category === "LT").length} 项信用项任务</span></span>
            <ChevronDown size={19} className="text-[#5c796a]" />
          </summary>
          <div className="grid grid-cols-[minmax(220px,1.3fr)_minmax(120px,1fr)_minmax(130px,1fr)_110px_100px] gap-3 bg-[#f5faf7] px-6 py-3 text-xs font-semibold text-[#6d8a7a]"><span>审核任务</span><span>所属项目</span><span>轮次与阶段</span><span className="-ml-[18px]">当前状态</span><span>入口</span></div>
          <div className="divide-y divide-[#edf1ee]">
            {current.length ? current.map((task) => {
              const round = roundById.get(task.current_round_id ?? "");
              const latestRun = latestRunByRound.get(round?.id ?? "");
              const hasCurrentRun = Boolean(
                latestRun &&
                !latestRun.cleared_at &&
                latestRun.scope_confirmed_at === round?.scope_confirmed_at,
              );
              const state = !round?.scope_confirmed_at
                ? "范围待确认"
                : round.status === "submitted"
                  ? "意见已提交"
                  : round.status === "returned"
                    ? "待复核"
                    : decidedRounds.has(round.id)
                      ? "审核中"
                      : hasCurrentRun
                        ? "待人工复核"
                        : "待初审";
              const href = !round?.scope_confirmed_at
                ? `/tasks/${task.id}`
                : hasCurrentRun
                  ? `/tasks/${task.id}/review`
                  : `/tasks/${task.id}/materials`;
              return <div key={task.id} className="grid grid-cols-[minmax(220px,1.3fr)_minmax(120px,1fr)_minmax(130px,1fr)_110px_100px] items-center gap-3 px-6 py-4 text-sm">
                <div><strong className="block">LT · Green Vehicles</strong><span className="text-xs text-[#72877b]">{pathLabel(task)}</span></div>
                <Link href={`/projects/${task.project_id}`} className="font-medium text-[#0b7450] hover:underline">{task.projects?.name ?? "项目资料待读取"}</Link>
                <span className="text-[#597366]">第 {round?.sequence ?? 1} 轮 · {task.stage || "阶段待确认"}</span>
                <span className="-ml-[18px] text-[#a87829]">{state}</span>
                <Link href={href} className="inline-flex items-center gap-1 font-semibold text-[#087d51]">进入任务 <ArrowRight size={16} /></Link>
              </div>;
            }) : <p className="px-6 py-4 text-sm text-[#809489]">当前没有待处理的真实审核任务。</p>}
            {showcaseTasks.filter((item) => item.category === "LT").map((item) => {
              const project = showcaseProject(item.projectId);
              return <div key={item.id} className="grid grid-cols-[minmax(220px,1.3fr)_minmax(120px,1fr)_minmax(130px,1fr)_110px_100px] items-center gap-3 px-6 py-4 text-sm">
                <div><strong className="block">LT · {item.credit}</strong><span className="text-xs text-[#829589]">{item.focus}</span></div>
                <Link href={`/showcase/projects/${item.projectId}`} className="font-medium text-[#0b7450] hover:underline">{project?.name}</Link>
                <span className="text-[#597366]">{item.round}</span><span className="-ml-[18px] text-[#a87829]">{item.status}</span>
                <Link href={`/showcase/tasks/${item.id}`} className="inline-flex items-center gap-1 font-semibold text-[#087d51]">查看详情 <ArrowRight size={16}/></Link>
              </div>;
            })}
          </div>
        </details>
        <div className="mt-4 space-y-3">{showcaseCategories.filter((category) => category.code !== "LT").map((category) => {
          const categoryTasks = showcaseTasks.filter((item) => item.category === category.code);
          return <details key={category.code} className="rounded-2xl border border-[#dfece3] bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4"><span className="flex items-center gap-3"><strong className="text-lg text-[#0b5d3e]">{category.code} · {category.name}</strong><span className="rounded-full bg-[#e9f6ef] px-2.5 py-1 text-xs text-[#168258]">{categoryTasks.length} 项任务</span></span><ChevronDown size={19} className="text-[#5c796a]" /></summary>
            <div className="grid grid-cols-[minmax(220px,1.3fr)_minmax(120px,1fr)_minmax(130px,1fr)_110px_100px] gap-3 bg-[#f5faf7] px-6 py-3 text-xs font-semibold text-[#6d8a7a]"><span>审核任务</span><span>所属项目</span><span>轮次与阶段</span><span className="-ml-[18px]">当前状态</span><span>入口</span></div>
            <div className="divide-y divide-[#edf1ee]">{categoryTasks.map((item) => {
              const project = showcaseProject(item.projectId);
              return <div key={item.id} className="grid grid-cols-[minmax(220px,1.3fr)_minmax(120px,1fr)_minmax(130px,1fr)_110px_100px] items-center gap-3 px-6 py-4 text-sm">
                <div><strong className="block">{item.category} · {item.credit}</strong><span className="text-xs text-[#829589]">{item.focus}</span></div>
                <Link href={`/showcase/projects/${item.projectId}`} className="font-medium text-[#0b7450] hover:underline">{project?.name}</Link>
                <span className="text-[#597366]">{item.round}</span><span className="-ml-[18px] text-[#a87829]">{item.status}</span>
                <Link href={`/showcase/tasks/${item.id}`} className="inline-flex items-center gap-1 font-semibold text-[#087d51]">查看详情 <ArrowRight size={16}/></Link>
              </div>;
            })}</div>
          </details>;
        })}</div>
        {history.length > 0 && <details className="mt-4 rounded-2xl border border-[#dfece3] bg-white">
          <summary className="cursor-pointer px-6 py-4 font-semibold">参与历史 · {history.length} 项</summary>
          <div className="divide-y divide-[#edf1ee]">{history.map((task) => <Link key={task.id} href={`/tasks/${task.id}`} className="flex items-center justify-between gap-3 px-6 py-3 text-sm hover:bg-[#f5faf7]"><span>{task.projects?.name ?? "项目"} · LT / Green Vehicles</span><span className="text-[#74897c]">只读查看 <ArrowRight size={15} className="inline" /></span></Link>)}</div>
        </details>}
      </div>
    </WorkspaceFrame>
  );
}
