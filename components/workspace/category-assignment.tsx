"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Auditor = { id: string; display_name: string };
type Assignment = { category_code: string; auditor_id: string; assigned_at: string };
const categories = [["LT", "交通与场地"], ["SS", "可持续场地"], ["WE", "水资源效率"], ["EA", "能源与大气"], ["MR", "材料与资源"], ["EQ", "室内环境质量"]];

export function CategoryAssignment({ projectId, auditors, assignments }: { projectId: string; auditors: Auditor[]; assignments: Assignment[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("LT");
  const [auditorId, setAuditorId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function assign() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, auditorId }) });
      const result = await response.json();
      if (!result.ok) throw new Error(result.message ?? "分配失败");
      setMessage(result.message);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "分配失败"); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">按 LEED 类别分配审核</h2><p className="mt-1 text-sm text-[#758b7e]">一个类别分配给一位审核员。LT 类别接入 Green Vehicles 信用项审核，其他类别保留项目材料与责任归属。</p><div className="mt-4 flex flex-wrap gap-3"><select aria-label="LEED 类别" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-[#d7e6dc] bg-white px-3 py-2 text-sm">{categories.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select><select aria-label="审核员" value={auditorId} onChange={(event) => setAuditorId(event.target.value)} className="rounded-lg border border-[#d7e6dc] bg-white px-3 py-2 text-sm"><option value="">选择审核员</option>{auditors.map((auditor) => <option key={auditor.id} value={auditor.id}>{auditor.display_name}</option>)}</select><button type="button" disabled={busy || !auditorId} onClick={assign} className="rounded-lg bg-[#087d52] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "分配中…" : "确认分配"}</button></div>{message && <p role="status" className="mt-3 text-sm text-[#237454]">{message}</p>}<div className="mt-4 flex flex-wrap gap-2">{assignments.map((item) => <span key={item.category_code} className="rounded-full bg-[#eef7f1] px-3 py-1 text-sm text-[#27664b]">{item.category_code} · {auditors.find((auditor) => auditor.id === item.auditor_id)?.display_name ?? "审核员"}</span>)}</div></section>;
}
