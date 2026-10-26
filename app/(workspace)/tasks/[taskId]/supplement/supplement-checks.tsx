"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type Check = { requirement_index: number; verdict: string; note: string };

export function SupplementChecks({ taskId, requirements, initial, canEdit, nextHref }: { taskId: string; requirements: string[]; initial: Check[]; canEdit: boolean; nextHref: string }) {
  const [checks, setChecks] = useState<Record<number, { verdict: string; note: string }>>(() => Object.fromEntries(initial.map((item) => [item.requirement_index, { verdict: item.verdict, note: item.note }])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(initial.length >= requirements.length && requirements.length > 0);
  const allChecked = requirements.length > 0 && requirements.every((_, index) => checks[index]?.verdict);
  async function save() {
    setBusy(true); setMessage("");
    try {
      for (let index = 0; index < requirements.length; index++) {
        const item = checks[index];
        if (!item?.verdict) continue;
        const response = await fetch(`/api/tasks/${taskId}/supplement/checks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index, text: requirements[index], verdict: item.verdict, note: item.note }) });
        const result = await response.json() as { ok: boolean; message: string };
        if (!result.ok) throw new Error(result.message);
      }
      setMessage("逐项核对已保存。");
      setSaved(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-[#c9dfd0] bg-white shadow-sm"><div className="border-b border-[#e3eee6] px-5 py-4"><h2 className="text-xl font-bold">逐项核对补件</h2><p className="mt-1 text-sm text-[#71897b]">对照上轮要求、本轮文件与逐项回应。未回应的事项继续保留待核。</p></div><div className="max-h-[440px] space-y-3 overflow-y-auto p-5">{requirements.map((text, index) => <fieldset key={`${index}-${text}`} className="rounded-xl border border-[#dcebe2] p-4"><legend className="px-1 font-semibold">SUP-{String(index + 1).padStart(2, "0")} · 上轮要求</legend><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{text}</p><div className="mt-3 flex gap-2 text-sm"><label className="flex items-center gap-2 rounded-lg border px-3 py-2"><input type="radio" name={`check-${index}`} checked={checks[index]?.verdict === "responded"} onChange={() => { setSaved(false); setChecks((current) => ({ ...current, [index]: { verdict: "responded", note: current[index]?.note ?? "" } })); }} disabled={!canEdit}/> 已回应</label><label className="flex items-center gap-2 rounded-lg border px-3 py-2"><input type="radio" name={`check-${index}`} checked={checks[index]?.verdict === "still_missing"} onChange={() => { setSaved(false); setChecks((current) => ({ ...current, [index]: { verdict: "still_missing", note: current[index]?.note ?? "" } })); }} disabled={!canEdit}/> 仍需补充</label></div><textarea value={checks[index]?.note ?? ""} onChange={(event) => { setSaved(false); setChecks((current) => ({ ...current, [index]: { verdict: current[index]?.verdict ?? "", note: event.target.value } })); }} disabled={!canEdit} rows={2} placeholder="核对说明、文件版本及页码" className="mt-3 w-full rounded-lg border border-[#dbe9df] p-3 text-sm"/></fieldset>)}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3eee6] bg-[#f7faf8] p-4"><span className="text-sm text-[#668071]">{allChecked ? <span className="inline-flex items-center gap-1 text-[#0b8255]"><CheckCircle2 size={17}/> 已逐项选择核对结果</span> : `已核对 ${requirements.filter((_, index) => checks[index]?.verdict).length}/${requirements.length} 项`}</span><div className="flex items-center gap-3">{message && <output className="text-sm text-[#81603a]">{message}</output>}{canEdit && <button type="button" onClick={save} disabled={!allChecked || busy} className="rounded-lg border border-[#9bc9ab] px-4 py-2 text-sm font-semibold text-[#0b7950] disabled:opacity-50">{busy ? "保存中…" : "保存补件核对"}</button>}<Link href={nextHref} aria-disabled={!allChecked || (canEdit && !saved)} tabIndex={!allChecked || (canEdit && !saved) ? -1 : undefined} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${allChecked && (!canEdit || saved) ? "bg-[#0b8255] text-white" : "pointer-events-none bg-[#dce8df] text-[#87998c]"}`}>进入本轮审核 <ArrowRight size={16}/></Link></div></div></section>;
}
