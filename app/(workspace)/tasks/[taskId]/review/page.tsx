import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ProjectShell } from "@/components/workspace/project-shell";
import type {
  GvComputedResult,
  NumericCandidate,
  NumericConfirmation,
} from "@/lib/gv/rule-engine";
import {
  calibrateCandidateSupport,
  refineSemanticFindings,
} from "@/lib/gv/semantic-findings";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";
import { ReviewWorkspace } from "./review-workspace";

export const instant = false;

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  await connection();
  const { taskId } = await params;
  let context: Awaited<ReturnType<typeof requireTaskAccess>>;
  try {
    context = await requireTaskAccess(taskId);
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect("/login");
    notFound();
  }
  const [
    { data: project },
    { data: round },
    { data: files },
    { data: decisions },
    { data: assessments },
    { data: runs },
    { data: candidates },
    { data: confirmations },
  ] = await Promise.all([
    context.supabase
      .from("projects")
      .select("name, project_type, location, area_value, area_unit")
      .eq("id", context.task.project_id)
      .maybeSingle(),
    context.supabase
      .from("task_rounds")
      .select(
        "id, sequence, status, scope_confirmed_at, selected_material_version_ids",
      )
      .eq("id", context.task.current_round_id ?? "")
      .maybeSingle(),
    context.supabase
      .from("material_versions")
      .select(
        "id, file_name, mime_type, version, parse_status, parse_reason, created_at, materials(purpose)",
      )
      .eq("round_id", context.task.current_round_id ?? "")
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("gv_rule_decisions")
      .select(
        "id, rule_code, scope_confirmed_at, fact_check, decision, rationale, created_at, created_by",
      )
      .eq("round_id", context.task.current_round_id ?? "")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("gv_rule_ai_assessments")
      .select(
        "id, rule_code, scope_confirmed_at, support, citations, gaps, human_questions, provider, model, created_at",
      )
      .eq("round_id", context.task.current_round_id ?? "")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("gv_processing_runs")
      .select(
        "id, scope_confirmed_at, status, error_message, results, created_at, provider, model",
      )
      .eq("round_id", context.task.current_round_id ?? "")
      .order("created_at", { ascending: false })
      .limit(1),
    context.supabase
      .from("fact_candidates")
      .select(
        "id, field_key, candidate_value, unit, source_location, material_version_id",
      )
      .eq("round_id", context.task.current_round_id ?? "")
      .eq("state", "candidate")
      .order("created_at", { ascending: false })
      .limit(100),
    context.supabase
      .from("gv_fact_confirmations")
      .select("field_key, value, unit, source_location, created_at")
      .eq("round_id", context.task.current_round_id ?? "")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const selectedIds = new Set<string>(
    round?.selected_material_version_ids ?? [],
  );
  const selectedFiles = (files ?? [])
    .filter((file) => selectedIds.has(file.id))
    .map((file) => ({
      id: file.id,
      fileName: file.file_name,
      mimeType: file.mime_type,
      version: file.version,
      parseStatus: file.parse_status,
      parseReason: file.parse_reason,
      purpose:
        (Array.isArray(file.materials) ? file.materials[0] : file.materials)
          ?.purpose ?? "项目材料",
    }));
  const { data: fragments } = selectedIds.size
    ? await context.supabase
        .from("parsed_fragments")
        .select("material_version_id, sequence, text_content, source_location")
        .in("material_version_id", [...selectedIds])
        .order("sequence")
        .limit(80)
    : { data: [] };
  const currentDecisions = (decisions ?? []).filter(
    (decision) => decision.scope_confirmed_at === round?.scope_confirmed_at,
  );
  const currentAssessments = (assessments ?? []).filter(
    (assessment) => assessment.scope_confirmed_at === round?.scope_confirmed_at,
  );
  const latestRun = runs?.[0];
  const run =
    latestRun?.scope_confirmed_at === round?.scope_confirmed_at
      ? latestRun
      : null;
  const currentConfirmations = (
    (confirmations ?? []) as NumericConfirmation[]
  ).filter((item) => item.created_at >= (round?.scope_confirmed_at ?? ""));
  const runResults = (
    Array.isArray(run?.results) ? run.results : []
  ) as GvComputedResult[];
  const runAssessments = runResults.map((item) => {
    const { supported, unverified } = refineSemanticFindings(
      item.ruleId,
      item.supportedFindings ?? [],
      item.unverifiedFindings ?? [],
    );
    return {
      id: `${run!.id}-${item.ruleId}`,
      rule_code: item.ruleId,
      support: calibrateCandidateSupport(
        item,
        item.semanticSupport ?? "unknown",
        supported,
        unverified,
      ),
      citations: item.citations ?? [],
      gaps: item.issues.concat(
        (item as GvComputedResult & { gaps?: string[] }).gaps ?? [],
      ),
      supported_findings: supported,
      unverified_findings: unverified,
      human_questions: item.humanQuestions ?? [],
      provider: run!.provider,
      model: run!.model,
      created_at: run!.created_at,
    };
  });
  return (
    <ProjectShell
      actor={context.actor}
      task={context.task}
      project={project}
      roundSequence={round?.sequence ?? 1}
      active="review"
    >
      <ReviewWorkspace
        taskId={taskId}
        roundId={round?.id ?? ""}
        projectName={project?.name ?? "项目"}
        scopeConfirmed={Boolean(round?.scope_confirmed_at)}
        incentivePath={context.task.incentive_path}
        facilityPath={context.task.facility_path}
        canEdit={Boolean(
          round &&
            ["open", "returned"].includes(round.status) &&
            context.actor.role === "auditor" &&
            context.actor.id === context.task.current_auditor_id &&
            !context.readonly &&
            !context.task.archived_at,
        )}
        files={selectedFiles}
        fragments={(fragments ?? []).map((item) => {
          const source = item.source_location as {
            page?: number;
            sheet?: string;
            cell?: string;
            paragraph?: number;
          } | null;
          return {
            fileId: item.material_version_id,
            text: item.text_content,
            page: source?.page ?? null,
            sheet: source?.sheet,
            cell: source?.cell,
            paragraph: source?.paragraph,
          };
        })}
        decisions={currentDecisions}
        assessments={run ? runAssessments : currentAssessments}
        run={
          run
            ? {
                id: run.id,
                status: run.status,
                errorMessage: run.error_message,
                createdAt: run.created_at,
                results: runResults,
              }
            : null
        }
        candidates={
          (candidates ?? []).filter((item) =>
            selectedIds.has(item.material_version_id ?? ""),
          ) as NumericCandidate[]
        }
        confirmations={currentConfirmations}
      />
    </ProjectShell>
  );
}
