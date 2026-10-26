import { NextResponse } from "next/server";
import type { LocatedContent } from "@/lib/ai/provider";
import { aiProvider } from "@/lib/ai/qwen";
import { imageVisionContent } from "@/lib/documents/parse-image";
import type { ParsedFragment } from "@/lib/documents/types";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import {
  explicitScopeCandidates,
  isRuleReferenceDocument,
  scopeFields,
} from "@/lib/gv/project-intake";
import type { SourceLocation } from "@/lib/gv/types";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { actor, task, supabase } = await requireTaskAccess(taskId, true);
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure("FORBIDDEN", "仅当前审核员可识别本轮材料。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: round } = await supabase
      .from("task_rounds")
      .select("id, status")
      .eq("id", task.current_round_id ?? "")
      .maybeSingle();
    if (!round || !["open", "returned"].includes(round.status)) {
      const result = failure("CONFLICT", "当前轮次已锁定，不能重新识别。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: versions, error: versionError } = await supabase
      .from("material_versions")
      .select("id, material_id, file_name, extension, storage_path, byte_size")
      .eq("round_id", round.id)
      .is("removed_at", null)
      .order("created_at", { ascending: false });
    if (versionError) throw versionError;
    const latest = (versions ?? []).filter(
      (file, index, list) =>
        list.findIndex((item) => item.material_id === file.material_id) ===
          index && !isRuleReferenceDocument(file.file_name),
    );
    if (!latest.length) {
      const result = failure("VALIDATION", "请先上传本轮审核材料。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const ids = latest.map((file) => file.id);
    const { data: fragments, error: fragmentError } = await supabase
      .from("parsed_fragments")
      .select(
        "material_version_id, text_content, source_location, kind, status",
      )
      .in("material_version_id", ids)
      .order("sequence")
      .limit(90);
    if (fragmentError) throw fragmentError;
    const directCandidates = explicitScopeCandidates(
      (fragments ?? []).map(
        (fragment): ParsedFragment => ({
          text: fragment.text_content,
          source: fragment.source_location as SourceLocation,
          kind: fragment.kind as ParsedFragment["kind"],
          status: fragment.status as ParsedFragment["status"],
        }),
      ),
      "material",
    ).map((item) => ({
      key: item.field,
      value: item.value,
      source: item.source,
      confidence: item.confidence,
    }));
    const contentParts: LocatedContent[] = (fragments ?? [])
      .filter((fragment) => fragment.text_content.trim())
      .map((fragment) => ({
        text: fragment.text_content.slice(0, 4000),
        source: fragment.source_location as SourceLocation,
      }));
    for (const file of latest
      .filter(
        (item) =>
          ["jpg", "jpeg", "png"].includes(item.extension) &&
          item.byte_size <= 5 * 1024 * 1024,
      )
      .slice(0, 3)) {
      const { data } = await supabase.storage
        .from("gv-materials")
        .download(file.storage_path);
      if (data)
        contentParts.push(
          imageVisionContent(
            new Uint8Array(await data.arrayBuffer()),
            file.extension as "jpg" | "jpeg" | "png",
            file.id,
          ),
        );
    }
    if (!contentParts.length) {
      const result = failure(
        "VALIDATION",
        "当前材料没有可识别的文本或图像，请对照原件手工核对并记录依据。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const hasPathPair =
      directCandidates.some((item) => item.key === "incentive_path") &&
      directCandidates.some((item) => item.key === "facility_path");
    const ai = hasPathPair
      ? null
      : await aiProvider.extractCandidates({
          taskId,
          roundId: round.id,
          materialVersions: ids,
          contentParts,
          requestedFields: [...scopeFields],
        });
    if (ai && !ai.ok && !directCandidates.length) {
      const result = failure(
        ai.retryable ? "RETRYABLE" : "VALIDATION",
        ai.message,
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const candidates = [
      ...directCandidates,
      ...(ai?.ok ? ai.value : []),
    ].filter(
      (item) =>
        scopeFields.includes(item.key as (typeof scopeFields)[number]) &&
        typeof item.value === "string" &&
        ids.includes(item.source.materialVersionId) &&
        String(item.value).trim() &&
        (item.key !== "incentive_path" || ["A", "B"].includes(item.value)) &&
        (item.key !== "facility_path" || ["C", "D"].includes(item.value)),
    );
    const { data: savedCandidates, error: savedError } = await supabase
      .from("fact_candidates")
      .select("field_key, candidate_value, material_version_id")
      .eq("round_id", round.id)
      .eq("state", "candidate")
      .in("field_key", [...scopeFields]);
    if (savedError) throw savedError;
    const known = new Set(
      (savedCandidates ?? []).map(
        (item) =>
          `${item.material_version_id}:${item.field_key}:${String(item.candidate_value)}`,
      ),
    );
    const fresh = candidates.filter((item) => {
      const key = `${item.source.materialVersionId}:${item.key}:${item.value}`;
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    if (fresh.length) {
      const { error } = await supabase.from("fact_candidates").insert(
        fresh.map((item) => ({
          task_id: taskId,
          round_id: round.id,
          material_version_id: item.source.materialVersionId,
          field_key: item.key,
          candidate_value: item.value,
          source_location: item.source,
          confidence: item.confidence ?? null,
          extraction_method: ai?.ok
            ? `scope:pattern+qwen:${ai.model}`
            : "scope:pattern",
          state: "candidate",
        })),
      );
      if (error) throw error;
    }
    return NextResponse.json(
      success(
        { count: fresh.length },
        fresh.length
          ? `已从本轮材料保存 ${fresh.length} 条新候选，请逐项核对原件。${ai && !ai.ok ? "AI 补充识别未完成，已保留可定位的直接文字候选。" : ""}`
          : candidates.length
            ? "本轮材料候选已存在，无需重复保存；请逐项核对原件。"
            : "材料已识别，但未找到可靠的路径、版本或范围候选；请人工核对原件。",
      ),
    );
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "本轮材料识别未完成，请稍后重试或人工核对原件。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
