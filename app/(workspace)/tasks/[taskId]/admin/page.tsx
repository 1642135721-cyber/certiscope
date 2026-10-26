import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ProjectShell } from "@/components/workspace/project-shell";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";
import { AdminHandoff } from "./admin-handoff";

export const instant = false;

export default async function AdminTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  await connection();
  const { taskId } = await params;
  let context: Awaited<ReturnType<typeof requireTaskAccess>>;
  try {
    context = await requireTaskAccess(taskId);
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect("/login");
    notFound();
  }
  if (context.actor.role !== "admin") notFound();
  const roundId = context.task.current_round_id ?? "";
  const [
    { data: project },
    { data: round },
    { data: opinions },
    { data: summaries },
    { data: actions },
  ] = await Promise.all([
    context.supabase
      .from("projects")
      .select("name, project_type, location, area_value, area_unit")
      .eq("id", context.task.project_id)
      .maybeSingle(),
    context.supabase
      .from("task_rounds")
      .select("id, sequence, status, source, submitted_at")
      .eq("id", roundId)
      .maybeSingle(),
    context.supabase
      .from("gv_round_opinions")
      .select(
        "english_opinion, chinese_explanation, has_pending_items, submitted_at",
      )
      .eq("round_id", roundId)
      .order("submitted_at", { ascending: false })
      .limit(1),
    context.supabase
      .from("gv_admin_summaries")
      .select("english_summary, chinese_summary, confirmed, created_at")
      .eq("round_id", roundId)
      .order("created_at", { ascending: false })
      .limit(1),
    context.supabase
      .from("gv_admin_actions")
      .select("action, reason, created_at, new_round_id")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  return (
    <ProjectShell
      actor={context.actor}
      task={context.task}
      project={project}
      roundSequence={round?.sequence ?? 1}
      active="opinion"
    >
      <AdminHandoff
        key={roundId}
        taskId={taskId}
        roundId={roundId}
        roundStatus={round?.status ?? ""}
        opinion={opinions?.[0] ?? null}
        summary={summaries?.[0] ?? null}
        actions={actions ?? []}
      />
    </ProjectShell>
  );
}
