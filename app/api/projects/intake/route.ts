import { NextResponse } from "next/server";
import { documentExtension } from "@/lib/documents/parse";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { recordAuditEvent } from "@/lib/gv/audit-events";
import {
  extractProjectIntake,
  intakeFields,
  scopeFields,
} from "@/lib/gv/project-intake";
import { AuthorizationError, requireRole } from "@/lib/supabase/auth";

export async function POST(request: Request) {
  try {
    const { supabase, actor } = await requireRole("admin");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name) {
      const result = failure("VALIDATION", "请选择申报表单原件。", {
        file: "缺少文件",
      });
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const extension = documentExtension(file.name);
    if (!extension) {
      const result = failure(
        "VALIDATION",
        "文件格式不支持直接识别，请上传 PDF、DOC、DOCX、XLSX、JPG 或 PNG。",
        { file: "格式不支持" },
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    if (file.size === 0 || file.size > 50 * 1024 * 1024) {
      const result = failure(
        "VALIDATION",
        "文件为空或超过当前 50 MB 上传限制。",
        { file: "文件大小不合适" },
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileId = crypto.randomUUID();
    const path = `${actor.id}/${fileId}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("gv-intake")
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      await recordAuditEvent(supabase, {
        actorId: actor.id,
        type: "upload",
        success: false,
        errorCode: "STORAGE_FAILED",
      });
      const result = failure("RETRYABLE", "原件上传失败，请稍后重试。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    await recordAuditEvent(supabase, {
      actorId: actor.id,
      type: "upload",
      success: true,
    });
    const extraction = await extractProjectIntake(file.name, bytes, fileId);
    const projectCandidates = extraction.candidates.filter((candidate) =>
      intakeFields.includes(candidate.field as (typeof intakeFields)[number]),
    );
    const scopeCandidates = extraction.candidates.filter((candidate) =>
      scopeFields.includes(candidate.field as (typeof scopeFields)[number]),
    );
    if (projectCandidates.length) {
      const { error } = await supabase.from("project_intake_candidates").insert(
        projectCandidates.map((candidate) => ({
          intake_file_path: path,
          field_key: candidate.field,
          candidate_value: candidate.value,
          source_location: candidate.source,
          confidence: candidate.confidence ?? null,
          created_by: actor.id,
        })),
      );
      if (error) {
        const result = success(
          {
            path,
            candidates: [],
            parseStatus: extraction.parseStatus,
            message: "原件已保存，但识别候选未能保存；请手工核对五项资料。",
          },
          "原件已保存",
        );
        return NextResponse.json(result);
      }
    }
    if (scopeCandidates.length) {
      const { error } = await supabase.from("project_scope_candidates").insert(
        scopeCandidates.map((candidate) => ({
          intake_file_path: path,
          field_key: candidate.field,
          candidate_value: candidate.value,
          source_location: candidate.source,
          confidence: candidate.confidence ?? null,
          created_by: actor.id,
        })),
      );
      if (error) {
        return NextResponse.json(
          success(
            {
              path,
              candidates: projectCandidates,
              parseStatus: extraction.parseStatus,
              message: "原件已保存，但审核范围候选未能保存；请稍后重新识别。",
            },
            "原件已保存",
          ),
        );
      }
    }
    return NextResponse.json(
      success(
        {
          path,
          candidates: extraction.candidates,
          parseStatus: extraction.parseStatus,
          message: extraction.message,
        },
        "原件已保存，候选值待核对",
      ),
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      const result = failure(
        error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
        error.message,
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const result = failure("INTERNAL", "申报表单处理失败，请稍后重试。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
