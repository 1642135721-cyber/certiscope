"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TrashItem = { id: string; kind: "project" | "task"; name: string; deletedAt: string; projectName?: string };

export function TrashList({ items }: { items: TrashItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function restore(item: TrashItem) {
    setBusy(item.id);
    setMessage("");
    try {
      const url = item.kind === "project" ? `/api/projects/${item.id}/trash` : `/api/tasks/${item.id}/trash`;
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? "恢复失败");
      setMessage(`${item.name}已恢复。`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败，请重试。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-[#dfeae1] bg-white p-5">
      {message && <p role="status" className="mb-4 rounded-lg bg-[#eef8f1] p-3 text-sm text-[#176a47]">{message}</p>}
      {items.length ? <div className="divide-y divide-[#e9f0e9]">{items.map((item) => (
        <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><strong>{item.name}</strong><p className="mt-1 text-sm text-[#6e8679]">{item.kind === "project" ? "项目及所属任务" : `${item.projectName ?? "所属项目"} · 审核任务`} · 移入时间 {new Date(item.deletedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p></div>
          <button type="button" disabled={busy !== null} onClick={() => restore(item)} className="rounded-lg border border-[#91c8a7] px-4 py-2 text-sm font-semibold text-[#0b7950] disabled:opacity-50">{busy === item.id ? "正在恢复…" : "恢复"}</button>
        </div>
      ))}</div> : <p className="py-10 text-center text-[#789083]">回收站暂无项目或任务。</p>}
    </section>
  );
}
