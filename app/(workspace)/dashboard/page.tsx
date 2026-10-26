import { ArrowRight, Bell, Check, ChevronRight, CircleAlert, FileText, Leaf, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { logout } from "@/app/(auth)/login/actions";
import Image from "next/image";
import { WorkspaceNav } from "@/components/workspace/workspace-nav";
import { ProjectProgressSelector } from "@/components/workspace/project-progress-selector";
import { RecentCarousel } from "@/components/workspace/recent-carousel";
import { listAccessibleTasks, pathLabel } from "@/lib/gv/task-queries";
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import { projectCoverAlt, selectProjectCoverSource, type ProjectCoverSource } from "@/lib/gv/project-cover";
import { showcaseProgress, showcaseProjects, showcaseTasks } from "@/lib/gv/showcase";
import { getCurrentActor } from "@/lib/supabase/auth";
import "./dashboard-groups.css";

export const instant = false;

type DashboardWorkItem = {
  id: string;
  projectKey: string;
  projectName: string;
  title: string;
  detail: string;
  taskTitle: string;
  taskDetail: string;
  status: string;
  href: string;
  tone: "amber" | "blue" | "red";
};

export default async function DashboardPage() {
  await connection();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try { context = await getCurrentActor(); } catch { redirect("/login"); }
  if (context.actor.role === "rule_maintainer") redirect("/rules");
  const tasks = await listAccessibleTasks(context.supabase).catch(() => []);
  const current = tasks.filter((task) => !task.archived_at && (context.actor.role === "admin" || task.current_auditor_id === context.actor.id));
  const ids = current.map((task) => task.current_round_id).filter((id): id is string => Boolean(id));
  const [{ data: rounds }, { data: materials }, { data: decisions }, { data: events }] = await Promise.all([
    ids.length ? context.supabase.from("task_rounds").select("id, status, sequence, source, started_at, scope_confirmed_at").in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? context.supabase.from("material_versions").select("id, round_id, created_at").in("round_id", ids).is("removed_at", null) : Promise.resolve({ data: [] }),
    ids.length ? context.supabase.from("gv_rule_decisions").select("round_id, scope_confirmed_at, rule_code").in("round_id", ids) : Promise.resolve({ data: [] }),
    context.supabase.from("operation_events").select("id, event_type, success, task_id, created_at").order("created_at", { ascending: false }).limit(8),
  ]);
  const roundMap = new Map((rounds ?? []).map((round) => [round.id, round]));
  const cards = current.map((task) => {
    const round = roundMap.get(task.current_round_id ?? "");
    const fileCount = (materials ?? []).filter((item) => item.round_id === round?.id).length;
    const decisionCount = new Set((decisions ?? []).filter((item) => item.round_id === round?.id && item.scope_confirmed_at === round?.scope_confirmed_at).map((item) => item.rule_code)).size;
    const applicableCount = gvRules.filter((rule) => ruleApplies(rule.code, task.incentive_path, task.facility_path)).length;
    const progress = round?.status === "submitted" ? 90 : round?.scope_confirmed_at ? 60 + Math.round(25 * decisionCount / applicableCount) : fileCount ? 35 : 15;
    const status = round?.status === "submitted" ? "待管理员汇总" : round?.status === "returned" ? "待复核" : !round?.scope_confirmed_at ? "待确认范围" : decisionCount ? "审核中" : "待审核";
    const action = round?.status === "submitted" ? "查看意见" : round?.status === "returned" ? "继续复核" : !round?.scope_confirmed_at ? "确认审核范围" : decisionCount ? "继续审核" : "开始审核";
    const href = round?.status === "submitted" ? `/tasks/${task.id}/opinion` : !round?.scope_confirmed_at ? `/tasks/${task.id}#scope-confirmation` : `/tasks/${task.id}/review`;
    return { task, round, fileCount, decisionCount, applicableCount, progress, status, action, href };
  });
  const activity = new Map<string, string>();
  for (const event of events ?? []) if (event.task_id && !activity.has(event.task_id)) activity.set(event.task_id, event.created_at);
  cards.sort((a, b) => Date.parse(activity.get(b.task.id) ?? b.round?.started_at ?? b.task.created_at) - Date.parse(activity.get(a.task.id) ?? a.round?.started_at ?? a.task.created_at));
  const reminderCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const reminders = cards.flatMap((card) => {
    const items: { key: string; title: string; detail: string; at: string; href: string }[] = [];
    const latestSupplement = (materials ?? []).filter((file) => file.round_id === card.round?.id).map((file) => file.created_at).sort().at(-1);
    if (card.round?.source === "supplement" && latestSupplement && Date.parse(latestSupplement) >= reminderCutoff)
      items.push({ key: `${card.task.id}-supplement`, title: "补件已到", detail: card.task.projects?.name ?? "项目", at: latestSupplement, href: `/tasks/${card.task.id}/supplement` });
    const returnedAt = (events ?? []).find((event) => event.task_id === card.task.id && event.event_type === "return" && event.success)?.created_at;
    if (card.round?.status === "returned" && returnedAt && Date.parse(returnedAt) >= reminderCutoff)
      items.push({ key: `${card.task.id}-returned`, title: "审核意见待复核", detail: card.task.projects?.name ?? "项目", at: returnedAt, href: `/tasks/${card.task.id}/review` });
    if (Date.parse(card.task.created_at) >= reminderCutoff)
      items.push({ key: `${card.task.id}-new`, title: "新到项目", detail: card.task.projects?.name ?? "项目", at: card.task.created_at, href: `/tasks/${card.task.id}` });
    return items;
  }).sort((a,b) => Date.parse(b.at) - Date.parse(a.at)).slice(0,5);
  const showcase = showcaseProjects.filter((item) => !cards.some((card) => card.task.projects?.name === item.name));
  const showcaseCurrentTasks = showcaseTasks.filter((item) => item.status !== "质控通过" && showcase.some((project) => project.id === item.projectId));
  const recentCards = cards.filter((card, index) => cards.findIndex((other) => other.task.project_id === card.task.project_id) === index).slice(0, 5);
  const recentProjectIds = recentCards.map((card) => card.task.project_id);
  const { data: projectCoverSources } = recentProjectIds.length
    ? await context.supabase.from("project_source_files")
        .select("project_id, file_name, storage_path")
        .in("project_id", recentProjectIds)
        .is("removed_at", null)
    : { data: [] };
  const coverMap = new Map(recentProjectIds.map((projectId) => [
    projectId,
    selectProjectCoverSource((projectCoverSources ?? []).filter((source) => source.project_id === projectId)),
  ]));
  const recentShowcase = showcase.slice(0, Math.max(0, 5 - recentCards.length));
  const recentCount = recentCards.length + recentShowcase.length;
  const workItems: DashboardWorkItem[] = [
    ...cards.map((card) => ({
      id: card.task.id,
      projectKey: `real:${card.task.project_id}`,
      projectName: card.task.projects?.name ?? "项目",
      title: card.action,
      detail: `第 ${card.round?.sequence ?? 1} 轮 · LT / Green Vehicles`,
      taskTitle: "LT · Green Vehicles",
      taskDetail: `第 ${card.round?.sequence ?? 1} 轮 · ${card.status}`,
      status: card.status,
      href: card.href,
      tone: card.round?.status === "returned" ? "red" as const : "amber" as const,
    })),
    ...showcaseCurrentTasks.map((item) => {
      const project = showcaseProjects.find((entry) => entry.id === item.projectId);
      return {
        id: item.id,
        projectKey: `showcase:${item.projectId}`,
        projectName: project?.name ?? "项目",
        title: item.focus,
        detail: `${item.status} · ${item.category} / ${item.credit}`,
        taskTitle: `${item.category} · ${item.credit}`,
        taskDetail: `${item.round} · ${item.status}`,
        status: item.status,
        href: item.status === "补件已到" ? `/showcase/projects/${item.projectId}/supplement` : `/showcase/tasks/${item.id}#review`,
        tone: item.status === "补件已到" ? "blue" as const : item.status === "质控退回" ? "red" as const : "amber" as const,
      };
    }),
  ];
  const workGroupMap = new Map<string, { name: string; items: DashboardWorkItem[] }>();
  for (const item of workItems) {
    let group = workGroupMap.get(item.projectKey);
    if (!group) {
      group = { name: item.projectName, items: [] };
      workGroupMap.set(item.projectKey, group);
    }
    group.items.push(item);
  }
  const workGroups = [...workGroupMap.values()];

  return <div className="dashboard-shell"><header className="dashboard-header"><Link href="/welcome" className="dashboard-brand"><Image src="/images/certiscope-mark.png" alt="" width={38} height={38} className="dashboard-brand-mark"/><strong>Certi<span>Scope</span></strong><span>绿色建筑审核</span></Link><div className="dashboard-search"><Search size={18}/><span>搜索项目、条款、证据或文档…</span></div><div className="dashboard-header-right"><Bell size={20}/><div className="dashboard-account"><span className="dashboard-avatar">{context.actor.displayName.slice(0,1)}</span><span><strong>{context.actor.displayName}</strong><small>{context.actor.role === "admin" ? "审核管理员" : "审核员"}</small></span></div><form action={logout}><button type="submit" className="dashboard-logout">退出</button></form></div></header>
    <div className="dashboard-frame"><WorkspaceNav role={context.actor.role} active="dashboard"/><main className="dashboard-main"><section className="dashboard-hero"><div><h1>你好，{context.actor.role === "admin" ? "审核管理员" : "审核员"}</h1><p>专注专业审核，让每一项判断都有据可查。</p></div><p className="dashboard-hero-slogan">以专业审核<br/>推动更绿色的未来</p></section>
      <div className="dashboard-content"><div className="dashboard-primary-grid">
        <section className="dashboard-feature-card" aria-label="最近处理"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">最近处理</h2><span className="text-xs text-[#87988d]">{recentCount > 1 ? "滚轮或左右按钮切换项目" : "当前项目"}</span></div>
          {recentCount ? <RecentCarousel>{recentCards.map(({ task, round, fileCount, decisionCount, applicableCount, status, action, href }) => <article key={task.id} className="min-w-full snap-start">
            <div className="dashboard-feature-top"><ProjectCardImage projectId={task.project_id} cover={coverMap.get(task.project_id) ?? null}/><div className="dashboard-feature-info"><h2>{task.projects?.name ?? "项目"}</h2><p className="dashboard-system">{task.system || "体系待确认"} {task.system_version || "版本待确认"}</p><p className="dashboard-credit"><Leaf size={23}/> LT · Green Vehicles <span>{pathLabel(task)}</span></p><Link href={href} className="dashboard-feature-alert"><CircleAlert size={22}/>{status} · 截止时间未设置<ChevronRight size={19}/></Link></div><Link href={href} className="dashboard-review-button">{action} <ArrowRight size={20}/></Link></div>
            <div className="dashboard-project-facts"><Fact label="项目类型" value={task.projects?.project_type ?? "—"}/><Fact label="项目地点" value={task.projects?.location ?? "—"}/><Fact label="总建筑面积" value={task.projects ? `${task.projects.area_value} ${task.projects.area_unit}` : "—"}/><Fact label="申报等级" value={task.projects?.target_level ?? "—"}/><Fact label="当前阶段" value={task.stage || "待确认"}/></div>
            <div className="dashboard-steps"><Step label="建档派单" status="done"/><Step label="材料准备" status={fileCount ? "done" : "current"}/><Step label="范围确认" status={round?.scope_confirmed_at ? "done" : fileCount ? "current" : "pending"}/><Step label="规则审核" status={decisionCount >= applicableCount ? "done" : round?.scope_confirmed_at ? "current" : "pending"}/><Step label="专业意见" status={round?.status === "submitted" ? "done" : decisionCount >= applicableCount ? "current" : "pending"}/><Step label="汇总归档" status={round?.status === "submitted" ? "current" : "pending"}/></div>
          </article>)}{recentShowcase.map((project) => { const sampleTask = showcaseTasks.find((item) => item.projectId === project.id); const href = project.status === "补件已到" ? `/showcase/projects/${project.id}/supplement` : sampleTask ? `/showcase/tasks/${sampleTask.id}#review` : `/showcase/projects/${project.id}`; return <article key={project.id} className="min-w-full snap-start">
            <div className="dashboard-feature-top"><div className="dashboard-project-image overflow-hidden bg-[#e7f4ed]">{project.id === "eag" ? <Image src="/demo-materials/eag-streetscape.jpg" alt="EAG 项目关联街景材料" width={150} height={120} className="h-full w-full object-cover"/> : <Image src="/images/project-placeholder.png" alt="暂无项目材料图片" width={150} height={120} className="h-full w-full object-cover object-top"/>}</div><div className="dashboard-feature-info"><h2>{project.name}</h2><p className="dashboard-system">LEED v4 BD+C NC</p><p className="dashboard-credit"><Leaf size={23}/>{sampleTask?.category ?? "LT"} · {sampleTask?.credit ?? "信用项"}</p><Link href={href} className="dashboard-feature-alert"><CircleAlert size={22}/>{project.status} · {project.event}<ChevronRight size={19}/></Link></div><Link href={href} className="dashboard-review-button">{project.status === "补件已到" ? "核对补件" : "查看任务"} <ArrowRight size={20}/></Link></div>
            <div className="dashboard-project-facts"><Fact label="项目类型" value={project.buildingUse}/><Fact label="项目地点" value={project.location}/><Fact label="总建筑面积" value={project.grossArea}/><Fact label="认证体系" value="LEED v4 BD+C NC"/><Fact label="当前阶段" value={project.phase}/></div>
            <div className="dashboard-steps"><Step label="建档派单" status="done"/><Step label="材料准备" status="done"/><Step label="范围确认" status="done"/><Step label="规则审核" status={project.status === "首次审核" ? "current" : "done"}/><Step label="专业意见" status={project.status === "质控通过" ? "done" : "current"}/><Step label="汇总归档" status={project.status === "质控通过" ? "done" : "pending"}/></div>
          </article>; })}</RecentCarousel> : <div className="dashboard-empty-feature"><h2>暂无最近处理的项目</h2><p>新任务分派后会在这里显示项目资料、进度和操作入口。</p></div>}
        </section>
        <section className="dashboard-attention-card">
          <div className="dashboard-section-head"><h2>需要你处理</h2><Link href="/tasks" className="dashboard-project-count">{workGroups.length} 个项目</Link></div>
          <p className="dashboard-group-hint">按项目归拢 · 共 {workItems.length} 项，向下滚动查看</p>
          <div className="dashboard-attention-list" style={{ maxHeight: 287, marginBottom: -17, overflowY: "auto", overscrollBehavior: "contain" }}>
            {workGroups.map((group) => <div key={group.name} className="dashboard-work-group">
              <div className="dashboard-work-group-head"><strong>{group.name}</strong><span>{group.items.length} 项待处理</span></div>
              {group.items.map((item) => <Link key={item.id} href={item.href} className="dashboard-attention-row">
                <span className={`dashboard-work-icon dashboard-work-icon-${item.tone}`}><CircleAlert size={17}/></span>
                <span className="dashboard-work-row-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                <ChevronRight size={18}/>
              </Link>)}
            </div>)}
            {!workGroups.length && <p className="dashboard-empty-note">暂无当前项目待办。</p>}
          </div>
        </section>
      </div><div className="dashboard-bottom-grid">
        <section id="tasks" className="dashboard-bottom-card">
          <div className="dashboard-section-head"><h2>审核任务（{workItems.length}）</h2><Link href="/tasks">全部 <ArrowRight size={18}/></Link></div>
          <div className="dashboard-task-list" style={{ maxHeight: 180, overflowY: "auto", overscrollBehavior: "contain" }}>
            {workGroups.map((group) => <div key={group.name} className="dashboard-task-group">
              <div className="dashboard-work-group-head"><strong>{group.name}</strong><span>{group.items.length} 项任务</span></div>
              {group.items.map((item) => <Link key={item.id} href={item.href} className="dashboard-task-item">
                <span className="dashboard-task-icon"><FileText size={20}/></span>
                <span><strong>{item.taskTitle}</strong><small>{item.taskDetail}</small></span>
                <span className="dashboard-task-status">{item.status}</span>
              </Link>)}
            </div>)}
            {!workGroups.length && <p className="dashboard-empty-note">暂无当前任务。</p>}
          </div>
        </section>
        <section className="dashboard-bottom-card"><div className="dashboard-section-head"><h2>项目进度</h2><Link href="/projects">全部 <ArrowRight size={18}/></Link></div><ProjectProgressSelector projects={[...cards.map((card) => ({ id: card.task.id, name: card.task.projects?.name ?? "项目", status: card.status, progress: card.progress, href: `/projects/${card.task.project_id}` })), ...showcase.map((item) => ({ id: `sample-${item.id}`, name: item.name, status: item.status, progress: showcaseProgress(item), href: `/showcase/projects/${item.id}` }))]}/></section>
        <section className="dashboard-bottom-card"><div className="dashboard-section-head"><h2>最新提醒</h2><Link href="/tasks">全部 <ArrowRight size={18}/></Link></div><div className="dashboard-events">{reminders.map((item) => <Link key={item.key} href={item.href} className="dashboard-event"><span className="dashboard-event-dot"/><span><strong>{item.title}</strong><small>{item.detail} · {new Date(item.at).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</small></span></Link>)}{reminders.length < 3 && <><Link href="/showcase/projects/river/supplement" className="dashboard-event"><span className="dashboard-event-dot"/><span><strong>补件已到</strong><small>江滨科技园 · 项目提醒</small></span></Link><Link href="/showcase/tasks/north-parking#review" className="dashboard-event"><span className="dashboard-event-dot"/><span><strong>质控反馈</strong><small>北辰商务中心 · 项目提醒</small></span></Link></>}</div></section>
      </div></div></main></div>
  </div>;
}

function Fact({label,value}:{label:string;value:string}) { return <div><small>{label}</small><strong>{value}</strong></div>; }
function ProjectCardImage({ projectId, cover }: { projectId: string; cover: ProjectCoverSource | null }) {
  const label = cover ? projectCoverAlt(cover.file_name) : "暂无项目材料图片";
  return <div className="dashboard-project-image relative overflow-hidden bg-[#e7f4ed]">
    <Image src={cover ? `/api/projects/${projectId}/cover` : "/images/project-placeholder.png"} alt={label} width={150} height={120} unoptimized={Boolean(cover)} className="h-full w-full object-cover object-center"/>
    {cover && <span className="absolute inset-x-0 bottom-0 bg-white/90 px-1 py-0.5 text-center text-[10px] font-semibold text-[#07583a]">{label}</span>}
  </div>;
}
function Step({label,status}:{label:string;status:"done"|"current"|"pending"}) {
  return <div className={`dashboard-step dashboard-step-${status}`}><span>{status === "done" ? <Check size={17}/> : status === "current" ? <span className="dashboard-step-core"/> : null}</span><strong>{label}</strong><small>{status === "done" ? "已完成" : status === "current" ? "进行中" : "待开始"}</small></div>;
}
