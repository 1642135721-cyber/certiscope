"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminProjectEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: {
    name: string;
    projectType: string;
    location: string;
    areaValue: number;
    areaUnit: string;
    targetLevel: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const labels: [keyof typeof fields, string][] = [
    ["name", "项目名称"],
    ["projectType", "项目类型"],
    ["location", "项目地点"],
    ["areaValue", "建筑面积"],
    ["areaUnit", "面积单位"],
    ["targetLevel", "目标／申报等级"],
  ];
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setSavedMessage(result.message);
      setOpen(false);
      router.refresh();
    } catch {
      setMessage("网络异常，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }
  function openEditor() {
    setFields(initial);
    setMessage("");
    setSavedMessage("");
    setOpen(true);
  }

  function closeEditor() {
    if (busy) return;
    setFields(initial);
    setMessage("");
    setOpen(false);
  }
  return (
    <div>
      <button
        type="button"
        onClick={openEditor}
        className="rounded-lg border border-[#45a677] bg-[#e8f5ed] px-4 py-2 text-sm font-bold text-[#0b7950] hover:bg-[#d9eee2]"
      >
        修改项目信息
      </button>
      {savedMessage && (
        <p role="status" className="mt-2 rounded-lg bg-white/90 px-3 py-2 text-sm font-semibold text-[#0b7950]">
          {savedMessage}
        </p>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#0b2b20]/45 p-4">
          <form
            onSubmit={save}
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-editor-title"
            className="my-auto w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2 id="project-editor-title" className="text-xl font-bold">修改项目信息</h2>
            <p className="mt-1 text-sm text-[#71857b]">
              修改项目档案后，请核对本轮审核范围中的项目数据。
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {labels.map(([key, label]) => (
                <label key={key} className="text-sm font-semibold">
                  {label}
                  <input
                    required
                    type={key === "areaValue" ? "number" : "text"}
                    min={key === "areaValue" ? "0.01" : undefined}
                    step={key === "areaValue" ? "any" : undefined}
                    value={fields[key]}
                    onChange={(event) =>
                      setFields((current) => ({
                        ...current,
                        [key]:
                          key === "areaValue"
                            ? Number(event.target.value)
                            : event.target.value,
                      }))
                    }
                    className="mt-1 block w-full rounded-lg border border-[#cdded2] px-3 py-2 font-normal"
                  />
                </label>
              ))}
            </div>
            {message && (
              <p role="alert" className="mt-3 text-sm text-[#b34432]">
                {message}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditor}
                disabled={busy}
                className="rounded-lg border px-4 py-2 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#087e52] px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                {busy ? "保存中…" : "保存修改"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
