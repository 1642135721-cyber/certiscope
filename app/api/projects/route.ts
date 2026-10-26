import { NextResponse } from "next/server";
import {
  actionStatus,
  failure,
  readIdempotencyKey,
} from "@/lib/gv/action-result";
import { isProjectApplicationDocument } from "@/lib/gv/project-intake";
import {
  AuthorizationError,
  getCurrentActor,
  requireRole,
} from "@/lib/supabase/auth";

export async function GET() {
  try {
    const { supabase, actor } = await getCurrentActor();
    if (actor.role === "rule_maintainer")
      throw new AuthorizationError("当前账号无权访问项目资料。", 403);
    const { data, error } = await supabase
      .from("gv_tasks")
      .select(
        "id, project_id, current_auditor_id, current_round_id, system, system_version, stage, incentive_path, facility_path, archived_at, created_at, projects(name, project_type, location, area_value, area_unit, target_level, deleted_at)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      data: (data ?? []).filter((task) => {
        const project = Array.isArray(task.projects)
          ? task.projects[0]
          : task.projects;
        return project && !project.deleted_at;
      }),
    });
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "项目列表暂时不可用。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, actor } = await requireRole("admin");
    const requestKey = readIdempotencyKey(request);
    if (!requestKey) {
      const result = failure("VALIDATION", "缺少请求标识，请刷新页面后重试。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const input = (await request.json()) as Record<string, unknown>;
    const required = [
      "name",
      "projectType",
      "location",
      "areaUnit",
      "targetLevel",
    ];
    if (
      required.some(
        (key) => typeof input[key] !== "string" || !String(input[key]).trim(),
      ) ||
      typeof input.areaValue !== "number" ||
      !Number.isFinite(input.areaValue) ||
      input.areaValue <= 0
    ) {
      const result = failure(
        "VALIDATION",
        "请核对项目名称、类型、地点、面积和申报等级。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const sourceFiles = Array.isArray(input.sourceFiles)
      ? input.sourceFiles.filter(
          (
            file,
          ): file is { path: string; name: string; parseStatus?: string } =>
            typeof file === "object" &&
            file !== null &&
            typeof file.path === "string" &&
            typeof file.name === "string",
        )
      : [];
    if (sourceFiles.some((file) => !file.path.startsWith(`${actor.id}/`))) {
      const result = failure(
        "VALIDATION",
        "项目材料不属于当前账号，请重新上传。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const applicationIndex = sourceFiles.findIndex((file) =>
      isProjectApplicationDocument(file.name),
    );
    const orderedFiles = [...sourceFiles];
    if (applicationIndex > 0) {
      const [application] = orderedFiles.splice(applicationIndex, 1);
      orderedFiles.unshift(application);
    }
    const { data: projectId, error } = await supabase.rpc(
      "create_project_record",
      {
        p_name: String(input.name).trim(),
        p_project_type: String(input.projectType).trim(),
        p_location: String(input.location).trim(),
        p_area_value: input.areaValue,
        p_area_unit: String(input.areaUnit).trim(),
        p_target_level: String(input.targetLevel).trim(),
        p_source_files: orderedFiles,
        p_request_key: requestKey,
      },
    );
    if (error || !projectId)
      return NextResponse.json(
        failure("RETRYABLE", error?.message ?? "项目保存失败，请稍后重试。"),
        { status: 503 },
      );
    if (applicationIndex < 0 && orderedFiles.length) {
      const { error: clearError } = await supabase
        .from("projects")
        .update({ intake_file_path: null })
        .eq("id", projectId)
        .eq("intake_file_path", orderedFiles[0].path);
      if (clearError)
        return NextResponse.json(
          failure("RETRYABLE", "项目已保存，申报表状态校正未完成，请重试。"),
          { status: 503 },
        );
    }
    return NextResponse.json({
      ok: true,
      data: { projectId },
      message: "项目与材料已保存，可按类别分配审核员。",
    });
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "项目保存失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
