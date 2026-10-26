"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Target = { kind: "project" | "task"; id: string; label: string };

export function AdminTrashControls({
  project,
  tasks,
}: {
  project: { id: string; name: string };
  tasks: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const url = target.kind === "project" ? `/api/projects/${target.id}/trash` : `/api/tasks/${target.id}/trash`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove" }),
      });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? "移入回收站失败");
      setTarget(null);
      if (target.kind === "project") router.push("/projects");
      else router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-[#e4eae5] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">管理员管理</h2>
          <p className="mt-1 text-sm text-[#708679]">移入回收站后可恢复，审核记录与原件暂时保留。</p>
        </div>
        <button type="button" onClick={() => setTarget({ kind: "project", id: project.id, label: project.name })} className="inline-flex items-center gap-2 rounded-lg border border-[#e7c7c2] px-3 py-2 text-sm font-semibold text-[#a74137] hover:bg-[#fff3f1]"><Trash2 size={16} /> 删除项目</button>
      </div>
      {tasks.length > 0 && (
        <div className="mt-4 divide-y divide-[#edf1ee] border-t border-[#edf1ee]">
          {tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{task.label}</span><button type="button" onClick={() => setTarget({ kind: "task", id: task.id, label: task.label })} className="font-semibold text-[#a74137] hover:underline">删除任务</button></div>)}
        </div>
      )}
      {target && (
        <div role="dialog" aria-modal="true" aria-label="确认移入回收站" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">移入项目回收站？</h3>
            <p className="mt-3 text-sm leading-6 text-[#587165]">{target.kind === "project" ? "项目和所属任务" : "审核任务"}“{target.label}”将从工作列表移除。管理员可在项目回收站恢复。</p>
            {error && <p role="alert" className="mt-3 text-sm text-[#a74137]">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => { setTarget(null); setError(""); }} className="rounded-lg border border-[#d8e3db] px-4 py-2 text-sm">取消</button>
              <button type="button" disabled={busy} onClick={remove} className="rounded-lg bg-[#a74137] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "正在移入…" : "确认移入"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
