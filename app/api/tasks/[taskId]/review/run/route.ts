import { NextResponse } from "next/server";
import type { LocatedContent, RuleEvidenceAssessment } from "@/lib/ai/provider";
import { aiProvider } from "@/lib/ai/qwen";
import { imageVisionContent } from "@/lib/documents/parse-image";
import { actionStatus, failure, success } from "@/lib/gv/action-result";
import { retrieveGvBasis } from "@/lib/gv/basis-retrieval";
import { conditionCandidateCoverage } from "@/lib/gv/condition-catalog";
import {
  citationWasRetrieved,
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
import { gvRules, ruleApplies } from "@/lib/gv/rule-catalog";
import {
  evaluateGvRules,
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
import type { SourceLocation } from "@/lib/gv/types";
import { AuthorizationError, requireTaskAccess } from "@/lib/supabase/auth";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const { supabase, actor, task } = await requireTaskAccess(taskId, true);
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
      !["open", "returned"].includes(round.status)
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
      supabase
        .from("parsed_fragments")
        .select("material_version_id, text_content, source_location, status")
        .in("material_version_id", ids)
        .order("sequence")
        .limit(180),
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
    );
    const imageParts: LocatedContent[] = [];
    for (const file of (versions ?? [])
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
    const pdfParts: LocatedContent[] = [];
    const visualPageCounts = new Map<string, number>();
    const visualPdfs = (versions ?? [])
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
      const { data: added, error } = await supabase
        .from("fact_candidates")
        .insert(
          patterned.map((item) => ({
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
          })),
        )
        .select(
          "id, field_key, candidate_value, unit, source_location, material_version_id",
        );
      if (error) throw error;
      candidates = [...candidates, ...((added ?? []) as NumericCandidate[])];
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
        const { data: added, error } = await supabase
          .from("fact_candidates")
          .insert(
            fresh.map((item) => ({
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
            })),
          )
          .select(
            "id, field_key, candidate_value, unit, source_location, material_version_id",
          );
        if (error) throw error;
        candidates = [...candidates, ...((added ?? []) as NumericCandidate[])];
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
    const ruleEvidence = retrieveGvRuleEvidence(
      (fragments ?? []) as {
        material_version_id: string;
        text_content: string;
        source_location: SourceLocation | null;
        status: string;
      }[],
      applicableRules.map((rule) => rule.code),
      ids,
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
    const evidenceFor = (code: (typeof applicableRules)[number]["code"]) => [
      ...(ruleEvidence.get(code) ?? []),
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
    }
    const results = calculated.map((result) => {
      const match = semanticResults.get(result.ruleId);
      if (!match && semanticResults.size)
        errors.push(`${result.ruleId} 未返回可验证的 AI 核查结果`);
      const scopedEvidence = evidenceFor(result.ruleId);
      const citations = (match?.citations ?? [])
        .map((source) => retrievedSource(source, scopedEvidence))
        .filter((source): source is SourceLocation => source !== null);
      const unlocated = Boolean(
        match && match.support !== "unknown" && !citations.length,
      );
      const verifiedFindings = (findings: unknown, requireCitation: boolean) =>
        Array.isArray(findings)
          ? findings
              .flatMap((finding) => {
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
                  ? [{ text: finding.text.slice(0, 300), citations: located }]
                  : [];
              })
              .slice(0, 5)
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
        );
      if (result.ruleId === "R01" && basementTotals.length >= 2) {
        const subtotal = basementTotals.reduce(
          (sum, item) => sum + item.count,
          0,
        );
        const declared = facts.total_parking_spaces.value;
        const floors = basementTotals
          .map((item) => `B${item.floor} ${item.count} 个`)
          .join("、");
        supportedFindings.push({
          text:
            `${floors}；已识别地下层合计 ${subtotal} 个。` +
            (declared !== null
              ? declared >= subtotal
                ? `申报总车位为 ${declared} 个，剩余 ${declared - subtotal} 个的来源及统计范围待核对；不能凭差额推定车位位置。`
                : `已识别地下层车位多于申报总数 ${declared} 个，须核对分区是否重复、图纸版本和统计范围。`
              : "申报总车位仍待确认，不能将这两层直接当作项目总数。"),
          citations: [
            ...basementTotals.map((item) => item.source),
            ...facts.total_parking_spaces.sources,
          ],
        });
      }
      const semanticSupport = unlocated
        ? "unknown"
        : calibrateCandidateSupport(
            result,
            match?.support ?? "unknown",
            supportedFindings,
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
        supportedFindings,
        unverifiedFindings,
        basisRetrieval: basisReceipts.get(result.ruleId),
        retrievedSources: scopedEvidence.map((part) => part.source),
        visualEvidenceUsed: [
          ...citations,
          ...supportedFindings.flatMap((finding) => finding.citations),
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
      !["open", "returned"].includes(currentRound.status)
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
        model: model || "未完成模型核查",
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
