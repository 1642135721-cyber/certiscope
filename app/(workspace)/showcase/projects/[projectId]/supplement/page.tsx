import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { showcaseProject, showcaseTasks } from "@/lib/gv/showcase";
import { getCurrentActor } from "@/lib/supabase/auth";
import { ShowcaseSupplement } from "./showcase-supplement";

export const instant = false;

export default async function ShowcaseSupplementPage({ params }: { params: Promise<{ projectId: string }> }) {
  await connection();
  const { projectId } = await params;
  const project = showcaseProject(projectId);
  if (!project || projectId !== "river") notFound();
  let context: Awaited<ReturnType<typeof getCurrentActor>>;
  try { context = await getCurrentActor(); } catch { redirect("/login"); }
  if (context.actor.role === "rule_maintainer") notFound();
  return <WorkspaceFrame actor={context.actor} active="projects"><ShowcaseSupplement project={project} tasks={showcaseTasks.filter((task) => task.projectId === projectId)}/></WorkspaceFrame>;
}
