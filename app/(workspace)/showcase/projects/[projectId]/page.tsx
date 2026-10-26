import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ProjectDetailPanels, type ProjectMaterialItem, type ProjectTaskItem } from "@/components/workspace/project-detail-panels";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { showcaseProject, showcaseTasks } from "@/lib/gv/showcase";
import { getCurrentActor } from "@/lib/supabase/auth";

export const instant = false;

export default async function ShowcaseProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const project = showcaseProject(projectId);
  if (!project) notFound();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try { context = await getCurrentActor(); } catch { redirect("/login"); }
  if (context.actor.role === "rule_maintainer") notFound();
  const tasks = showcaseTasks.filter((task) => task.projectId === projectId);
  const taskItems: ProjectTaskItem[] = tasks.map((task) => ({ id: task.id, category: task.category, credit: task.credit, round: task.round, status: task.status, href: `/showcase/tasks/${task.id}`, scopeHref: `/showcase/tasks/${task.id}#overview`, materialHref: `/showcase/tasks/${task.id}#materials`, scopeConfirmed: !["首次审核", "待人工复核"].includes(task.status) }));
  const materials: ProjectMaterialItem[] = tasks.map((task) => ({ id: task.id, name: task.sourceName, version: task.sourceVersion, task: `${task.category} · ${task.credit}`, status: "已登记", href: `/showcase/tasks/${task.id}#materials` }));
  const facts: [string, string][] = [["认证体系", "LEED v4 BD+C NC"], ["项目类型", "单体建筑"], ["建筑用途", project.buildingUse], ["总建筑面积", project.grossArea], ["项目地点", project.location], ["审核阶段", project.phase], ["开发商／业主", project.owner], ["顾问方", project.consultant], ["设计单位", project.designer], ["信用项任务", `${tasks.length} 项`]];
  return <WorkspaceFrame actor={context.actor} active="projects"><div className="mx-auto max-w-[1260px]"><Link href="/projects" className="inline-flex items-center gap-2 text-sm text-[#547466]"><ArrowLeft size={17}/> 返回项目中心</Link><section className="mt-3 rounded-[22px] bg-[#e9f8f4] p-6" style={{ background: 'linear-gradient(90deg, #e9f8f4 10%, rgba(233,248,244,.86) 47%, rgba(233,248,244,.06) 100%), url("/images/dashboard-hero.png") center / cover' }}><p className="text-sm font-semibold text-[#17845b]">项目概况与进度</p><h1 className="mt-1 text-[30px] font-bold">{project.name}</h1><p className="mt-2 text-sm text-[#536e65]">LEED v4 BD+C NC · {project.location} · {project.grossArea} · {project.status}</p>{projectId === "river" && <Link href={`/showcase/projects/${projectId}/supplement`} className="mt-4 inline-flex rounded-full bg-[#0b8255] px-4 py-2 text-sm font-semibold text-white">核对补件 →</Link>}</section><ProjectDetailPanels facts={facts} tasks={taskItems} materials={materials} latest={project.event} latestTime={project.time}/></div></WorkspaceFrame>;
}
