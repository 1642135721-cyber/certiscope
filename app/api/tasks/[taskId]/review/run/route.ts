import { NextResponse } from "next/server";
import type { LocatedContent, RuleEvidenceAssessment } from "@/lib/ai/provider";
import { aiProvider } from "@/lib/ai/qwen";
import { imageVisionContent } from "@/lib/documents/parse-image";
import { cropVisualPdf } from "@/lib/documents/visual-pdf-pages";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { retrieveGvBasis } from "@/lib/gv/basis-retrieval";
import {
  conditionCandidateCoverage,
  gvConditionFields,
} from "@/lib/gv/condition-catalog";
import {
  citationWasRetrieved,
  type FieldEvidenceAnchor,
  retrievedSource,
  retrieveGvEvidence,
  retrieveGvRuleEvidence,
} from "@/lib/gv/evidence-retrieval";
import {
  basementParkingTotals,
  extractLocatedNumericCandidates,
  preferredParkingAreaConflicts,
  preferredParkingConservativeTotal,
} from "@/lib/gv/fact-patterns";
import {
  evidenceCandidateSummary,
  gvEvidenceFieldKeys,
  gvEvidenceFields,
  validGvEvidenceCandidate,
} from "@/lib/gv/field-catalog";
import {
  retrieveGvGuidanceChunks,
  validateGvGuidance,
} from "@/lib/gv/knowledge/gv-guidance";
import { isScopedNumericCandidate } from "@/lib/gv/numeric-candidate-scope";
import {
  type ParkingDrawingNumberRun,
  readParkingDrawingNumbers,
} from "@/lib/gv/parking-drawing-numbers";
import {
  hasCitedR05Signage,
  mergeVerifiedR05Signage,
  verifiedR05SignageFinding,
} from "@/lib/gv/r05-signage";
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import {
  evaluateGvRules,
  type GvComputedResult,
  type NumericCandidate,
  type NumericConfirmation,
  numericFields,
  parseCandidateNumber,
  readNumericFacts,
} from "@/lib/gv/rule-engine";
import {
  calibrateCandidateSupport,
  refineSemanticFindings,
} from "@/lib/gv/semantic-findings";
import {
  dedupeRuleSupport,
  mergeAdditionalSupport,
} from "@/lib/gv/support-reconciliation";
import type { SourceLocation } from "@/lib/gv/types";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { supabase, actor, task } = await requireTaskAccess(taskId, true);
    const reuseParsedMaterials =
      (
        (await request.json().catch(() => null)) as {
          reuseParsedMaterials?: boolean;
        } | null
      )?.reuseParsedMaterials === true;
    if (
      reuseParsedMaterials &&
      task.project_id !== "00000000-0000-0000-0000-000000000000"
    ) {
      const result = failure("FORBIDDEN", "该测试入口仅用于指定的 GV 项目。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    if (actor.role !== "auditor" || task.current_auditor_id !== actor.id) {
      const result = failure("FORBIDDEN", "仅当前审核员可发起 GV 初审。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: round, error: roundError } = await supabase
      .from("task_rounds")
      .select(
        "id, status, scope_confirmed_at, rule_version_id, selected_material_version_ids",
      )
      .eq("id", task.current_round_id ?? "")
      .maybeSingle();
    if (roundError) throw roundError;
    if (
      !round?.scope_confirmed_at ||
      !["open", "returned", "submitted"].includes(round.status)
    ) {
      const result = failure(
        "CONFLICT",
        "请先确认当前轮次的路径、版本、范围与材料。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: rulePackage } = await supabase
      .from("gv_rule_packages")
      .select("id, code, package_version, source_reference")
      .eq("id", round.rule_version_id ?? "")
      .eq("status", "active")
      .maybeSingle();
    if (
      !rulePackage ||
      task.rule_version_id !== rulePackage.id ||
      task.system !== "LEED" ||
      task.system_version !== "v4 BD+C NC" ||
      task.stage !== "设计审核" ||
      !["A", "B"].includes(task.incentive_path ?? "") ||
      !["C", "D"].includes(task.facility_path ?? "")
    ) {
      const result = failure(
        "CONFLICT",
        "当前任务与 GV 规则包的体系、版本、阶段或路径不匹配，请联系审核管理员。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const ids: string[] = round.selected_material_version_ids ?? [];
    if (!ids.length) {
      const result = failure("VALIDATION", "本轮没有已确认的材料版本。");
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: cachedRun, error: cachedRunError } = reuseParsedMaterials
      ? await supabase
          .from("gv_processing_runs")
          .select(
            "results, scope_confirmed_at, selected_material_version_ids, rule_version_id",
          )
          .eq("task_id", taskId)
          .eq("round_id", round.id)
          .is("cleared_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    if (cachedRunError) throw cachedRunError;
    if (
      reuseParsedMaterials &&
      (!cachedRun ||
        !Array.isArray(cachedRun.results) ||
        cachedRun.scope_confirmed_at !== round.scope_confirmed_at ||
        cachedRun.rule_version_id !== round.rule_version_id ||
        JSON.stringify([...ids].sort()) !==
          JSON.stringify(
            [...(cachedRun.selected_material_version_ids ?? [])].sort(),
          ))
    ) {
      const result = failure(
        "CONFLICT",
        "没有可复用的同范围材料解析结果，请使用完整重新审核。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    // Opt in only after comparing real GV results with the legacy selection.
    const fieldAnchoredEvidence =
      process.env.GV_FIELD_ANCHORED_EVIDENCE === "true";
    const fragmentQuery = supabase
      .from("parsed_fragments")
      .select("material_version_id, text_content, source_location, status")
      .in("material_version_id", ids);
    const [
      { data: versions, error: fileError },
      { data: fragments, error: fragmentError },
      { data: existing, error: candidateError },
      { data: confirmed, error: confirmationError },
    ] = await Promise.all([
      supabase
        .from("material_versions")
        .select(
          "id, file_name, extension, storage_path, byte_size, parse_status, parse_reason",
        )
        .in("id", ids)
        .is("removed_at", null)
        .eq("round_id", round.id),
      fieldAnchoredEvidence
        ? fragmentQuery
            .order("material_version_id")
            .order("sequence")
            .limit(1000)
        : fragmentQuery.order("sequence").limit(180),
      supabase
        .from("fact_candidates")
        .select(
          "id, field_key, candidate_value, unit, source_location, material_version_id",
        )
        .eq("round_id", round.id)
        .eq("state", "candidate")
        .in("material_version_id", ids)
        .in("field_key", [...numericFields, ...gvEvidenceFieldKeys]),
      supabase
        .from("gv_fact_confirmations")
        .select("field_key, value, unit, source_location, created_at")
        .eq("round_id", round.id)
        .eq("scope_confirmed_at", round.scope_confirmed_at)
        .order("created_at", { ascending: false }),
    ]);
    if (fileError || fragmentError || candidateError || confirmationError)
      throw fileError ?? fragmentError ?? candidateError ?? confirmationError;
    if ((versions ?? []).length !== ids.length) {
      const result = failure(
        "CONFLICT",
        "本轮材料版本发生变化，请重新确认范围。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const applicableRules = gvRules.filter((rule) =>
      ruleApplies(rule.code, task.incentive_path, task.facility_path),
    );
    const evidenceParts: LocatedContent[] = retrieveGvEvidence(
      (fragments ?? []) as {
        material_version_id: string;
        text_content: string;
        source_location: SourceLocation | null;
        status: string;
      }[],
      applicableRules.map((rule) => rule.code),
      ids,
      fieldAnchoredEvidence ? 18000 : 12000,
      fieldAnchoredEvidence,
    );
    const imageParts: LocatedContent[] = [];
    for (const file of (reuseParsedMaterials ? [] : (versions ?? []))
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
        imageParts.push(
          imageVisionContent(
            new Uint8Array(await data.arrayBuffer()),
            file.extension as "jpg" | "jpeg" | "png",
            file.id,
          ),
        );
    }
    evidenceParts.push(...imageParts);
    const errors: string[] = [];
    const drawingNumberRuns: ParkingDrawingNumberRun[] = [];
    if (!reuseParsedMaterials) {
      for (const file of (versions ?? [])
        .filter(
          (item) =>
            item.extension === "pdf" &&
            item.byte_size <= 20 * 1024 * 1024 &&
            /site|总平|场地/i.test(item.file_name),
        )
        .slice(0, 3)) {
        const { data, error } = await supabase.storage
          .from("gv-materials")
          .download(file.storage_path);
        if (error || !data) {
          errors.push(`图纸编号核对：${file.file_name} 读取失败，请查看原件`);
          continue;
        }
        try {
          drawingNumberRuns.push(
            ...(await readParkingDrawingNumbers(
              new Uint8Array(await data.arrayBuffer()),
              file.id,
            )),
          );
        } catch {
          errors.push(
            `图纸编号核对：${file.file_name} 无法自动读取编号，请查看原件`,
          );
        }
      }
    }
    const pdfParts: LocatedContent[] = [];
    const visualPageCounts = new Map<string, number>();
    const visualPdfs = (reuseParsedMaterials ? [] : (versions ?? []))
      .filter((file) => {
        if (
          file.extension !== "pdf" ||
          file.byte_size > 50 * 1024 * 1024 ||
          !/sign|garage|parking|site|标识|停车|车位|图纸/i.test(file.file_name)
        )
          return false;
        const pages = (fragments ?? []).filter(
          (part) => part.material_version_id === file.id,
        );
        return (
          pages.length > 0 &&
          pages.length <= 24 &&
          pages.filter((part) => !part.text_content.trim()).length >
            pages.length / 2
        );
      })
      .slice(0, 3);
    for (const file of visualPdfs) {
      const { data, error } = await supabase.storage
        .from("gv-materials")
        .createSignedUrl(file.storage_path, 600);
      if (error || !data?.signedUrl) {
        errors.push(`材料视觉核查：${file.file_name} 读取失败，请查看原件`);
        continue;
      }
      const pageCount = (fragments ?? []).filter(
        (part) => part.material_version_id === file.id,
      ).length;
      visualPageCounts.set(file.id, pageCount);
      pdfParts.push({
        pdfUrl: data.signedUrl,
        pdfFileName: file.file_name,
        pdfPageCount: pageCount,
        pdfOriginalPages: Array.from(
          { length: pageCount },
          (_, index) => index + 1,
        ),
        source: {
          materialVersionId: file.id,
          note: "千问 PDF 视觉识别候选；查看完整原件并引用实际页码",
        },
      });
    }
    if (!evidenceParts.length)
      errors.push(
        "材料提取：本轮选中材料没有可读取的文本或图像，请定位原件并人工接续",
      );
    for (const file of versions ?? []) {
      if (file.parse_status === "failed")
        errors.push(`材料提取：${file.file_name} 解析失败，须核对原件`);
    }
    let model = "";
    const usage = { inputTokens: 0, outputTokens: 0, billablePages: 0 };
    const sourceKey = (source: SourceLocation | null) =>
      source
        ? [
            source.materialVersionId,
            source.page ?? "",
            source.image ?? "",
            source.sheet ?? "",
            source.cell ?? "",
            source.paragraph ?? "",
          ].join(":")
        : "";
    let candidates = (existing ?? []) as NumericCandidate[];
    const knownCandidates = new Set(
      candidates.map(
        (item) =>
          `${item.field_key}:${sourceKey(item.source_location)}:${String(item.candidate_value)}`,
      ),
    );
    const direct = extractLocatedNumericCandidates(
      (fragments ?? []) as {
        material_version_id: string;
        text_content: string;
        source_location: SourceLocation | null;
        status: string;
      }[],
      ids,
    );
    const patterned = direct.filter((item) => {
      const key = `${item.key}:${sourceKey(item.source)}:${item.value}`;
      if (knownCandidates.has(key)) return false;
      knownCandidates.add(key);
      return true;
    });
    if (patterned.length) {
      const rows = patterned.map((item) => ({
        task_id: taskId,
        round_id: round.id,
        material_version_id: item.source.materialVersionId,
        field_key: item.key,
        candidate_value: item.value,
        unit: "车位",
        scope: item.scope,
        source_location: item.source,
        confidence: null,
        extraction_method: "pattern:direct_statement",
        state: "candidate",
      }));
      if (round.status === "submitted" || reuseParsedMaterials) {
        candidates = [
          ...candidates,
          ...rows.map((item) => ({ ...item, id: crypto.randomUUID() })),
        ];
      } else {
        const { data: added, error } = await supabase
          .from("fact_candidates")
          .insert(rows)
          .select(
            "id, field_key, candidate_value, unit, source_location, material_version_id",
          );
        if (error) throw error;
        candidates = [...candidates, ...((added ?? []) as NumericCandidate[])];
      }
    }
    const extracted = evidenceParts.length
      ? await aiProvider.extractCandidates({
          taskId,
          roundId: round.id,
          materialVersions: ids,
          contentParts: evidenceParts,
          requestedFields: [
            ...numericFields,
            ...gvEvidenceFields
              .filter((field) =>
                applicableRules.some((rule) =>
                  field.rules.split(",").includes(rule.code),
                ),
              )
              .map((field) => field.key),
          ],
        })
      : null;
    if (extracted?.ok) {
      model = extracted.model;
      usage.inputTokens += extracted.usage.inputTokens;
      usage.outputTokens += extracted.usage.outputTokens;
      const valid = extracted.value
        .filter((item) => {
          const isNumeric = numericFields.some((field) => field === item.key);
          const parsed = isNumeric ? parseCandidateNumber(item.value) : null;
          const samePage = direct.filter(
            (statement) =>
              statement.key === item.key &&
              sourceKey(statement.source) === sourceKey(item.source),
          );
          return (
            (isNumeric || validGvEvidenceCandidate(item)) &&
            isScopedNumericCandidate(item, direct, fieldAnchoredEvidence) &&
            ids.includes(item.source?.materialVersionId) &&
            citationWasRetrieved(item.source, evidenceParts) &&
            (!isNumeric ||
              (parsed !== null &&
                (!samePage.length ||
                  samePage.some((statement) => statement.value === parsed)) &&
                (["normal_rate", "green_rate"].includes(item.key) ||
                  Number.isInteger(parsed))))
          );
        })
        .slice(0, 60);
      const existingKeys = new Set(
        candidates.map(
          (item) =>
            `${item.field_key}:${sourceKey(item.source_location)}:${String(item.candidate_value)}`,
        ),
      );
      const fresh = valid.filter((item) => {
        const key = `${item.key}:${sourceKey(item.source)}:${String(item.value)}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      if (fresh.length) {
        const rows = fresh.map((item) => ({
          task_id: taskId,
          round_id: round.id,
          material_version_id: item.source.materialVersionId,
          field_key: item.key,
          candidate_value: item.value,
          unit: item.unit ?? null,
          scope: item.scope ?? null,
          source_location: retrievedSource(item.source, evidenceParts),
          confidence: item.confidence ?? null,
          extraction_method: `qwen:${extracted.model}`,
          state: "candidate",
        }));
        if (round.status === "submitted" || reuseParsedMaterials) {
          candidates = [
            ...candidates,
            ...rows.map((item) => ({ ...item, id: crypto.randomUUID() })),
          ];
        } else {
          const { data: added, error } = await supabase
            .from("fact_candidates")
            .insert(rows)
            .select(
              "id, field_key, candidate_value, unit, source_location, material_version_id",
            );
          if (error) throw error;
          candidates = [
            ...candidates,
            ...((added ?? []) as NumericCandidate[]),
          ];
        }
      }
    } else if (extracted) errors.push(`事实抽取：${extracted.message}`);

    const facts = readNumericFacts(
      candidates.filter((item) =>
        numericFields.some((field) => field === item.field_key),
      ),
      (confirmed ?? []) as NumericConfirmation[],
    );
    const basementTotals = basementParkingTotals(fragments ?? [], ids);
    const areaConflicts = preferredParkingAreaConflicts(
      (fragments ?? []) as {
        material_version_id: string;
        text_content: string;
        source_location: SourceLocation | null;
        status: string;
      }[],
      ids,
    );
    const calculated = evaluateGvRules(
      task.incentive_path,
      task.facility_path,
      facts,
    ).map((result) => {
      if (result.ruleId !== "R03" || !areaConflicts.length) return result;
      const reported = result.inputs.preferred_spaces;
      const minimum = result.inputs.minimum_preferred_spaces;
      const conservative =
        typeof reported === "number"
          ? preferredParkingConservativeTotal(fragments ?? [], ids, reported)
          : null;
      const safelyMeetsMinimum =
        conservative !== null &&
        typeof minimum === "number" &&
        conservative >= minimum;
      return {
        ...result,
        outcome:
          result.outcome === "FAIL"
            ? result.outcome
            : ("EVIDENCE_CONFLICT" as const),
        quantityThresholdMetDespiteConflict: safelyMeetsMinimum,
        issues: [
          ...result.issues,
          ...areaConflicts,
          ...(safelyMeetsMinimum
            ? [
                `按冲突数字保守计算仍至少有 ${conservative} 个优先车位，达到 ${minimum} 个数量下限；分区最终数仍须核对。`,
              ]
            : []),
        ],
      };
    });
    if (reuseParsedMaterials && cachedRun) {
      const priorResults = cachedRun.results as GvComputedResult[];
      const changed = calculated.filter((item) => {
        const prior = priorResults.find((old) => old.ruleId === item.ruleId);
        return (
          !prior || JSON.stringify(prior.inputs) !== JSON.stringify(item.inputs)
        );
      });
      if (changed.length) {
        const result = failure(
          "CONFLICT",
          `${changed.map((item) => item.ruleId).join("、")} 的数值字段与现有初审不同，未覆盖当前结论。请核对字段或使用完整重新审核。`,
        );
        return NextResponse.json(result, { status: actionStatus(result) });
      }
    }
    if (fieldAnchoredEvidence) {
      candidates.sort((a, b) => {
        const left = `${a.field_key}:${sourceKey(a.source_location)}:${String(a.candidate_value)}`;
        const right = `${b.field_key}:${sourceKey(b.source_location)}:${String(b.candidate_value)}`;
        return left < right ? -1 : left > right ? 1 : 0;
      });
    }
    const fieldAnchors = fieldAnchoredEvidence
      ? new Map(
          applicableRules.map((rule) => {
            const fieldKeys = new Set<string>(
              gvConditionFields
                .filter((condition) => condition.rule === rule.code)
                .flatMap((condition) => condition.fields),
            );
            const anchors: FieldEvidenceAnchor[] = candidates.flatMap(
              (candidate) =>
                fieldKeys.has(candidate.field_key) && candidate.source_location
                  ? [
                      {
                        fieldKey: candidate.field_key,
                        source: candidate.source_location,
                        value: candidate.candidate_value,
                      },
                    ]
                  : [],
            );
            return [rule.code, anchors] as const;
          }),
        )
      : undefined;
    const ruleEvidence = retrieveGvRuleEvidence(
      (fragments ?? []) as {
        material_version_id: string;
        text_content: string;
        source_location: SourceLocation | null;
        status: string;
      }[],
      applicableRules.map((rule) => rule.code),
      ids,
      3200,
      fieldAnchors,
    );
    const visualPartsFor = (
      code: (typeof applicableRules)[number]["code"],
      parts: LocatedContent[],
    ) =>
      ["R03", "R05"].includes(code)
        ? parts.filter((part) => {
            const name = part.pdfFileName ?? "";
            if (/sign|标识|标牌/i.test(name)) return code === "R05";
            if (/site|总平|场地/i.test(name)) return code === "R03";
            return true;
          })
        : [];
    const expandedVisualParts = new Map<string, LocatedContent[]>();
    const carriedEvidenceParts = new Map<string, LocatedContent[]>();
    const reusableFindings = new Map<
      string,
      NonNullable<GvComputedResult["supportedFindings"]>
    >();
    if (reuseParsedMaterials && cachedRun) {
      for (const prior of cachedRun.results as GvComputedResult[]) {
        const updated = calculated.find((item) => item.ruleId === prior.ruleId);
        if (
          !updated ||
          JSON.stringify(updated.inputs) !== JSON.stringify(prior.inputs)
        ) {
          errors.push(
            `${prior.ruleId} 数值字段已变化，旧视觉支持事实不沿用，请核对原件。`,
          );
          continue;
        }
        const findings = (prior.supportedFindings ?? []).filter(
          (finding) =>
            finding.citations.length > 0 &&
            finding.citations.every((source) =>
              ids.includes(source.materialVersionId),
            ),
        );
        if (!findings.length) continue;
        reusableFindings.set(prior.ruleId, findings);
        carriedEvidenceParts.set(
          prior.ruleId,
          findings.flatMap((finding) =>
            finding.citations.map((source) => ({
              text: `上一轮已保存的带原件定位的支持事实（需按原件核对）：${finding.text}`,
              source: {
                ...source,
                note: "复用上轮已引用事实；本次未重读图像，请核对原件",
              },
            })),
          ),
        );
      }
    }
    const evidenceFor = (code: (typeof applicableRules)[number]["code"]) => [
      ...(ruleEvidence.get(code) ?? []),
      ...(carriedEvidenceParts.get(code) ?? []),
      ...(code === "R01"
        ? drawingNumberRuns.map((run) => ({
            text: `场地停车图纸的独立数字位号由 1 编至 ${run.last}，文字坐标直接读到 ${run.readCount} 个；${run.missing.length ? `${run.missing.join("、")} 号未从文字层读出，须对照原图。` : "编号无缺口。"}这是地面车位数量线索，仍须核对统计边界和重复计数。`,
            source: run.source,
          }))
        : []),
      ...imageParts,
      ...(expandedVisualParts.get(code) ?? visualPartsFor(code, pdfParts)),
    ];
    const basisReceipts = new Map(
      applicableRules.map(
        (rule) =>
          [
            rule.code,
            retrieveGvBasis({
              taskId,
              roundId: round.id,
              code: rule.code,
              title: rule.title,
              summary: rule.summary,
              rulePackageVersion: rulePackage.package_version,
            }),
          ] as const,
      ),
    );
    for (const rule of applicableRules) {
      if (basisReceipts.get(rule.code)?.retrievalStatus !== "FOUND")
        errors.push(
          `${rule.code} 官方规则原文未能定位，已停止该条语义判断并交人工核对`,
        );
    }
    const semanticQuestions = calculated.flatMap((result) => {
      const rule = gvRules.find((item) => item.code === result.ruleId);
      if (!rule) return [];
      const receipt = basisReceipts.get(rule.code);
      if (receipt?.retrievalStatus !== "FOUND") return [];
      return [
        {
          ruleCode: rule.code,
          question: `${rule.title}。${rule.summary}。本轮已确认路径为 ${task.incentive_path}＋${task.facility_path}，不要再要求审核员确认所选路径。所需证据：${rule.evidence}。已有数量计算：${result.formula ?? "无"}。${result.quantityThresholdMetDespiteConflict ? "分区数量有差异，但按保守数字计算仍满足数量下限；请把数量条件与最终分区核对分开评价。" : ""}结构化字段候选：${
            evidenceCandidateSummary(
              candidates.flatMap((item) =>
                typeof item.candidate_value === "string" ||
                typeof item.candidate_value === "number" ||
                typeof item.candidate_value === "boolean"
                  ? [
                      {
                        field_key: item.field_key,
                        candidate_value: item.candidate_value,
                        source_location: item.source_location,
                      },
                    ]
                  : [],
              ),
              rule.code,
            ) || "无"
          }。待核：${result.issues.join("；")}`,
          ruleSource: `${rulePackage.package_version} · ${rulePackage.source_reference}。${receipt.selectedBasisRefs.map((ref) => `gv-source.pdf 第 ${ref.page} 页：${ref.quote}`).join("\n")}`,
          evidenceParts: evidenceFor(rule.code),
        },
      ];
    });
    const semanticResults = new Map<string, RuleEvidenceAssessment>();
    if (evidenceParts.length || pdfParts.length) {
      const batches = Array.from(
        { length: Math.ceil(semanticQuestions.length / 2) },
        (_, index) => semanticQuestions.slice(index * 2, index * 2 + 2),
      );
      const semanticBatchResults = await Promise.all(
        batches.map((questions) =>
          aiProvider.checkRules({
            taskId,
            roundId: round.id,
            ruleVersion: rulePackage.package_version,
            questions,
          }),
        ),
      );
      for (const [index, semantic] of semanticBatchResults.entries()) {
        const questions = batches[index];
        if (semantic.ok) {
          model = semantic.model;
          usage.inputTokens += semantic.usage.inputTokens;
          usage.outputTokens += semantic.usage.outputTokens;
          usage.billablePages += semantic.usage.billablePages ?? 0;
          for (const item of semantic.value) {
            if (
              questions.some((question) => question.ruleCode === item.ruleCode)
            )
              semanticResults.set(item.ruleCode, item);
          }
        } else {
          errors.push(
            `${questions.map((question) => question.ruleCode).join("、")} 证据语义核查：${semantic.message}`,
          );
        }
      }
      const fallbackQuestions = semanticQuestions.filter((question) => {
        const initialPdfs = visualPartsFor(question.ruleCode, pdfParts);
        const assessment = semanticResults.get(question.ruleCode);
        if (!initialPdfs.length || !assessment) return false;
        if (
          initialPdfs.every(
            (part) =>
              (part.pdfOriginalPages?.length ?? 0) >=
              (visualPageCounts.get(part.source.materialVersionId) ?? 0),
          )
        )
          return false;
        const hasVisualCitation = [
          ...assessment.citations,
          ...assessment.supportedFindings.flatMap(
            (finding) => finding.citations,
          ),
        ].some((source) => retrievedSource(source, initialPdfs) !== null);
        if (hasVisualCitation) return false;
        const unresolved = [
          ...assessment.gaps,
          ...assessment.humanQuestions,
          ...assessment.unverifiedFindings.map((item) => item.text),
        ].join(" ");
        return (
          assessment.support === "unknown" ||
          assessment.support === "insufficient" ||
          /图纸|标识|位号|车位|位置|plan|signage|layout/i.test(unresolved)
        );
      });
      if (fallbackQuestions.length) {
        const signedFullPdfs = new Map<string, LocatedContent>();
        const expandedQuestions = [];
        for (const question of fallbackQuestions) {
          const fullPdfs: LocatedContent[] = [];
          const initial = semanticResults.get(question.ruleCode);
          const unresolved = [
            ...(initial?.gaps ?? []),
            ...(initial?.humanQuestions ?? []),
            ...(initial?.unverifiedFindings.map((item) => item.text) ?? []),
          ].join(" ");
          const candidatePdfs = visualPartsFor(question.ruleCode, pdfParts);
          const targetedPdfs = candidatePdfs.filter((part) => {
            const name = part.pdfFileName ?? "";
            if (/sign|标识|标牌/i.test(name))
              return /标识|标牌|导向|sign/i.test(unresolved);
            if (/floor|garage|parking|车库|停车|车位/i.test(name))
              return /图纸|平面|位号|分区|车位|位置|重叠|独立|plan|layout/i.test(
                unresolved,
              );
            return true;
          });
          for (const selected of targetedPdfs.length
            ? targetedPdfs
            : candidatePdfs) {
            const file = visualPdfs.find(
              (item) => item.id === selected.source.materialVersionId,
            );
            if (!file) continue;
            let full = signedFullPdfs.get(file.id);
            if (!full) {
              const { data, error } = await supabase.storage
                .from("gv-materials")
                .createSignedUrl(file.storage_path, 600);
              if (error || !data?.signedUrl) {
                errors.push(
                  `${question.ruleCode} 视觉补读：${file.file_name} 临时访问失败`,
                );
                continue;
              }
              const originalPageCount = visualPageCounts.get(file.id) ?? 0;
              if (!originalPageCount) continue;
              full = {
                pdfUrl: data.signedUrl,
                pdfFileName: file.file_name,
                pdfPageCount: originalPageCount,
                pdfOriginalPages: Array.from(
                  { length: originalPageCount },
                  (_, index) => index + 1,
                ),
                source: {
                  materialVersionId: file.id,
                  note: "千问 PDF 视觉补读候选；引用原件页码",
                },
              };
              signedFullPdfs.set(file.id, full);
            }
            fullPdfs.push(full);
          }
          if (!fullPdfs.length) continue;
          expandedQuestions.push({
            ...question,
            evidenceParts: [
              ...(ruleEvidence.get(question.ruleCode) ?? []),
              ...imageParts,
              ...fullPdfs,
            ],
          });
        }
        if (expandedQuestions.length) {
          const expanded = await aiProvider.checkRules({
            taskId,
            roundId: round.id,
            ruleVersion: rulePackage.package_version,
            questions: expandedQuestions,
          });
          if (expanded.ok) {
            usage.inputTokens += expanded.usage.inputTokens;
            usage.outputTokens += expanded.usage.outputTokens;
            usage.billablePages += expanded.usage.billablePages ?? 0;
            for (const item of expanded.value) {
              const question = expandedQuestions.find(
                (entry) => entry.ruleCode === item.ruleCode,
              );
              if (!question) continue;
              const fullParts = question.evidenceParts.filter(
                (part) => part.pdfDataUrl || part.pdfUrl,
              );
              const validated = [
                ...item.citations,
                ...item.supportedFindings.flatMap(
                  (finding) => finding.citations,
                ),
              ].some((source) => citationWasRetrieved(source, fullParts));
              if (!validated) continue;
              semanticResults.set(item.ruleCode, item);
              expandedVisualParts.set(item.ruleCode, fullParts);
            }
          } else {
            errors.push(`图纸视觉补读：${expanded.message}`);
          }
        }
      }
      const supportQuestions = semanticQuestions.flatMap((question) => {
        const existing = semanticResults.get(question.ruleCode);
        const textParts = question.evidenceParts.filter((part) =>
          Boolean(part.text?.trim()),
        );
        if (!existing || !textParts.length) return [];
        return [
          {
            ...question,
            question: `${question.question}\n本次只补查首轮可能遗漏的、与本规则不同子条件有关的材料直接事实。首轮已列支持事实：${existing.supportedFindings.map((item) => item.text).join("；") || "无"}。不得重复这些事实；有可定位材料页码才写 supportedFindings。本次只有文字片段，不能宣称已经看见图纸图像。已见手册能力不能推断项目实际安装、联网或启用。数量、图纸标识、空间独立性分别处理，未证实的条件继续保留。`,
            evidenceParts: textParts,
          },
        ];
      });
      const supportBatches = Array.from(
        { length: Math.ceil(supportQuestions.length / 2) },
        (_, index) => supportQuestions.slice(index * 2, index * 2 + 2),
      );
      const supportResults = await Promise.all(
        supportBatches.map((questions) =>
          aiProvider.checkRules({
            taskId,
            roundId: round.id,
            ruleVersion: rulePackage.package_version,
            questions,
          }),
        ),
      );
      for (const [index, extra] of supportResults.entries()) {
        if (!extra.ok) continue;
        usage.inputTokens += extra.usage.inputTokens;
        usage.outputTokens += extra.usage.outputTokens;
        for (const item of extra.value) {
          const question = supportBatches[index].find(
            (entry) => entry.ruleCode === item.ruleCode,
          );
          const existing = semanticResults.get(item.ruleCode);
          if (!question || !existing) continue;
          semanticResults.set(item.ruleCode, {
            ...existing,
            supportedFindings: mergeAdditionalSupport(
              item.ruleCode,
              existing.supportedFindings,
              item.supportedFindings,
              question.evidenceParts,
            ),
          });
        }
      }
      if (reuseParsedMaterials && cachedRun) {
        for (const [ruleCode, retained] of reusableFindings) {
          const current = semanticResults.get(ruleCode);
          const prior = (cachedRun.results as GvComputedResult[]).find(
            (item) => item.ruleId === ruleCode,
          );
          const combined = [...retained, ...(current?.supportedFindings ?? [])];
          const seen = new Set<string>();
          const unique = combined.filter((finding) => {
            const key = `${finding.text.trim().toLowerCase()}:${finding.citations
              .map(
                (source) => `${source.materialVersionId}:${source.page ?? ""}`,
              )
              .sort()
              .join(",")}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          semanticResults.set(ruleCode, {
            ruleCode,
            support: current?.support ?? prior?.semanticSupport ?? "partial",
            citations: [
              ...(current?.citations ?? []),
              ...retained.flatMap((finding) => finding.citations),
            ],
            gaps: current?.gaps ?? [],
            humanQuestions: current?.humanQuestions ?? [],
            unverifiedFindings: [
              ...(prior?.unverifiedFindings ?? []),
              ...(current?.unverifiedFindings ?? []),
            ].filter(
              (finding, index, all) =>
                all.findIndex(
                  (item) => item.text.trim() === finding.text.trim(),
                ) === index,
            ),
            supportedFindings: dedupeRuleSupport(ruleCode, unique),
          });
        }
      }
      if (
        !reuseParsedMaterials &&
        task.project_id === "00000000-0000-0000-0000-000000000000"
      ) {
        const { data: priorRun } = await supabase
          .from("gv_processing_runs")
          .select("results, scope_confirmed_at, selected_material_version_ids")
          .eq("task_id", taskId)
          .eq("round_id", round.id)
          .is("cleared_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (
          priorRun &&
          priorRun.scope_confirmed_at === round.scope_confirmed_at &&
          JSON.stringify(
            [...(priorRun.selected_material_version_ids ?? [])].sort(),
          ) === JSON.stringify([...ids].sort())
        ) {
          const previousR06 = (
            (Array.isArray(priorRun.results)
              ? priorRun.results
              : []) as GvComputedResult[]
          ).find((item) => item.ruleId === "R06");
          const retained = (previousR06?.supportedFindings ?? []).filter(
            (finding) =>
              finding.citations.length > 0 &&
              finding.citations.every((source) =>
                ids.includes(source.materialVersionId),
              ),
          );
          if (retained.length) {
            carriedEvidenceParts.set(
              "R06",
              retained.flatMap((finding) =>
                finding.citations.map((source) => ({
                  text: finding.text,
                  source,
                })),
              ),
            );
            const current = semanticResults.get("R06");
            semanticResults.set("R06", {
              ruleCode: "R06",
              support:
                current?.support === "supports" &&
                (previousR06?.unverifiedFindings?.length ?? 0) > 0
                  ? "partial"
                  : (current?.support ?? "partial"),
              citations:
                current?.citations ??
                retained.flatMap((finding) => finding.citations),
              gaps: current?.gaps ?? previousR06?.issues ?? [],
              humanQuestions:
                current?.humanQuestions ?? previousR06?.humanQuestions ?? [],
              unverifiedFindings: [
                ...(previousR06?.unverifiedFindings ?? []),
                ...(current?.unverifiedFindings ?? []),
              ].filter(
                (finding, index, all) =>
                  all.findIndex(
                    (item) => item.text.trim() === finding.text.trim(),
                  ) === index,
              ),
              supportedFindings: dedupeRuleSupport("R06", [
                ...retained,
                ...(current?.supportedFindings ?? []),
              ]),
            });
          }
        }
      }
      const r05Assessment = semanticResults.get("R05");
      const r05VisualParts = visualPartsFor("R05", pdfParts);
      const signageParts = r05VisualParts.filter((part) =>
        /sign|标识|标牌/i.test(part.pdfFileName ?? ""),
      );
      const focusedSignageParts = signageParts.length
        ? signageParts
        : r05VisualParts;
      if (
        r05Assessment &&
        focusedSignageParts.length &&
        !hasCitedR05Signage(r05Assessment.supportedFindings, r05VisualParts)
      ) {
        const primarySignage = focusedSignageParts[0];
        const signageFile = visualPdfs.find(
          (file) => file.id === primarySignage.source.materialVersionId,
        );
        let focusedPages: LocatedContent[] = [];
        if (signageFile) {
          const { data } = await supabase.storage
            .from("gv-materials")
            .download(signageFile.storage_path);
          if (data)
            try {
              const cropped = await cropVisualPdf(
                new Uint8Array(await data.arrayBuffer()),
                signageFile.file_name,
              );
              focusedPages = [
                {
                  pdfDataUrl: cropped.dataUrl,
                  pdfFileName: signageFile.file_name,
                  pdfPageCount: cropped.originalPages.length,
                  pdfOriginalPages: cropped.originalPages,
                  source: {
                    materialVersionId: signageFile.id,
                    note: "千问 PDF 聚焦标识视觉补读候选；引用原件页码",
                  },
                },
              ];
            } catch {
              // Full source is still available if a page cannot be cropped.
            }
        }
        let signageFinding = null;
        for (const parts of [focusedPages, focusedSignageParts]) {
          if (!parts.length || signageFinding) break;
          const signage = await aiProvider.inspectR05Signage({
            ruleVersion: rulePackage.package_version,
            visualParts: parts,
          });
          if (!signage.ok) continue;
          usage.inputTokens += signage.usage.inputTokens;
          usage.outputTokens += signage.usage.outputTokens;
          usage.billablePages += signage.usage.billablePages ?? 0;
          signageFinding = verifiedR05SignageFinding(signage.value, parts);
        }
        if (signageFinding)
          semanticResults.set("R05", {
            ...r05Assessment,
            supportedFindings: mergeVerifiedR05Signage(
              r05Assessment.supportedFindings,
              signageFinding,
              r05VisualParts,
            ),
          });
      }
    }
    const results: GvComputedResult[] = calculated.map((result) => {
      const match = semanticResults.get(result.ruleId);
      if (!match && semanticResults.size)
        errors.push(`${result.ruleId} 未返回可验证的 AI 核查结果`);
      const scopedEvidence = evidenceFor(result.ruleId);
      const citations = (match?.citations ?? [])
        .map((source) => retrievedSource(source, scopedEvidence))
        .filter((source): source is SourceLocation => source !== null);
      const citedFindings = (match?.supportedFindings ?? []).flatMap(
        (finding) =>
          finding.citations
            .map((source) => retrievedSource(source, scopedEvidence))
            .filter((source): source is SourceLocation => source !== null),
      );
      const unlocated = Boolean(
        match &&
          match.support !== "unknown" &&
          !citations.length &&
          !citedFindings.length,
      );
      const verifiedFindings = (findings: unknown, requireCitation: boolean) =>
        Array.isArray(findings)
          ? findings.flatMap((finding) => {
              if (
                !finding ||
                typeof finding !== "object" ||
                typeof finding.text !== "string" ||
                !Array.isArray(finding.citations)
              )
                return [];
              const located = finding.citations
                .map((source: SourceLocation) =>
                  retrievedSource(source, scopedEvidence),
                )
                .filter(
                  (source: SourceLocation | null): source is SourceLocation =>
                    source !== null,
                );
              return located.length || !requireCitation
                ? [
                    {
                      text: finding.text,
                      citations: located,
                      sourceStatements: Array.isArray(finding.sourceStatements)
                        ? finding.sourceStatements.filter(
                            (item: unknown): item is string =>
                              typeof item === "string",
                          )
                        : undefined,
                    },
                  ]
                : [];
            })
          : [];
      const rawSupportedFindings = unlocated
        ? []
        : verifiedFindings(match?.supportedFindings, true);
      const rawUnverifiedFindings = verifiedFindings(
        match?.unverifiedFindings,
        false,
      );
      const { supported: supportedFindings, unverified: unverifiedFindings } =
        refineSemanticFindings(
          result.ruleId,
          rawSupportedFindings,
          rawUnverifiedFindings,
          result,
        );
      if (result.ruleId === "R01" && basementTotals.length >= 2) {
        const subtotal = basementTotals.reduce(
          (sum, item) => sum + item.count,
          0,
        );
        const declared = facts.total_parking_spaces.value;
        const siteRun =
          drawingNumberRuns.length === 1 ? drawingNumberRuns[0] : null;
        const siteSentence = siteRun
          ? `场地图纸车位位号 1—${siteRun.last}，文字层直接读到 ${siteRun.readCount} 个${siteRun.missing.length ? `，${siteRun.missing.join("、")} 号须查看原图` : "，无漏号"}；地面候选 ${siteRun.last} 个。`
          : "";
        const floors = basementTotals
          .map((item) => `B${item.floor} ${item.count} 个`)
          .join("、");
        supportedFindings.push({
          text:
            `${floors}；已识别地下层合计 ${subtotal} 个。${siteSentence}` +
            (declared !== null
              ? declared >= subtotal
                ? siteRun && subtotal + siteRun.last === declared
                  ? `地下层与地面候选合计 ${declared} 个，与申报总车位一致；漏号、统计范围和重复计数仍待核对。`
                  : `申报总车位为 ${declared} 个，剩余 ${declared - subtotal} 个的来源及统计范围待核对；不能凭差额推定车位位置。`
                : `已识别地下层车位多于申报总数 ${declared} 个，须核对分区是否重复、图纸版本和统计范围。`
              : "申报总车位仍待确认，不能将这两层直接当作项目总数。"),
          citations: [
            ...basementTotals.map((item) => item.source),
            ...(siteRun ? [siteRun.source] : []),
            ...facts.total_parking_spaces.sources,
          ],
        });
      }
      const uniqueSupportedFindings = dedupeRuleSupport(
        result.ruleId,
        supportedFindings,
      );
      const semanticSupport = unlocated
        ? "unknown"
        : calibrateCandidateSupport(
            result,
            match?.support ?? "unknown",
            uniqueSupportedFindings,
            unverifiedFindings,
          );
      return {
        ...result,
        conditionCoverage: conditionCandidateCoverage(
          result.ruleId,
          candidates,
        ),
        semanticSupport,
        citations,
        supportedFindings: uniqueSupportedFindings,
        unverifiedFindings,
        basisRetrieval: basisReceipts.get(result.ruleId),
        retrievedSources: scopedEvidence.map((part) => part.source),
        visualEvidenceUsed: [
          ...citations,
          ...uniqueSupportedFindings.flatMap((finding) => finding.citations),
        ].some((source) => source.note?.includes("PDF 视觉识别")),
        gaps: [
          ...(match?.gaps ?? []).filter(
            (item): item is string => typeof item === "string",
          ),
          ...(scopedEvidence.length
            ? []
            : ["本轮材料未检索到该规则的可定位证据，请人工核对原件。"]),
          ...(unlocated
            ? ["AI 未提供可在本规则检索片段中定位的引用，须人工核对原件。"]
            : []),
        ],
        humanQuestions: (match?.humanQuestions ?? []).filter(
          (item): item is string => typeof item === "string",
        ),
      };
    });
    if (process.env.GV_RULE_GUIDANCE_RAG_ENABLED !== "false") {
      const guidanceQuestions = results
        .flatMap((result) => {
          const pending =
            result.unverifiedFindings?.map((item) => item.text) ?? [];
          const questions = [
            ...new Set(
              pending.length ? pending : (result.humanQuestions ?? []),
            ),
          ]
            .filter((question) => question.trim())
            .slice(0, 3);
          return questions.flatMap((question, questionIndex) => {
            const chunks = retrieveGvGuidanceChunks(
              result.ruleId,
              [question],
              2,
            );
            return chunks.length
              ? [{ ruleCode: result.ruleId, questionIndex, question, chunks }]
              : [];
          });
        })
        .slice(0, 12);
      const retrieved = new Map(
        guidanceQuestions.map(
          (item) =>
            [
              `${item.ruleCode}:${item.questionIndex}`,
              { question: item.question, chunks: item.chunks },
            ] as const,
        ),
      );
      if (guidanceQuestions.length) {
        const guidance = await aiProvider.explainRuleGuidance({
          ruleVersion: rulePackage.package_version,
          questions: guidanceQuestions.map((item) => ({
            ruleCode: item.ruleCode,
            questionIndex: item.questionIndex,
            question: item.question,
            chunks: item.chunks.map(({ id, clause, page, quote }) => ({
              id,
              clause,
              page,
              quote,
            })),
          })),
        });
        if (guidance.ok) {
          usage.inputTokens += guidance.usage.inputTokens;
          usage.outputTokens += guidance.usage.outputTokens;
          const validated = validateGvGuidance(
            guidance.value,
            retrieved,
            rulePackage.package_version,
          );
          for (const result of results) {
            if (
              !guidanceQuestions.some((item) => item.ruleCode === result.ruleId)
            )
              continue;
            result.ruleGuidance = validated.get(result.ruleId) ?? [];
            result.ruleGuidanceStatus = result.ruleGuidance.length
              ? "FOUND"
              : "NOT_FOUND";
          }
        } else {
          for (const result of results) {
            if (
              guidanceQuestions.some((item) => item.ruleCode === result.ruleId)
            )
              result.ruleGuidanceStatus = "FAILED";
          }
        }
      }
    }
    const { data: currentRound } = await supabase
      .from("task_rounds")
      .select(
        "scope_confirmed_at, rule_version_id, selected_material_version_ids, status",
      )
      .eq("id", round.id)
      .single();
    if (
      !currentRound ||
      currentRound.scope_confirmed_at !== round.scope_confirmed_at ||
      currentRound.rule_version_id !== rulePackage.id ||
      JSON.stringify(currentRound.selected_material_version_ids) !==
        JSON.stringify(ids) ||
      !["open", "returned", "submitted"].includes(currentRound.status)
    ) {
      const result = failure(
        "CONFLICT",
        "运行期间审核范围或材料已变化，本次结果未保存。请刷新后重新运行。",
      );
      return NextResponse.json(result, { status: actionStatus(result) });
    }
    const { data: run, error: saveError } = await supabase
      .from("gv_processing_runs")
      .insert({
        task_id: taskId,
        round_id: round.id,
        scope_confirmed_at: round.scope_confirmed_at,
        rule_version_id: rulePackage.id,
        selected_material_version_ids: ids,
        results,
        status: errors.length ? "partial" : "complete",
        error_message: errors.join("；") || null,
        usage,
        provider: "qwen",
        model: model
          ? reuseParsedMaterials
            ? `${model}（复用材料解析）`
            : model
          : "未完成模型核查",
        created_by: actor.id,
      })
      .select("id, status, error_message")
      .single();
    if (saveError) throw saveError;
    return NextResponse.json(
      success(
        run,
        errors.length
          ? "规则计算已保存；AI 部分步骤未完成，请按提示人工接续。"
          : reuseParsedMaterials
            ? "已复用材料解析并重新执行字段提取、规则计算、语义核查和规则提示；未重新读取 PDF 图像。"
            : "GV 适用规则已完成候选初审，请逐项核对原件并保存专业判断。",
      ),
    );
  } catch (error) {
    const result =
      error instanceof AuthorizationError
        ? failure(
            error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
            error.message,
          )
        : failure("INTERNAL", "GV 初审未能保存，请稍后重试或人工接续。");
    return NextResponse.json(result, { status: actionStatus(result) });
  }
}
