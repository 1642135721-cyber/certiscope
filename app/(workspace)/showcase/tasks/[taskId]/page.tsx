import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { getReviewDossier } from "@/lib/gv/showcase-dossiers";
import { showcaseProject, showcaseRuleCode, showcaseTask } from "@/lib/gv/showcase";
import { getCurrentActor } from "@/lib/supabase/auth";
import { ShowcaseTaskWorkspace } from "./showcase-task-workspace";

export const instant = false;

export default async function ShowcaseTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  await connection();
  const { taskId } = await params;
  const task = showcaseTask(taskId);
  if (!task) notFound();
  const project = showcaseProject(task.projectId);
  if (!project) notFound();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try { context = await getCurrentActor(); } catch { redirect("/login"); }
  if (context.actor.role === "rule_maintainer") notFound();
  const ruleCode = showcaseRuleCode(task.id);
  const dossier = getReviewDossier({ projectId: task.projectId, ruleCode, sourceName: task.sourceName, sourcePage: task.sourcePage });
  return <WorkspaceFrame actor={context.actor} active="tasks"><ShowcaseTaskWorkspace task={task} project={project} dossier={dossier} ruleCode={ruleCode}/></WorkspaceFrame>;
}
