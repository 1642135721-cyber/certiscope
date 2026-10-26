"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { gvEvidenceFields } from "@/lib/gv/field-catalog";
import {
  fieldLabels,
  fieldUnits,
  type NumericCandidate,
  type NumericConfirmation,
  type NumericField,
  numericFields,
  readNumericFacts,
} from "@/lib/gv/rule-engine";
import type { ReviewFile } from "./review-evidence-triad";

export function ReviewFacts({
  taskId,
  files,
  candidates,
  confirmations,
  canEdit,
}: {
  taskId: string;
  files: ReviewFile[];
  candidates: NumericCandidate[];
  confirmations: NumericConfirmation[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [field, setField] = useState<NumericField>("total_parking_spaces");
  const [candidateId, setCandidateId] = useState("");
  const [value, setValue] = useState("");
  const [materialVersionId, setMaterialVersionId] = useState(
    files[0]?.id ?? "",
  );
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const facts = readNumericFacts(candidates, confirmations);
  const choices = facts[field].candidates;
  const evidenceCandidates = candidates.flatMap((item) => {
    const definition = gvEvidenceFields.find(
      (entry) => entry.key === item.field_key,
    );
    if (
      !definition ||
      !item.source_location ||
      !["string", "number", "boolean"].includes(typeof item.candidate_value)
    )
      return [];
    return [
      {
        id: item.id,
        label: definition.label,
        value: String(item.candidate_value),
        source: item.source_location,
      },
    ];
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/review/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldKey: field,
          candidateId: candidateId || undefined,
          value,
          materialVersionId: candidateId ? undefined : materialVersionId,
          location: candidateId ? undefined : location,
          reason,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setMessage(result.message);
      if (result.ok) {
        setCandidateId("");
        setValue("");
        setReason("");
        setLocation("");
        router.refresh();
      }
    } catch {
      setMessage("事实保存失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border border-[#c4ddcb] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">数值事实与原件核对</h3>
        <span className="text-xs text-[#6c8376]">
          确认或修正后，请重新运行整轮初审
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {numericFields.map((key) => {
          const fact = facts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setField(key);
                setCandidateId("");
                setValue("");
              }}
              className={`rounded-xl border p-2.5 text-left text-xs ${field === key ? "border-[#299569] bg-[#eef8f1]" : "border-[#dce8df]"}`}
            >
              <span className="block font-semibold">{fieldLabels[key]}</span>
              <span
                className={
                  fact.conflict
                    ? "text-[#bc513e]"
                    : fact.confirmed
                      ? "text-[#0b8055]"
                      : "text-[#708578]"
                }
              >
                {fact.conflict
                  ? "候选冲突"
                  : fact.value === null
                    ? "缺少数值"
                    : `${fact.value} ${fieldUnits[key]}`}{" "}
                · {fact.confirmed ? "人工已确认" : "待核对"}
              </span>
            </button>
          );
        })}
      </div>
      {evidenceCandidates.length > 0 && (
        <details className="mt-3 rounded-xl border border-[#dce8df] bg-[#f8fbf9] p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[#156c49]">
            其他已提取字段候选（{evidenceCandidates.length}）
          </summary>
          <p className="mt-2 text-xs text-[#718779]">
            以下仅是有原件定位的候选；设备手册能力、图纸标识和项目实际采用仍须分别核对。
          </p>
          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {evidenceCandidates.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[#e1ece5] bg-white p-2.5"
              >
                <p className="font-semibold">{item.label}</p>
                <p className="mt-1 break-words text-[#405f4f]">{item.value}</p>
                <p className="mt-1 text-xs text-[#788c80]">
                  {files.find(
                    (file) => file.id === item.source.materialVersionId,
                  )?.fileName ?? "本轮材料"}
                  {item.source.page
                    ? ` · 第 ${item.source.page} 页`
                    : item.source.sheet
                      ? ` · ${item.source.sheet}${item.source.cell ? ` ${item.source.cell}` : ""}`
                      : " · 原件定位"}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
      {canEdit && (
        <form
          onSubmit={submit}
          className="mt-3 grid gap-2 rounded-xl bg-[#f5faf6] p-3 text-sm sm:grid-cols-2"
        >
          <div className="sm:col-span-2 font-semibold">
            核对：{fieldLabels[field]}
          </div>
          <label>
            已解析候选
            <select
              value={candidateId}
              onChange={(event) => {
                const id = event.target.value;
                setCandidateId(id);
                setValue(
                  String(choices.find((item) => item.id === id)?.value ?? ""),
                );
              }}
              className="mt-1 w-full rounded-lg border border-[#dce8df] bg-white p-2"
            >
              <option value="">手工依据原件录入</option>
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.value} {fieldUnits[field]} ·{" "}
                  {files.find(
                    (file) => file.id === item.source?.materialVersionId,
                  )?.fileName ?? "材料"}
                  {item.source?.page ? ` 第 ${item.source.page} 页` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            核对后的数值（{fieldUnits[field]}）
            <input
              type="number"
              min="0"
              step={["normal_rate", "green_rate"].includes(field) ? "any" : "1"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-[#dce8df] bg-white p-2"
            />
          </label>
          {!candidateId && (
            <>
              <label>
                材料原件
                <select
                  value={materialVersionId}
                  onChange={(event) => setMaterialVersionId(event.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-[#dce8df] bg-white p-2"
                >
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.fileName} · v{file.version}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                页码或图纸位置
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  required
                  placeholder="如第 2 页／P-01 位号表"
                  className="mt-1 w-full rounded-lg border border-[#dce8df] bg-white p-2"
                />
              </label>
            </>
          )}
          <label className="sm:col-span-2">
            核对依据
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              placeholder="说明原件与候选差异及采用此数值的原因"
              className="mt-1 w-full rounded-lg border border-[#dce8df] bg-white p-2"
            />
          </label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <output className="text-xs text-[#976a35]">{message}</output>
            <button
              type="submit"
              disabled={busy || !files.length}
              className="rounded-full bg-[#0a8054] px-4 py-2 text-xs font-bold text-white disabled:opacity-45"
            >
              {busy ? "保存中…" : "保存人工核对"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
