import "server-only";
import type { BusinessRole } from "@/lib/gv/types";
import { createClient } from "@/lib/supabase/server";

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentActor() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new AuthorizationError("请先登录。", 401);

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, display_name, role, active")
    .eq("id", auth.user.id)
    .single();
  if (profileError || !profile?.active)
    throw new AuthorizationError("账号尚未获得使用权限。", 403);
  if (!["auditor", "admin", "rule_maintainer"].includes(profile.role)) {
    throw new AuthorizationError("账号角色无效。", 403);
  }
  return {
    supabase,
    actor: {
      id: auth.user.id,
      email: auth.user.email ?? "",
      displayName: profile.display_name as string,
      role: profile.role as BusinessRole,
    },
  };
}

export async function requireRole(...roles: BusinessRole[]) {
  const context = await getCurrentActor();
  if (!roles.includes(context.actor.role))
    throw new AuthorizationError("当前账号无权执行此操作。", 403);
  return context;
}

export async function requireTaskAccess(taskId: string, write = false) {
  const context = await getCurrentActor();
  if (context.actor.role === "rule_maintainer")
    throw new AuthorizationError("当前账号无权访问项目资料。", 403);
  const { data: task } = await context.supabase
    .from("gv_tasks")
    .select("id, project_id, current_auditor_id, current_round_id, archived_at, system, system_version, stage, incentive_path, facility_path, rule_version_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) throw new AuthorizationError("无法访问该任务。", 403);
  const { data: activeProject } = await context.supabase.from("projects")
    .select("id").eq("id", task.project_id).is("deleted_at", null).maybeSingle();
  if (!activeProject) throw new AuthorizationError("所属项目已移入回收站。", 403);
  if (write && task.archived_at)
    throw new AuthorizationError("任务已归档，只能查看历史。", 403);
  if (
    context.actor.role === "admin" ||
    task.current_auditor_id === context.actor.id
  ) {
    return { ...context, task, readonly: false };
  }
  if (write) throw new AuthorizationError("当前账号无权修改该任务。", 403);
  const { data: history } = await context.supabase
    .from("task_participants")
    .select("task_id")
    .eq("task_id", taskId)
    .eq("user_id", context.actor.id)
    .maybeSingle();
  if (!history) throw new AuthorizationError("无法访问该任务。", 403);
  return { ...context, task, readonly: true };
}
