import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { isRuleReferenceDocument } from "@/lib/gv/project-intake";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { supabase, task } = await requireTaskAccess(taskId);
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("intake_file_path")
      .eq("id", task.project_id)
      .single();
    if (projectError) throw projectError;
    const { data: intakeFile } = project.intake_file_path
      ? await supabase
          .from("project_source_files")
          .select("file_name")
          .eq("project_id", task.project_id)
          .eq("storage_path", project.intake_file_path)
          .is("removed_at", null)
          .maybeSingle()
      : { data: null };
    const hasIntake = Boolean(
      intakeFile && !isRuleReferenceDocument(intakeFile.file_name),
    );
    const { data: candidates, error: candidatesError } =
      hasIntake && project.intake_file_path
        ? await supabase
            .from("project_scope_candidates")
            .select(
              "id, field_key, candidate_value, source_location, confidence",
            )
            .eq("intake_file_path", project.intake_file_path)
            .order("created_at")
        : { data: [], error: null };
    if (candidatesError) throw candidatesError;
    const { data: round, error: roundError } = await supabase
      .from("task_rounds")
      .select(
        "id, sequence, selected_material_version_ids, scope_confirmed_at, scope_snapshot",
      )
      .eq("id", task.current_round_id ?? "")
      .maybeSingle();
    if (roundError) throw roundError;
    return NextResponse.json(
      success(
        {
          candidates: candidates ?? [],
          round,
          hasIntake,
        },
        "审核范围候选已加载",
      ),
    );
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "审核范围候选暂时无法读取。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { supabase, task, actor } = await requireTaskAccess(taskId, true);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure("FORBIDDEN", "仅当前审核员可确认审核范围。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const roundId = String(body.roundId ?? "");
    const ids = body.materialVersionIds;
    if (
      roundId !== task.current_round_id ||
      !Array.isArray(ids) ||
      !ids.every((id) => typeof id === "string")
    ) {
      const result = failure("VALIDATION", "轮次或材料版本选择无效。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: selectedFiles, error: selectedError } = await supabase
      .from("material_versions")
      .select("id, file_name")
      .eq("task_id", taskId)
      .eq("round_id", roundId)
      .is("removed_at", null)
      .in("id", ids);
    if (selectedError) throw selectedError;
    if (
      (selectedFiles ?? []).length !== new Set(ids).size ||
      (selectedFiles ?? []).some((file) =>
        isRuleReferenceDocument(file.file_name),
      )
    ) {
      const result = failure(
        "VALIDATION",
        "本轮材料只能选择项目证据文件，不能把官方规则文件作为项目证据。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const systemVersion = String(body.systemVersion ?? "")
      .trim()
      .replace(/^LEED\s+/i, "");
    const suppliedReason = String(body.reason ?? "").trim();
    const recordedReason =
      suppliedReason ||
      `审核员确认 ${String(body.system ?? "").trim()} ${systemVersion}、${String(body.stage ?? "").trim()}、${String(body.incentivePath ?? "")}＋${String(body.facilityPath ?? "")} 路径；本轮选中材料：${(selectedFiles ?? []).map((file) => file.file_name).join("、")}。未填写补充说明。`;
    const { data, error } = await supabase.rpc("confirm_gv_scope", {
      p_task_id: taskId,
      p_round_id: roundId,
      p_system: String(body.system ?? ""),
      p_system_version: systemVersion,
      p_stage: String(body.stage ?? ""),
      p_credit_scope: "LT · Green Vehicles",
      p_incentive_path: String(body.incentivePath ?? ""),
      p_facility_path: String(body.facilityPath ?? ""),
      p_material_version_ids: ids,
      p_reason: recordedReason,
    });
    if (error) {
      const known = [
        "当前体系、版本或阶段没有可用的 GV 规则包，请联系审核管理员",
        "候选缺失或修正时须填写原件依据及理由",
        "请至少选择一份本轮材料",
        "所选材料版本与当前轮次不符",
        "缺少项目申报表单",
        "无申报表单时须填写本轮材料的原件依据及理由",
        "候选缺失、冲突或修正时须填写原件依据及理由",
        "体系、版本、阶段、GV 范围或申报路径不完整",
        "当前任务或轮次不可确认",
        "当前轮次已锁定",
      ];
      const message =
        known.find((part) => error.message.includes(part)) ??
        "审核范围确认失败，请刷新后核对候选与材料版本。";
      const result = failure("CONFLICT", message);
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    return NextResponse.json(
      success(data, "审核范围、版本、路径与本轮材料已确认"),
    );
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "审核范围确认暂时失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
