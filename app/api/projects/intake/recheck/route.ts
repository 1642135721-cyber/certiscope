import { NextResponse } from "next/server";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { extractProjectIntake, intakeFields } from "@/lib/gv/project-intake";
import { AuthorizationError, requireRole } from "@/lib/supabase/auth";

export async function POST(request: Request) {
  try {
    const { supabase, actor } = await requireRole("admin");
    const input = (await request.json()) as { path?: string; name?: string };
    const path = input.path ?? "";
    const name = input.name ?? "";
    if (
      !path.startsWith(`${actor.id}/`) ||
      !name ||
      !/\.(pdf|doc|docx|xlsx|jpe?g|png)$/i.test(name)
    ) {
      const result = failure(
        "VALIDATION",
        "只能重新识别自己已上传的受支持材料。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data, error } = await supabase.storage
      .from("gv-intake")
      .download(path);
    if (error || !data) {
      const result = failure(
        "RETRYABLE",
        "已上传材料暂时无法读取，请稍后重试。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const fileId =
      path
        .split("/")
        .pop()
        ?.replace(/\.[^.]+$/, "") ?? "";
    const extraction = await extractProjectIntake(
      name,
      new Uint8Array(await data.arrayBuffer()),
      fileId,
    );
    const projectCandidates = extraction.candidates.filter((candidate) =>
      intakeFields.includes(candidate.field as (typeof intakeFields)[number]),
    );
    if (projectCandidates.length) {
      const { error: saveError } = await supabase
        .from("project_intake_candidates")
        .insert(
          projectCandidates.map((candidate) => ({
            intake_file_path: path,
            field_key: candidate.field,
            candidate_value: candidate.value,
            source_location: candidate.source,
            confidence: candidate.confidence ?? null,
            created_by: actor.id,
          })),
        );
      if (saveError) {
        const result = failure(
          "RETRYABLE",
          "候选已识别，但暂时无法保存，请稍后重试。",
        );
        return NextResponse.json(result, { status: actionStatus(result) });
      }
    }
    return NextResponse.json(
      success({ candidates: extraction.candidates }, "已重新识别材料"),
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      const result = failure(
        error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        error.message,
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const result = failure("INTERNAL", "重新识别失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
