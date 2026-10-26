import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ActionResult, failure, success } from "@/lib/gv/action-result";

export interface CreateProjectInput {
  name: string;
  projectType: string;
  location: string;
  areaValue: number;
  areaUnit: string;
  targetLevel: string;
  intakeFilePath?: string | null;
  auditorId: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateCreateProject(
  input: unknown,
): ActionResult<CreateProjectInput> {
  if (!input || typeof input !== "object")
    return failure("VALIDATION", "请填写项目信息。");
  const value = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of [
    "name",
    "projectType",
    "location",
    "areaUnit",
    "targetLevel",
  ] as const) {
    if (typeof value[key] !== "string" || !value[key].trim())
      fields[key] = "此项必填";
  }
  if (
    typeof value.areaValue !== "number" ||
    !Number.isFinite(value.areaValue) ||
    value.areaValue <= 0
  )
    fields.areaValue = "请输入大于零的建筑面积";
  if (typeof value.auditorId !== "string" || !uuidPattern.test(value.auditorId))
    fields.auditorId = "请选择审核员";
  if (value.intakeFilePath != null && typeof value.intakeFilePath !== "string")
    fields.intakeFilePath = "原件路径无效";
  if (Object.keys(fields).length)
    return failure("VALIDATION", "请逐项核对并填写完整。", fields);
  return success({
    name: String(value.name).trim(),
    projectType: String(value.projectType).trim(),
    location: String(value.location).trim(),
    areaValue: value.areaValue as number,
    areaUnit: String(value.areaUnit).trim(),
    targetLevel: String(value.targetLevel).trim(),
    intakeFilePath: value.intakeFilePath ? String(value.intakeFilePath) : null,
    auditorId: String(value.auditorId),
  });
}

export async function createProjectAndTask(
  supabase: SupabaseClient,
  input: CreateProjectInput,
  requestKey: string,
): Promise<
  ActionResult<{ projectId: string; taskId: string; roundId: string }>
> {
  const { data: scopeCandidates, error: candidateError } = input.intakeFilePath
    ? await supabase
        .from("project_scope_candidates")
        .select("field_key, candidate_value")
        .eq("intake_file_path", input.intakeFilePath)
    : { data: [], error: null };
  if (candidateError)
    return failure("RETRYABLE", "申报表单范围候选暂时无法读取，请稍后重试。");
  const uniqueCandidate = (field: string) => {
    const values = [
      ...new Set(
        (scopeCandidates ?? [])
          .filter((candidate) => candidate.field_key === field)
          .map((candidate) => candidate.candidate_value.trim())
          .filter(Boolean),
      ),
    ];
    return values.length === 1 ? values[0] : "";
  };
  const { data, error } = await supabase.rpc("create_gv_project", {
    p_name: input.name,
    p_project_type: input.projectType,
    p_location: input.location,
    p_area_value: input.areaValue,
    p_area_unit: input.areaUnit,
    p_target_level: input.targetLevel,
    p_intake_file_path: input.intakeFilePath ?? null,
    p_current_auditor_id: input.auditorId,
    p_system: uniqueCandidate("system"),
    p_system_version: uniqueCandidate("system_version"),
    p_stage: uniqueCandidate("stage"),
    p_request_key: requestKey,
  });
  if (error || !Array.isArray(data) || !data[0]) {
    if (error?.message.includes("必须指定有效审核员"))
      return failure("VALIDATION", "所选审核员不可用，请重新选择。", {
        auditorId: "审核员不可用",
      });
    if (error?.message.includes("申报表单原件不存在"))
      return failure(
        "VALIDATION",
        "申报表单原件不存在或无权访问，请重新上传。",
        { intakeFilePath: "原件不可用" },
      );
    return failure("RETRYABLE", "项目保存失败，请稍后重试。");
  }
  const row = data[0] as {
    project_id: string;
    task_id: string;
    round_id: string;
  };
  return success(
    { projectId: row.project_id, taskId: row.task_id, roundId: row.round_id },
    "项目和 GV 任务已建立",
  );
}
