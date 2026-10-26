import { Check, CircleAlert, FileText, Leaf, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ProjectShell } from "@/components/workspace/project-shell";
import { pathLabel } from "@/lib/gv/task-queries";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";
import {
  AdminMaterialRemove,
  MaterialOpen,
  MaterialUpload,
} from "./material-actions";

export const instant = false;

export default async function MaterialsPage({
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
    { data: files, error: filesError },
    { data: decisions },
    { data: rulePackage },
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
        "id, sequence, status, source, submitted_at, rule_version_id, selected_material_version_ids, scope_confirmed_at",
      )
      .eq("id", context.task.current_round_id ?? "")
      .maybeSingle(),
    context.supabase
      .from("material_versions")
      .select(
        "id, material_id, round_id, version, file_name, extension, byte_size, source_kind, converted_from_version_id, conversion_note, parse_status, parse_reason, created_at, materials(purpose)",
      )
      .eq("task_id", taskId)
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("gv_rule_decisions")
      .select("rule_code, decision, fact_check, rationale, created_at")
      .eq("round_id", context.task.current_round_id ?? "")
      .order("created_at", { ascending: false }),
    context.supabase
      .from("gv_rule_packages")
      .select("package_version")
      .eq("id", context.task.rule_version_id ?? "")
      .maybeSingle(),
  ]);
  const currentFiles = (files ?? []).filter(
    (file) => file.round_id === round?.id,
  );
  const latestFiles = currentFiles.filter(
    (file, index, list) =>
      list.findIndex((item) => item.material_id === file.material_id) === index,
  );
  const olderVersions = currentFiles.length - latestFiles.length;
  const canUpload = Boolean(
    round &&
      ["open", "returned"].includes(round.status) &&
      !round.submitted_at &&
      !context.readonly &&
      !context.task.archived_at,
  );
  const pathConfirmed = Boolean(
    round?.scope_confirmed_at &&
      context.task.incentive_path &&
      context.task.facility_path,
  );
  const isAuditor =
    context.actor.role === "auditor" &&
    context.task.current_auditor_id === context.actor.id;
  const parseProblems = latestFiles.filter(
    (file) =>
      file.parse_status === "failed" || file.parse_status === "needs_review",
  );
  const outstandingDecisions = (decisions ?? []).filter(
    (decision, index, list) =>
      list.findIndex((item) => item.rule_code === decision.rule_code) ===
        index &&
      (decision.decision === "supplement" ||
        decision.decision === "defer" ||
        decision.fact_check === "conflict"),
  );

  return (
    <ProjectShell
      actor={context.actor}
      task={context.task}
      project={project}
      roundSequence={round?.sequence ?? 1}
      active="materials"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(330px,.85fr)]">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[23px] font-bold">本轮材料</h2>
              <p className="mt-2 text-sm leading-6 text-[#8592a0]">
                请根据本次申报范围上传相应的原始资料。页面仅列出本任务已登记的真实文件及版本。
              </p>
            </div>
            {round?.source === "supplement" && (
              <Link
                href={`/tasks/${taskId}/supplement`}
                className="rounded-full border border-[#299464] px-4 py-2 text-sm font-semibold text-[#0b7950]"
              >
                查看补件核对
              </Link>
            )}
            {canUpload && round && (
              <MaterialUpload taskId={taskId} roundId={round.id} />
            )}
          </div>

          {filesError ? (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-[#fff0ec] p-4 text-[#a64532]"
            >
              材料列表暂时无法读取，请刷新页面重试。
            </p>
          ) : latestFiles.length ? (
            <div className="mt-5 space-y-2.5">
              {latestFiles.map((file) => {
                const material = Array.isArray(file.materials)
                  ? file.materials[0]
                  : file.materials;
                const purpose = material?.purpose ?? "项目材料";
                return (
                  <div
                    key={file.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e9eeee] px-4 py-3 md:flex-nowrap"
                  >
                    <div
                      className={`grid size-11 shrink-0 place-items-center rounded-lg ${file.extension === "pdf" ? "bg-[#e6f7ed] text-[#0d9660]" : "bg-[#e8f0ff] text-[#367ee2]"}`}
                    >
                      <FileText size={25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{file.file_name}</p>
                      <p className="mt-1 text-xs text-[#8a98a7]">
                        {purpose}　|　第 {file.version} 版　|　
                        {file.source_kind === "converted"
                          ? "受控转换件"
                          : file.source_kind === "screenshot"
                            ? "受控截图"
                            : "原件"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${file.parse_status === "extracted" ? "bg-[#eaf8f0] text-[#0f8b5b]" : file.parse_status === "failed" ? "bg-[#fff0eb] text-[#cd543c]" : "bg-[#fff8e7] text-[#aa7b25]"}`}
                    >
                      {file.parse_status === "extracted"
                        ? "已解析"
                        : file.parse_status === "failed"
                          ? "解析失败"
                          : file.parse_status === "needs_review"
                            ? "待人工核对"
                            : "待解析"}
                    </span>
                    <span className="text-xs text-[#8291a2]">
                      {new Date(file.created_at).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="flex items-center gap-3">
                      <MaterialOpen fileId={file.id} />
                      {canUpload && round && (
                        <MaterialUpload
                          taskId={taskId}
                          roundId={round.id}
                          materialId={file.material_id}
                          initialPurpose={purpose}
                        />
                      )}
                      {context.actor.role === "admin" &&
                        !context.task.archived_at &&
                        round &&
                        (["open", "returned"].includes(round.status) ||
                          !round.selected_material_version_ids?.includes(file.id)) && (
                          <AdminMaterialRemove
                            projectId={context.task.project_id}
                            versionId={file.id}
                            fileName={file.file_name}
                          />
                        )}
                    </div>
                  </div>
                );
              })}
              {olderVersions > 0 && (
                <p className="pt-2 text-sm text-[#7f9087]">
                  另有 {olderVersions}{" "}
                  个历史文件版本已保留，可在审核记录中查看。
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-dashed border-[#bfd6c9] bg-[#f8fcfa] px-6 py-10 text-center text-[#728b7e]">
              本轮尚未登记原始材料。
              {canUpload ? "请先上传正式提交的文件。" : "当前轮次不可上传。"}
            </div>
          )}

          <div className="mt-5 rounded-xl bg-[#fff7f5] p-4">
            <h3 className="font-bold">待补充与人工接续</h3>
            {parseProblems.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-[#9f6355]">
                {parseProblems.map((file) => (
                  <li key={file.id}>
                    {file.file_name}：
                    {file.parse_reason ?? "解析结果需人工核对"}
                  </li>
                ))}
              </ul>
            )}
            {outstandingDecisions.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-[#9f6355]">
                {outstandingDecisions.map((decision) => (
                  <li key={decision.rule_code}>
                    {decision.rule_code}：{decision.rationale}
                  </li>
                ))}
              </ul>
            )}
            {!parseProblems.length && !outstandingDecisions.length && (
              <p className="mt-2 text-sm text-[#9e8b8a]">
                {pathConfirmed
                  ? "请按已确认的申报路径核对缺件；目前未登记具体缺件。"
                  : "请先核对申报表单的系统识别候选，确认版本、范围、路径和本轮材料。"}
              </p>
            )}
          </div>
        </section>

        <aside className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-[22px] font-bold">启动前核对</h2>
          <p className="mt-1 text-sm text-[#8592a0]">
            确认以下内容后，才能开始预审。
          </p>
          <div className="mt-5 divide-y divide-[#edf1f0] rounded-xl border border-[#e9eeee] px-4">
            <CheckRow
              okay={Boolean(round?.scope_confirmed_at)}
              detail={
                round?.scope_confirmed_at ? (
                  <>LT · Green Vehicles</>
                ) : (
                  <>待审核员核对申报表单</>
                )
              }
              title="认证条款范围已确认"
            />
            <CheckRow
              okay={latestFiles.length > 0}
              detail={
                <>
                  {latestFiles.length} 个当前文件版本
                  {olderVersions > 0
                    ? `，另存 ${olderVersions} 个历史版本`
                    : ""}
                </>
              }
              title="原始文件已登记"
            />
            <CheckRow
              okay={pathConfirmed}
              detail={
                pathConfirmed
                  ? pathLabel(context.task as Parameters<typeof pathLabel>[0])
                  : "系统候选待审核员核对"
              }
              title="路径、版本与范围已确认"
            />
            <CheckRow
              okay={parseProblems.length === 0}
              detail={
                parseProblems.length
                  ? `${parseProblems.length} 份材料需要人工接续`
                  : "当前文件没有已知解析失败"
              }
              title="材料解析状态"
            />
            <CheckRow
              okay={Boolean(round?.rule_version_id)}
              detail={
                rulePackage?.package_version ??
                round?.rule_version_id ??
                "尚未锁定适用规则版本"
              }
              title="规则版本已锁定"
            />
          </div>
          <a
            href={`/tasks/${taskId}/review`}
            aria-disabled={!pathConfirmed}
            className={`mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-lg font-bold ${pathConfirmed ? "bg-[#0b8555] text-white" : "pointer-events-none bg-[#b7d8c8] text-white"}`}
          >
            <LockKeyhole size={19} />
            进入审核与复核
          </a>
          <p className="mt-2 text-center text-xs text-[#8b98a6]">
            {!isAuditor
              ? "仅当前审核员可发起预审。"
              : !pathConfirmed
                ? "请先核对并确认本轮版本、范围、路径和材料。"
                : !round?.rule_version_id
                  ? "请先锁定适用规则版本。"
                  : "请进入规则级审核与复核。"}
          </p>
          <div className="mt-5 rounded-xl bg-[#f1faf5] p-4">
            <h3 className="flex items-center gap-2 font-bold text-[#147e54]">
              <Leaf size={18} />
              审核提示
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#708679]">
              请确认所有原始资料为项目团队正式提交的最新版本。图纸应包含清晰比例、图例和必要标注，以便后续专业审核。
            </p>
          </div>
        </aside>
      </div>
    </ProjectShell>
  );
}

function CheckRow({
  okay,
  title,
  detail,
}: {
  okay: boolean;
  title: string;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-4">
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full ${okay ? "bg-[#198e63] text-white" : "bg-[#fff0e9] text-[#e15c45]"}`}
      >
        {okay ? <Check size={17} /> : <CircleAlert size={18} />}
      </span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs text-[#82909f]">{detail}</p>
      </div>
    </div>
  );
}
