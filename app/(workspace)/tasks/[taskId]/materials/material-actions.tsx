"use client";

import { LoaderCircle, Plus, Trash2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type ActionResponse<T> =
  | { ok: true; data: T; message: string }
  | { ok: false; message: string };

export function AdminMaterialRemove({
  projectId,
  versionId,
  fileName,
}: {
  projectId: string;
  versionId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (!window.confirm(`从当前项目移除“${fileName}”？历史审核引用会保留。`))
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/materials/${versionId}?kind=version`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { ok: boolean; message: string };
      if (result.ok) router.refresh();
      else setError(result.message);
    } catch {
      setError("移除失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#b45340] disabled:opacity-50"
      >
        <Trash2 size={15} /> {busy ? "移除中…" : "移除"}
      </button>
      {error && <span role="alert" className="max-w-48 text-xs text-[#b45340]">{error}</span>}
    </span>
  );
}

export function MaterialUpload({
  taskId,
  roundId,
  materialId,
  initialPurpose = "",
}: {
  taskId: string;
  roundId: string;
  materialId?: string;
  initialPurpose?: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [purpose, setPurpose] = useState(initialPurpose);
  const [sourceKind, setSourceKind] = useState("original");
  const [sourceVersion, setSourceVersion] = useState("");
  const [conversionNote, setConversionNote] = useState("");
  const [message, setMessage] = useState("");

  async function submit(form: FormData) {
    setMessage("");
    if (!purpose.trim()) {
      setMessage("请填写材料用途。 ");
      return;
    }
    setBusy(true);
    form.set("roundId", roundId);
    form.set("purpose", purpose.trim());
    form.set("sourceKind", sourceKind);
    if (materialId) form.set("materialId", materialId);
    if (sourceKind === "converted") {
      form.set("convertedFromVersionId", sourceVersion.trim());
      form.set("conversionNote", conversionNote.trim());
    }
    try {
      const response = await fetch(`/api/tasks/${taskId}/materials`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: form,
      });
      const result = (await response.json()) as ActionResponse<unknown>;
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setOpen(false);
      setMessage("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch {
      setMessage("上传暂时失败，请检查连接后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          materialId
            ? "text-sm font-semibold text-[#167b55] hover:underline"
            : "inline-flex items-center gap-2 rounded-xl border border-[#40a87b] px-4 py-2.5 font-semibold text-[#138052] hover:bg-[#eaf9f1]"
        }
      >
        {materialId ? (
          "上传新版本"
        ) : (
          <>
            <Plus size={18} /> 上传原始资料
          </>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a2b20]/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {materialId ? "上传材料新版本" : "上传原始资料"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#668074] hover:text-[#113c2b]"
              >
                关闭
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#71857b]">
              仅上传当前项目获授权的正式材料。支持
              PDF、DOC、DOCX、XLSX、JPG、JPEG、PNG，单文件不超过 50 MB。
            </p>
            <form action={submit} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">
                材料用途
                <input
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="例如：绿色车辆申报说明"
                  className="mt-2 w-full rounded-xl border border-[#d7e6dc] px-4 py-3 outline-[#48a976]"
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                来源类型
                <select
                  value={sourceKind}
                  onChange={(event) => setSourceKind(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#d7e6dc] px-4 py-3"
                >
                  <option value="original">项目原件</option>
                  <option value="converted">受控转换件</option>
                  <option value="screenshot">受控截图</option>
                </select>
              </label>
              {sourceKind === "converted" && (
                <>
                  <label className="block text-sm font-semibold">
                    源材料版本 ID
                    <input
                      value={sourceVersion}
                      onChange={(event) => setSourceVersion(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#d7e6dc] px-4 py-3"
                      required
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    转换说明
                    <input
                      value={conversionNote}
                      onChange={(event) =>
                        setConversionNote(event.target.value)
                      }
                      placeholder="例如：DWG 导出为带版本标记的 PDF"
                      className="mt-2 w-full rounded-xl border border-[#d7e6dc] px-4 py-3"
                      required
                    />
                  </label>
                </>
              )}
              <label className="block text-sm font-semibold">
                文件
                <input
                  ref={fileInput}
                  type="file"
                  name="file"
                  accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png"
                  className="mt-2 block w-full rounded-xl border border-dashed border-[#b9d6c5] p-4 text-sm"
                  required
                />
              </label>
              {message && (
                <p
                  role="alert"
                  className="rounded-lg bg-[#fff0ec] px-3 py-2 text-sm text-[#a64532]"
                >
                  {message}
                </p>
              )}
              <button
                disabled={busy}
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#087249] py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <UploadCloud size={19} />
                )}
                {busy ? "正在上传与登记…" : "确认上传"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export function MaterialOpen({ fileId }: { fileId: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function openFile() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/files/${fileId}`);
      const result = (await response.json()) as ActionResponse<{ url: string }>;
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    } catch {
      setMessage("原件暂时无法打开。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={openFile}
        disabled={busy}
        className="text-sm font-semibold text-[#167b55] hover:underline disabled:opacity-60"
      >
        {busy ? "读取中…" : "查看原件"}
      </button>
      {message && (
        <span role="alert" className="text-xs text-[#a64532]">
          {message}
        </span>
      )}
    </span>
  );
}
