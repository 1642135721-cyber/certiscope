import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEventType =
  | "upload"
  | "review_start"
  | "review_failure"
  | "manual_correction"
  | "recalculate"
  | "confirmation"
  | "opinion_submit"
  | "return"
  | "assignment"
  | "rule_upgrade"
  | "export"
  | "archive"
  | "rule_publish";

export async function recordAuditEvent(
  supabase: SupabaseClient,
  event: {
    actorId: string;
    type: AuditEventType;
    success: boolean;
    taskId?: string;
    roundId?: string;
    objectId?: string;
    versionId?: string;
    errorCode?: string;
  },
) {
  const { error } = await supabase.from("operation_events").insert({
    actor_id: event.actorId,
    event_type: event.type,
    success: event.success,
    task_id: event.taskId ?? null,
    round_id: event.roundId ?? null,
    object_id: event.objectId ?? null,
    version_id: event.versionId ?? null,
    error_code: event.errorCode ?? null,
  });
  if (error) throw new Error("操作记录保存失败，请重试。");
}
