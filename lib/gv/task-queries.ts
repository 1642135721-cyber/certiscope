import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectDisplayName, projectDisplayValue } from "@/lib/gv/presentation";

export interface TaskListItem {
  id: string;
  project_id: string;
  current_auditor_id: string;
  current_round_id: string | null;
  system: string;
  system_version: string;
  stage: string;
  incentive_path: "A" | "B" | null;
  facility_path: "C" | "D" | null;
  archived_at: string | null;
  created_at: string;
  projects: {
    name: string;
    project_type: string;
    location: string;
    area_value: number;
    area_unit: string;
    target_level: string;
  } | null;
}

export async function listAccessibleTasks(
  supabase: SupabaseClient,
): Promise<TaskListItem[]> {
  const { data, error } = await supabase
    .from("gv_tasks")
    .select(
      "id, project_id, current_auditor_id, current_round_id, system, system_version, stage, incentive_path, facility_path, archived_at, created_at, projects(name, project_type, location, area_value, area_unit, target_level, deleted_at)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error("任务列表读取失败。");
  return (data ?? []).filter((task) => {
    const project = Array.isArray(task.projects) ? task.projects[0] : task.projects;
    return Boolean(project) && !project.deleted_at;
  }).map((task) => {
    const project: unknown = task.projects;
    const projectRow = (Array.isArray(project) ? project[0] ?? null : project) as TaskListItem["projects"];
    return {
      ...task,
      projects: projectRow ? { ...projectRow, name: projectDisplayName(projectRow.name), project_type: projectDisplayValue(projectRow.project_type), location: projectDisplayValue(projectRow.location), target_level: projectDisplayValue(projectRow.target_level) } : null,
    };
  }) as TaskListItem[];
}

export function pathLabel(
  task: Pick<TaskListItem, "incentive_path" | "facility_path">,
): string {
  return task.incentive_path && task.facility_path
    ? `${task.incentive_path}＋${task.facility_path}`
    : "路径待确认";
}
