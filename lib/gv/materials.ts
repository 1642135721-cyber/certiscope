import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { documentExtension, parseDocument } from "@/lib/documents/parse";
import { failure, success, type ActionResult } from "@/lib/gv/action-result";

const mimeTypes = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
} as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MaterialUploadInput {
  taskId: string;
  roundId: string;
  file: File;
  purpose: string;
  materialId?: string;
  sourceKind: "original" | "converted" | "screenshot";
  convertedFromVersionId?: string;
  conversionNote?: string;
  requestKey: string;
  actorId: string;
}

export async function saveMaterialVersion(
  supabase: SupabaseClient,
  input: MaterialUploadInput,
): Promise<ActionResult<{ materialId: string; versionId: string; version: number; parseStatus: string; parseReason?: string }>> {
  const extension = documentExtension(input.file.name);
  if (!extension) return failure("VALIDATION", "仅直接接收 PDF、DOC、DOCX、XLSX、JPG／JPEG、PNG；DWG／DXF 请先受控导出。", { file: "格式不支持" });
  if (!input.file.size || input.file.size > 50 * 1024 * 1024) return failure("VALIDATION", "文件为空或超过当前 50 MB 上传限制。", { file: "文件大小不合适" });
  if (!input.purpose.trim()) return failure("VALIDATION", "请填写材料用途。", { purpose: "此项必填" });
  if (input.materialId && !uuidPattern.test(input.materialId)) return failure("VALIDATION", "材料标识无效。");
  if (input.sourceKind === "converted" && (!input.convertedFromVersionId || !input.conversionNote?.trim())) return failure("VALIDATION", "转换件必须注明源文件版本和转换方式。");

  const { data: previous } = await supabase.from("material_versions")
    .select("material_id, id, version, parse_status, parse_reason")
    .eq("task_id", input.taskId).eq("request_key", input.requestKey).maybeSingle();
  if (previous) return success({ materialId: previous.material_id, versionId: previous.id, version: previous.version, parseStatus: previous.parse_status, parseReason: previous.parse_reason ?? undefined }, "该材料版本此前已保存");

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const versionId = randomUUID();
  const parsed = await parseDocument(input.file.name, bytes, versionId);
  if (parsed.status === "failed" && parsed.manualReason?.includes("扩展名不符")) return failure("VALIDATION", "文件内容与扩展名不符或文件已损坏，请核对原件。", { file: "文件内容不匹配" });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `${input.taskId}/${input.roundId}/${versionId}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("gv-materials").upload(storagePath, bytes, {
    contentType: mimeTypes[extension],
    upsert: false,
  });
  if (uploadError) return failure("RETRYABLE", "原件上传失败，请重试。");

  const { data, error } = await supabase.rpc("register_material_version", {
    p_task_id: input.taskId,
    p_round_id: input.roundId,
    p_material_id: input.materialId ?? null,
    p_version_id: versionId,
    p_purpose: input.purpose.trim(),
    p_file_name: input.file.name,
    p_mime_type: mimeTypes[extension],
    p_extension: extension,
    p_storage_path: storagePath,
    p_sha256: sha256,
    p_byte_size: bytes.length,
    p_source_kind: input.sourceKind,
    p_converted_from_version_id: input.convertedFromVersionId ?? null,
    p_conversion_note: input.conversionNote?.trim() ?? null,
    p_parse_status: parsed.status,
    p_parse_reason: parsed.manualReason ?? null,
    // PDF text extraction may contain NUL, which PostgreSQL JSONB rejects.
    p_fragments: parsed.fragments.map((fragment) => ({
      ...fragment,
      text: fragment.text.replaceAll("\u0000", ""),
      source: {
        ...fragment.source,
        note: fragment.source.note?.replaceAll("\u0000", ""),
      },
    })),
    p_request_key: input.requestKey,
  });
  if (error || !Array.isArray(data) || !data[0]) {
    await supabase.storage.from("gv-materials").remove([storagePath]);
    if (error?.message.includes("当前轮次不可写入")) return failure("CONFLICT", "本轮材料已锁定，请刷新后检查任务状态。");
    return failure("RETRYABLE", "原件已上传但登记未完成，请重试；页面不会显示为已保存。");
  }
  const row = data[0] as { material_id: string; material_version_id: string; version: number };
  return success({ materialId: row.material_id, versionId: row.material_version_id, version: row.version, parseStatus: parsed.status, parseReason: parsed.manualReason }, "材料版本已保存");
}
