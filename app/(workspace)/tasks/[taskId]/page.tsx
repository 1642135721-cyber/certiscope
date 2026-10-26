import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ProjectShell } from "@/components/workspace/project-shell";
import {
  explicitScopeCandidates,
  isRuleReferenceDocument,
} from "@/lib/gv/project-intake";
import { pathLabel } from "@/lib/gv/task-queries";
import type { SourceLocation } from "@/lib/gv/types";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";
import { ScopeConfirmation } from "./materials/scope-confirmation";

export const instant = false;

export default async function TaskPage({
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
    { data: auditor },
    { data: files },
    { data: projectFiles },
  ] = await Promise.all([
    context.supabase
      .from("projects")
      .select(
        "name, project_type, location, area_value, area_unit, target_level, intake_file_path",
      )
      .eq("id", context.task.project_id)
      .maybeSingle(),
    context.supabase
      .from("task_rounds")
      .select(
        "id, sequence, status, submitted_at, rule_version_id, scope_confirmed_at",
      )
      .eq("id", context.task.current_round_id ?? "")
      .maybeSingle(),
    context.supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", context.task.current_auditor_id)
      .maybeSingle(),
    context.supabase
      .from("material_versions")
      .select("id, material_id, round_id, version, file_name, created_at")
      .eq("task_id", taskId)
      .eq("round_id", context.task.current_round_id ?? "")
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("project_source_files")
      .select("file_name, storage_path")
      .eq("project_id", context.task.project_id)
      .is("removed_at", null),
  ]);
  const intakeFile = (projectFiles ?? []).find(
    (file) => file.storage_path === project?.intake_file_path,
  );
  const { data: scopeCandidates, error: scopeError } =
    project?.intake_file_path &&
    !isRuleReferenceDocument(intakeFile?.file_name ?? "")
      ? await context.supabase
          .from("project_scope_candidates")
          .select("id, field_key, candidate_value, source_location")
          .eq("intake_file_path", project.intake_file_path)
          .order("created_at")
      : { data: [], error: null };
  const latestFiles = (files ?? []).filter(
    (file, index, list) =>
      list.findIndex((item) => item.material_id === file.material_id) === index,
  );
  const latestIds = latestFiles.map((file) => file.id);
  const applicantFiles = latestFiles.filter(
    (file) => !isRuleReferenceDocument(file.file_name),
  );
  const applicantIds = new Set(applicantFiles.map((file) => file.id));
  const { data: fragments } = latestIds.length
    ? await context.supabase
        .from("parsed_fragments")
        .select(
          "material_version_id, kind, text_content, source_location, status",
        )
        .in("material_version_id", latestIds)
    : { data: [] };
  const fileNames = new Map(
    latestFiles.map((file) => [file.id, file.file_name]),
  );
  const materialCandidates = explicitScopeCandidates(
    (fragments ?? [])
      .filter((fragment) => applicantIds.has(fragment.material_version_id))
      .map((fragment) => ({
        text: fragment.text_content,
        source: fragment.source_location as SourceLocation,
        kind: fragment.kind as
          | "paragraph"
          | "table_cell"
          | "image"
          | "page_text",
        status: fragment.status as "extracted" | "needs_review" | "failed",
      })),
    "material",
  ).map((item, index) => ({
    id: `material-${index}`,
    field_key: item.field,
    candidate_value: item.value,
    source_location: {
      ...item.source,
      fileName: fileNames.get(item.source.materialVersionId) ?? "本轮材料",
    },
  }));
  const { data: aiCandidates } = latestIds.length
    ? await context.supabase
        .from("fact_candidates")
        .select(
          "id, field_key, candidate_value, source_location, material_version_id",
        )
        .eq("round_id", context.task.current_round_id ?? "")
        .eq("state", "candidate")
        .in("material_version_id", latestIds)
        .in("field_key", [
          "system",
          "system_version",
          "stage",
          "credit_scope",
          "incentive_path",
          "facility_path",
        ])
        .order("created_at", { ascending: false })
    : { data: [] };
  const extractedCandidates = (aiCandidates ?? [])
    .filter((item) => applicantIds.has(item.material_version_id))
    .map((item) => ({
      id: item.id,
      field_key: item.field_key,
      candidate_value: String(item.candidate_value),
      source_location: {
        ...(item.source_location as SourceLocation),
        fileName: fileNames.get(item.material_version_id) ?? "本轮材料",
      },
    }));
  const candidateMap = new Map<string, (typeof materialCandidates)[number]>();
  for (const item of [
    ...(scopeCandidates ?? []).map((candidate) => ({
      ...candidate,
      source_location: {
        ...(candidate.source_location as SourceLocation),
        fileName: intakeFile?.file_name ?? "建档来源文件",
      },
    })),
    ...materialCandidates,
    ...extractedCandidates,
  ]) {
    const key = `${item.field_key}:${item.candidate_value}`;
    const current = candidateMap.get(key);
    const score = (source: typeof item.source_location) =>
      (source.page ? 2 : 0) + (/\.pdf$/i.test(source.fileName ?? "") ? 1 : 0);
    if (
      !current ||
      score(item.source_location) > score(current.source_location)
    )
      candidateMap.set(key, item);
  }
  const allCandidates = [...candidateMap.values()];
  const { data: availablePackages } = await context.supabase
    .from("gv_rule_packages")
    .select("id, system, system_version, stage, package_version")
    .eq("code", "LT-GV")
    .eq("status", "active");
  const readonly = context.readonly || Boolean(context.task.archived_at);
  const path = pathLabel(context.task);
  return (
    <ProjectShell
      actor={context.actor}
      task={context.task}
      project={project}
      roundSequence={round?.sequence ?? 1}
      active="overview"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(330px,.85fr)]">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[23px] font-bold">本轮任务概览</h2>
              <p className="mt-2 text-sm text-[#8592a0]">
                核对当前项目、轮次和 GV 信用项的申报信息。
              </p>
            </div>
            <span className="rounded-full bg-[#e9f6ef] px-4 py-2 text-sm font-semibold text-[#187d54]">
              {readonly
                ? "只读历史"
                : round?.scope_confirmed_at
                  ? path
                  : "范围待确认"}
            </span>
          </div>
          <Link
            href="#scope-confirmation"
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#39a875] bg-[#f0faf4] px-5 py-2.5 text-sm font-bold text-[#0c7950]"
          >
            核对并确认审核范围 <ArrowRight size={16} />
          </Link>
          <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Info label="项目类型" value={project?.project_type} />
            <Info label="项目地点" value={project?.location} />
            <Info
              label="建筑面积"
              value={
                project
                  ? `${project.area_value} ${project.area_unit}`
                  : undefined
              }
            />
            <Info label="目标／申报等级" value={project?.target_level} />
            <Info
              label="当前审核员"
              value={
                auditor?.display_name ??
                (context.task.current_auditor_id === context.actor.id
                  ? context.actor.displayName
                  : "当前审核员")
              }
            />
            <Info
              label="当前轮次"
              value={round ? `第 ${round.sequence} 轮` : "待建立"}
            />
            <Info label="申报路径" value={path} />
            <Info
              label="锁定规则版本"
              value={round?.rule_version_id ?? "尚未锁定"}
            />
          </div>
          {!round?.scope_confirmed_at && (
            <p className="mt-6 rounded-xl bg-[#fff8ea] p-4 text-sm text-[#8d6a21]">
              系统先从申报表单识别路径、版本与 GV
              范围候选；审核员对照原件确认后才能启动规则审核。
            </p>
          )}
        </section>
        <aside className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-[22px] font-bold">本轮工作</h2>
          <p className="mt-2 text-sm leading-6 text-[#8592a0]">
            先核对系统识别候选与本轮材料，再进入规则审核。
          </p>
          <div className="mt-6 space-y-4 rounded-xl border border-[#e8efeb] p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[#7d8f89]">项目阶段</span>
              <strong>{context.task.stage}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#7d8f89]">申报路径</span>
              <strong>{path}</strong>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[#7d8f89]">当前状态</span>
              <strong>
                {readonly
                  ? "只读"
                  : round?.scope_confirmed_at
                    ? "范围已确认"
                    : "范围待确认"}
              </strong>
            </div>
          </div>
          <Link
            href={`/tasks/${taskId}/materials`}
            className="mt-6 flex items-center justify-center gap-2 rounded-full bg-[#0b8555] px-5 py-3 font-bold text-white hover:bg-[#096e47]"
          >
            <FileText size={19} /> 查看本轮材料 <ArrowRight size={18} />
          </Link>
          {readonly && (
            <p className="mt-4 text-center text-sm text-[#738b7b]">
              当前仅可查看参与历史，不能修改任务。
            </p>
          )}
        </aside>
        <div className="xl:col-span-2">
          {scopeError ? (
            <p
              role="alert"
              className="rounded-xl bg-[#fff0ec] p-4 text-[#a64532]"
            >
              申报表单候选暂时无法读取；仍可核对本轮材料候选。
            </p>
          ) : null}
          <ScopeConfirmation
            key={`${round?.scope_confirmed_at ?? "unconfirmed"}:${allCandidates.map((item) => item.id).join(",")}`}
            taskId={taskId}
            roundId={round?.id ?? ""}
            hasIntake={Boolean(
              project?.intake_file_path &&
                intakeFile &&
                !isRuleReferenceDocument(intakeFile.file_name),
            )}
            candidates={
              allCandidates as Parameters<
                typeof ScopeConfirmation
              >[0]["candidates"]
            }
            current={{
              system: context.task.system,
              systemVersion: context.task.system_version,
              stage: context.task.stage,
              incentivePath: context.task.incentive_path,
              facilityPath: context.task.facility_path,
            }}
            materialVersions={latestFiles.map((file) => ({
              id: file.id,
              fileName: file.file_name,
              version: file.version,
              isReference: isRuleReferenceDocument(file.file_name),
            }))}
            availablePackages={availablePackages ?? []}
            confirmedAt={round?.scope_confirmed_at ?? null}
            canConfirm={Boolean(
              context.actor.role === "auditor" &&
                !readonly &&
                round &&
                ["open", "returned"].includes(round.status) &&
                !round.submitted_at,
            )}
          />
        </div>
      </div>
    </ProjectShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="border-b border-[#edf1ec] pb-3 text-sm">
      <p className="text-[#849789]">{label}</p>
      <p className="mt-1 font-semibold text-[#163c2d]">{value ?? "—"}</p>
    </div>
  );
}
