"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { decisionNeedsReconfirmation } from "@/lib/gv/decision-freshness";
import { type GvRuleCode, gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import type {
  GvComputedResult,
  NumericCandidate,
  NumericConfirmation,
} from "@/lib/gv/rule-engine";
import { hasMaterialConflict } from "@/lib/gv/semantic-findings";
import {
  aiSupportLabel,
  type ReviewAssessment,
  ReviewEvidenceTriad,
  type ReviewFile,
  type ReviewFragment,
} from "./review-evidence-triad";
import { ReviewFacts } from "./review-facts";

type Decision = {
  id: string;
  rule_code: string;
  fact_check: string;
  decision: string;
  rationale: string;
  created_at: string;
  created_by: string;
};

const decisionLabels: Record<string, string> = {
  pass: "支持符合",
  fail: "不符合要求",
  supplement: "需要补件",
  conflict: "证据冲突，需澄清",
  defer: "暂缓判断，继续复核",
  not_applicable: "本项不适用",
};
function displayDecision(saved: Decision | undefined) {
  if (!saved) return "";
  return saved.decision === "defer" && saved.fact_check === "conflict"
    ? "conflict"
    : saved.decision;
}

export function ReviewWorkspace({
  taskId,
  projectName,
  allowStoredRefresh,
  scopeConfirmed,
  incentivePath,
  facilityPath,
  canEdit,
  canRerunSubmitted,
  files,
  fragments,
  decisions,
  assessments,
  run,
  candidates,
  confirmations,
}: {
  taskId: string;
  roundId: string;
  projectName: string;
  allowStoredRefresh: boolean;
  scopeConfirmed: boolean;
  incentivePath: string | null;
  facilityPath: string | null;
  canEdit: boolean;
  canRerunSubmitted: boolean;
  files: ReviewFile[];
  fragments: ReviewFragment[];
  decisions: Decision[];
  assessments: ReviewAssessment[];
  run: {
    id: string;
    status: string;
    model: string;
    errorMessage: string | null;
    createdAt: string;
    results: GvComputedResult[];
  } | null;
  candidates: NumericCandidate[];
  confirmations: NumericConfirmation[];
}) {
  const router = useRouter();
  const applicable = gvRules.filter((rule) =>
    ruleApplies(rule.code, incentivePath, facilityPath),
  );
  const [selected, setSelected] = useState<GvRuleCode>(
    applicable[0]?.code ?? "R01",
  );
  const [decision, setDecision] = useState(() =>
    displayDecision(
      decisions.find((item) => item.rule_code === applicable[0]?.code),
    ),
  );
  const [rationale, setRationale] = useState(
    () =>
      decisions.find((item) => item.rule_code === applicable[0]?.code)
        ?.rationale ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assessingSeconds, setAssessingSeconds] = useState(0);
  const [runFeedback, setRunFeedback] = useState<{
    ok: boolean;
    message: string;
    action: "run" | "clear" | "refresh";
  } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!assessing) return;
    const timer = window.setInterval(
      () => setAssessingSeconds((seconds) => seconds + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [assessing]);
  const latest = useMemo(
    () =>
      new Map<string, Decision>(
        decisions
          .map((item): [string, Decision] => [item.rule_code, item])
          .reverse(),
      ),
    [decisions],
  );
  const staleDecisions = useMemo(
    () =>
      new Set(
        applicable
          .filter((rule) => {
            const saved = latest.get(rule.code);
            return (
              saved &&
              decisionNeedsReconfirmation(
                rule.code,
                saved.created_at,
                confirmations,
              )
            );
          })
          .map((rule) => rule.code),
      ),
    [applicable, latest, confirmations],
  );
  const aiLatest = useMemo(
    () =>
      new Map<string, ReviewAssessment>(
        assessments
          .map((item): [string, ReviewAssessment] => [item.rule_code, item])
          .reverse(),
      ),
    [assessments],
  );
  const chosen = gvRules.find((rule) => rule.code === selected) ?? gvRules[0];
  const chosenAi = aiLatest.get(selected);
  const chosenResult = run?.results.find((item) => item.ruleId === selected);
  const chosenIssues = (chosenResult?.issues ?? []).filter(
    (issue) =>
      !["R02", "R04", "R06"].includes(chosen.code) ||
      !/停车分母|总停车位/.test(issue),
  );
  const stale = Boolean(
    run && confirmations.some((item) => item.created_at > run.createdAt),
  );
  const complete = applicable.filter(
    (rule) => latest.has(rule.code) && !staleDecisions.has(rule.code),
  ).length;
  const buckets = [
    "fail",
    "conflict",
    "missing",
    "unclear",
    "confirmed",
    "unassessed",
  ] as const;
  const bucketMeta = {
    fail: {
      label: "数量不满足",
      badge: "bg-[#ffe9e4] text-[#a64032]",
      card: "border-[#efbaae] bg-[#fff7f4]",
    },
    conflict: {
      label: "证据冲突",
      badge: "bg-[#fff0ec] text-[#bc513e]",
      card: "border-[#f2c9bd] bg-[#fffaf8]",
    },
    missing: {
      label: "证据不足",
      badge: "bg-[#fff0d8] text-[#9e6415]",
      card: "border-[#efdab5] bg-[#fffaf2]",
    },
    unclear: {
      label: "无法判断",
      badge: "bg-[#e8f0ff] text-[#356ea0]",
      card: "border-[#cbdcf0] bg-[#f8fbff]",
    },
    confirmed: {
      label: "AI 支持判断",
      badge: "bg-[#e1f4e9] text-[#11784e]",
      card: "border-[#bfe1cb] bg-[#f4fbf6]",
    },
    unassessed: {
      label: "未初审",
      badge: "bg-[#edf1ee] text-[#64766b]",
      card: "border-[#dae4dc] bg-[#f8faf8]",
    },
  } as const;
  const aiBucket = (code: GvRuleCode) => {
    const computed = run?.results.find((item) => item.ruleId === code);
    if (computed?.outcome === "FAIL") return "fail";
    if (hasMaterialConflict(computed)) return "conflict";
    if (computed?.outcome === "INSUFFICIENT_EVIDENCE") return "missing";
    const support = aiLatest.get(code)?.support;
    if (support === "conflicts") return "conflict";
    if (support === "insufficient") return "missing";
    if (support === "supports" || support === "partial") return "confirmed";
    if (
      computed?.outcome === "HUMAN_REVIEW_REQUIRED" ||
      computed?.outcome === "UNCLEAR"
    )
      return "unclear";
    if (!support) return "unassessed";
    return "unclear";
  };

  function selectRule(code: GvRuleCode) {
    setSelected(code);
    const saved = latest.get(code);
    setDecision(displayDecision(saved));
    setRationale(saved?.rationale ?? "");
    setMessage("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const advance =
        (
          (event.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null
        )?.value === "next";
      const response = await fetch(`/api/tasks/${taskId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleCode: selected, decision, rationale }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setMessage(result.message);
      if (result.ok) {
        router.refresh();
        if (advance) {
          const nextIndex =
            applicable.findIndex((rule) => rule.code === selected) + 1;
          if (nextIndex < applicable.length)
            selectRule(applicable[nextIndex].code);
          else router.push(`/tasks/${taskId}/opinion`);
        }
      }
    } catch {
      setMessage("保存失败，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function assess() {
    setAssessingSeconds(0);
    setAssessing(true);
    setRunFeedback(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/review/run`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setRunFeedback({ ok: result.ok, message: result.message, action: "run" });
      if (result.ok) router.refresh();
    } catch {
      setRunFeedback({
        ok: false,
        message: "审核未完成，请检查网络后重试，或依据原件人工核对。",
        action: "run",
      });
    } finally {
      setAssessing(false);
    }
  }

  async function refreshStoredAssessment() {
    setRefreshing(true);
    setRunFeedback(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/review/refresh`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setRunFeedback({
        ok: result.ok,
        message: result.message,
        action: "refresh",
      });
      if (result.ok) router.refresh();
    } catch {
      setRunFeedback({
        ok: false,
        message: "更新失败，请检查网络后重试。",
        action: "refresh",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function clearAssessment() {
    if (
      !run ||
      !window.confirm(
        "清除本轮 AI 初审的页面结果？原材料、历史运行记录和已保存的人工判断会保留。",
      )
    )
      return;
    setClearing(true);
    setRunFeedback(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/review/clear`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setRunFeedback({
        ok: result.ok,
        message: result.message,
        action: "clear",
      });
      if (result.ok) router.refresh();
    } catch {
      setRunFeedback({
        ok: false,
        message: "清除失败，请检查网络后重试。",
        action: "clear",
      });
    } finally {
      setClearing(false);
    }
  }

  if (!scopeConfirmed)
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <CircleAlert className="mx-auto text-[#c98b37]" size={35} />
        <h2 className="mt-3 text-xl font-bold">请先确认本轮审核范围</h2>
        <p className="mt-2 text-sm text-[#718579]">
          路径、版本、范围和材料未经审核员确认，不能开始规则审核。
        </p>
        <Link
          href={`/tasks/${taskId}`}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0b8555] px-5 py-3 font-semibold text-white"
        >
          返回本轮任务概览 <ArrowRight size={17} />
        </Link>
      </div>
    );

  return (
    <div className="grid items-stretch gap-4 xl:grid-cols-[305px_minmax(0,1fr)]">
      <aside className="flex min-w-0 min-h-0 flex-col overflow-hidden rounded-2xl border border-[#bcd9c7] bg-[#edf7ef] shadow-sm">
        <div className="border-b border-[#c9dfcf] bg-[#ddefe2] p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-[#075b3d]">AI 初审结论</h2>
            <span className="inline-flex min-h-7 items-center rounded-full bg-white px-2.5 text-xs font-semibold leading-none text-[#8f6b2e]">
              人工已确认 {complete}/{applicable.length}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#5f7a6a]">
            AI 结果为候选意见，专业结论以审核员核对和保存的判断为准。
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {buckets.map((bucket) => {
            const rules = applicable.filter(
              (rule) => aiBucket(rule.code) === bucket,
            );
            if (!rules.length) return null;
            const meta = bucketMeta[bucket];
            return (
              <section key={bucket}>
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-1 ${meta.badge}`}>
                    {meta.label}
                  </span>
                  <span className="text-[#648071]">{rules.length} 项</span>
                </div>
                <div className="space-y-2">
                  {rules.map((rule) => {
                    const saved = latest.get(rule.code);
                    const needsReconfirmation = staleDecisions.has(rule.code);
                    return (
                      <button
                        key={rule.code}
                        type="button"
                        onClick={() => selectRule(rule.code)}
                        className={`w-full rounded-xl border p-3 text-left ${selected === rule.code ? "ring-2 ring-[#4ba776] shadow-sm" : ""} ${meta.card}`}
                      >
                        <span className="flex justify-between gap-2 text-sm font-bold">
                          <span>
                            {rule.code} · {rule.title}
                          </span>
                          {saved && !needsReconfirmation && (
                            <CheckCircle2
                              size={16}
                              className="shrink-0 text-[#0b8555]"
                            />
                          )}
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-[#315f4b]">
                          AI 态度：
                          {bucket === "confirmed" &&
                          aiLatest.get(rule.code)?.support === "partial" ? (
                            <>
                              部分支持，
                              <strong className="font-bold text-[#975412]">
                                仍有待核问题
                              </strong>
                            </>
                          ) : (
                            aiSupportLabel(
                              aiLatest.get(rule.code)?.support,
                              rule.code,
                              run?.results.find(
                                (item) => item.ruleId === rule.code,
                              ),
                            )
                          )}
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-xs">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold ${meta.badge}`}
                          >
                            {bucket === "confirmed" &&
                            aiLatest.get(rule.code)?.support === "partial"
                              ? "AI 部分支持判断"
                              : meta.label}
                          </span>
                          <span
                            className={
                              needsReconfirmation
                                ? "font-semibold text-[#a15d25]"
                                : "text-[#738b7d]"
                            }
                          >
                            {needsReconfirmation
                              ? "事实已修改 · 待重新确认"
                              : saved
                                ? decisionLabels[displayDecision(saved)]
                                : "待人工判断"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {gvRules.filter(
            (rule) => !ruleApplies(rule.code, incentivePath, facilityPath),
          ).length > 0 && (
            <section>
              <p className="px-1 text-xs font-semibold text-[#82948a]">
                本轮不适用
              </p>
              <p className="mt-1 px-1 text-xs text-[#82948a]">
                {gvRules
                  .filter(
                    (rule) =>
                      !ruleApplies(rule.code, incentivePath, facilityPath),
                  )
                  .map((rule) => rule.code)
                  .join("、")}{" "}
                · 未选择的路径不计入审核结论
              </p>
            </section>
          )}
        </div>
      </aside>
      <div className="min-w-0 space-y-3">
        <section
          aria-busy={assessing}
          className="overflow-hidden rounded-2xl border border-[#c4ddcb] bg-white shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <h2 className="text-xl font-bold">
              {chosen.code} · {chosen.title}
            </h2>
            <div className="flex items-center gap-2">
              {canEdit && run && (
                <button
                  type="button"
                  onClick={clearAssessment}
                  disabled={assessing || clearing || refreshing}
                  className="rounded-full border border-[#c9d9cf] px-4 py-2 text-sm font-semibold text-[#557362] disabled:cursor-wait disabled:opacity-50"
                >
                  {clearing ? "正在清除…" : "清除审核内容"}
                </button>
              )}
              {canEdit && (
                <div className="flex flex-col items-start gap-1">
                  <button
                    type="button"
                    onClick={assess}
                    disabled={assessing || clearing || refreshing}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold disabled:cursor-wait ${assessing ? "border-[#0b8055] bg-[#0b8055] text-white" : "border-[#2f9b6d] text-[#0c7950]"}`}
                  >
                    {assessing && (
                      <LoaderCircle
                        size={17}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {assessing
                      ? "正在审核…"
                      : run
                        ? "重新运行整轮初审"
                        : "运行整轮 GV 初审"}
                  </button>
                  {allowStoredRefresh && run && (
                    <button
                      type="button"
                      onClick={refreshStoredAssessment}
                      disabled={assessing || clearing || refreshing}
                      className="rounded-full border border-[#c9d9cf] px-4 py-2 text-sm font-semibold text-[#557362] disabled:opacity-50"
                      title="复用已保存的材料解析，重新执行字段提取、规则计算和千问审核；不重新读取 PDF 图像"
                    >
                      {refreshing ? "正在更新…" : "更新审核结论"}
                    </button>
                  )}
                </div>
              )}
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${assessing ? "bg-[#e4f5eb] text-[#0b8055]" : "bg-[#fff3e4] text-[#a77827]"}`}
              >
                {assessing
                  ? "正在审核"
                  : staleDecisions.has(chosen.code)
                    ? "待重新确认"
                    : latest.has(chosen.code)
                      ? "人工判断已保存"
                      : "待处理"}
              </span>
            </div>
          </div>
          {assessing && (
            <output
              aria-live="polite"
              className="flex items-center gap-3 border-t border-[#cce7d6] bg-[#ecf8f0] px-4 py-3 text-sm text-[#0d6846]"
            >
              <LoaderCircle
                size={20}
                className="shrink-0 animate-spin"
                aria-hidden="true"
              />
              <span>
                <strong>正在审核当前轮次</strong>
                <span className="ml-2">
                  已等待 {assessingSeconds}{" "}
                  秒。材料提取、规则计算与语义核查完成后会显示结果。
                </span>
              </span>
            </output>
          )}
          {!assessing && runFeedback && (
            <div
              role={runFeedback.ok ? "status" : "alert"}
              className={`border-t px-4 py-3 text-sm ${runFeedback.ok ? "bg-[#eef8f1] text-[#176f4a]" : "bg-[#fff3ea] text-[#9c563a]"}`}
            >
              {runFeedback.action === "clear"
                ? runFeedback.ok
                  ? "清除完成："
                  : "清除失败："
                : runFeedback.action === "refresh"
                  ? runFeedback.ok
                    ? "更新完成："
                    : "更新失败："
                  : runFeedback.ok
                    ? "审核请求已完成："
                    : "审核未完成："}
              {runFeedback.message}
            </div>
          )}
          {run && (
            <div
              className={`border-t px-4 py-2 text-xs ${stale ? "bg-[#fff4e7] text-[#9e6415]" : run.status === "partial" ? "bg-[#fff8eb] text-[#9e6415]" : "bg-[#eef8f1] text-[#227756]"}`}
            >
              {stale
                ? "人工事实已有更新，当前计算已过期，请重新运行整轮初审。"
                : run.model === "none"
                  ? `存储字段更新已保存 · ${new Date(run.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                  : run.status === "partial"
                    ? `部分步骤未完成：${run.errorMessage ?? "请人工核对"}`
                    : `整轮初审已保存 · ${new Date(run.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`}
            </div>
          )}
          {run && files.some((file) => file.parseStatus !== "extracted") && (
            <details className="border-t border-[#e7ebe6] bg-[#fffaf0] px-4 py-2 text-xs text-[#7c5b28]">
              <summary className="cursor-pointer font-semibold">
                {
                  files.filter((file) => file.parseStatus !== "extracted")
                    .length
                }{" "}
                份材料文字层读取受限，点此查看原因
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {files
                  .filter((file) => file.parseStatus !== "extracted")
                  .map((file) => (
                    <li key={file.id}>
                      {file.fileName}：
                      {file.parseReason ?? "无法完整提取，请核对原件。"}
                    </li>
                  ))}
              </ul>
              <p className="mt-2">
                {run.results.some((item) => item.visualEvidenceUsed)
                  ? "相关图纸已按需交由千问读取 PDF 视觉内容；视觉识别仍是候选，请点击引用核对原页。"
                  : "文字层读取受限不等于项目没有证据；请在材料来源中查看原件后判断。"}
              </p>
            </details>
          )}
          {chosenResult && (
            <div className="border-t border-[#e0ece4] bg-[#f7fbf8] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>规则计算：</strong>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${chosenResult.outcome === "FAIL" || chosenResult.outcome === "EVIDENCE_CONFLICT" ? "bg-[#fff0e9] text-[#b4573e]" : "bg-[#e8f0ff] text-[#356ea0]"}`}
                >
                  {
                    {
                      FAIL: "数量不满足",
                      EVIDENCE_CONFLICT: "证据冲突",
                      INSUFFICIENT_EVIDENCE: "证据不足",
                      HUMAN_REVIEW_REQUIRED: "需人工复核",
                      PASS: "候选支持",
                      NOT_APPLICABLE: "不适用",
                      NOT_COVERED: "未覆盖",
                      UNCLEAR: "尚不明确",
                    }[chosenResult.outcome]
                  }
                </span>
                {chosenResult.formula && (
                  <span className="font-semibold text-[#145f43]">
                    {chosenResult.formula}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[#546e5e]">{chosenResult.explanation}</p>
              {!chosenAi && chosenIssues.length > 0 && (
                <p className="mt-1 text-xs text-[#916536]">
                  待核：{chosenIssues.join("；")}
                </p>
              )}
            </div>
          )}
          <ReviewEvidenceTriad
            key={chosen.code}
            taskId={taskId}
            rule={chosen}
            files={files}
            fragments={fragments}
            assessment={chosenAi}
            result={chosenResult}
            retrievedSources={chosenResult?.retrievedSources}
          />
        </section>
        <details className="rounded-2xl border border-[#dce9df] bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#0b8054]">
            核对系统提取的数值与原件，或修正候选事实
          </summary>
          <div className="mt-3">
            <ReviewFacts
              taskId={taskId}
              files={files}
              candidates={candidates}
              confirmations={confirmations}
              canEdit={canEdit}
            />
          </div>
        </details>
        <section className="rounded-2xl border border-[#c4ddcb] bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold">审核员判断 · {chosen.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#718779]">
            重点核对：{chosenResult?.issues[0] ?? chosen.evidence}
          </p>
          <p className="mt-1 text-xs text-[#83938a]">
            当前项目：{projectName}。每次保存均保留独立记录。
          </p>
          <form onSubmit={save} className="mt-4 space-y-4">
            <fieldset>
              <legend className="text-sm font-bold">本轮审核决定</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries(decisionLabels).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 rounded-lg border border-[#e0eae3] px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="decision"
                      value={value}
                      checked={decision === value}
                      onChange={() => setDecision(value)}
                      disabled={!canEdit}
                      required
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-bold">
              判断依据、证据位置与下一步要求{" "}
              <span
                className={
                  decision === "pass" ? "text-[#718579]" : "text-[#b45d45]"
                }
              >
                {decision === "pass" ? "选填" : "必填"}
              </span>
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                disabled={!canEdit}
                required={decision !== "pass"}
                rows={3}
                placeholder={
                  decision === "pass"
                    ? "可补充采信的材料、页码与规则条件。"
                    : "写明采信的材料和页码、规则条件、差异，以及补件或复核要求。"
                }
                className="mt-2 w-full rounded-xl border border-[#dce8df] p-3 text-sm outline-[#25895b]"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/tasks/${taskId}/materials`}
                className="text-sm font-semibold text-[#0b8054]"
              >
                查看或上传本轮材料 <ArrowRight size={15} className="inline" />
              </Link>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  value="save"
                  disabled={!canEdit || busy}
                  className="rounded-lg bg-[#0a8054] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-45"
                >
                  {busy ? "保存中…" : "保存审核意见"}
                </button>
                <button
                  type="submit"
                  value="next"
                  disabled={!canEdit || busy}
                  className="rounded-lg border border-[#9ccaa8] px-5 py-2.5 text-sm font-bold text-[#087e52] disabled:opacity-45"
                >
                  {applicable.findIndex((rule) => rule.code === selected) <
                  applicable.length - 1
                    ? "保存并审核下一要点"
                    : "保存并进入意见"}{" "}
                  <ArrowRight size={15} className="inline" />
                </button>
                {canRerunSubmitted && run && (
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={assess}
                      disabled={assessing}
                      className="inline-flex items-center gap-2 rounded-lg border border-[#d6e4da] px-3 py-2 text-xs font-semibold text-[#577766] disabled:opacity-50"
                    >
                      {assessing && (
                        <LoaderCircle size={14} className="animate-spin" />
                      )}
                      {assessing ? "正在重新审核…" : "重新运行 AI 初审"}
                    </button>
                    {allowStoredRefresh && (
                      <button
                        type="button"
                        onClick={refreshStoredAssessment}
                        disabled={assessing || refreshing}
                        className="rounded-lg border border-[#d6e4da] px-3 py-2 text-xs font-semibold text-[#577766] disabled:opacity-50"
                        title="复用已保存的材料解析，重新执行字段提取、规则计算和千问审核；不重新读取 PDF 图像"
                      >
                        {refreshing ? "正在更新…" : "更新审核结论"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {canRerunSubmitted && (
              <p className="text-xs text-[#82958a]">
                重新审核只更新 AI 候选结果，已提交的专业意见不会自动改变。
              </p>
            )}
            <div>
              {message ? (
                <output className="text-sm text-[#976a35]">{message}</output>
              ) : (
                <span className="text-xs text-[#83948a]">
                  {staleDecisions.has(selected)
                    ? "事实已修改，请重新核对并保存本条判断"
                    : latest.get(selected)
                      ? "判断已保存"
                      : "尚未保存判断"}
                </span>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
