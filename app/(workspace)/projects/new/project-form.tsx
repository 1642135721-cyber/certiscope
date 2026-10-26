"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { IntakeCandidate } from "@/lib/gv/project-intake";

interface IntakeResponse {
  ok: boolean;
  data?: {
    path: string;
    candidates: IntakeCandidate[];
    parseStatus: string;
    message: string;
  };
  message?: string;
}

const fieldLabels = {
  name: "项目名称",
  project_type: "项目类型",
  location: "项目地点",
  area: "建筑面积",
  target_level: "目标／申报等级",
  system: "认证体系候选",
  system_version: "标准版本候选",
  stage: "审核阶段候选",
  credit_scope: "GV 审核范围候选",
  incentive_path: "A／B 路径候选",
  facility_path: "C／D 路径候选",
} as const;

type ProjectFields = {
  name: string;
  projectType: string;
  location: string;
  areaValue: string;
  areaUnit: string;
  targetLevel: string;
};

const emptyFields: ProjectFields = {
  name: "",
  projectType: "",
  location: "",
  areaValue: "",
  areaUnit: "",
  targetLevel: "",
};

function candidateFields(
  candidates: IntakeCandidate[],
): Partial<ProjectFields> {
  const unique = (field: IntakeCandidate["field"]) => {
    const values = candidates
      .filter((item) => item.field === field)
      .map((item) => item.value.trim())
      .filter(Boolean);
    return new Set(
      values.map((value) => value.replace(/\s+/g, " ").toLocaleLowerCase()),
    ).size === 1
      ? (values[0] ?? "")
      : "";
  };
  const areaValues = [
    ...new Set(
      candidates
        .filter((item) => item.field === "area")
        .map(
          (item) =>
            item.value
              .replaceAll(",", "")
              .match(/(\d+(?:\.\d+)?)\s*(?:m²|㎡|m2|平方米)/i)?.[1],
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  return {
    name: unique("name"),
    projectType: unique("project_type"),
    location: unique("location"),
    areaValue: areaValues.length === 1 ? areaValues[0] : "",
    areaUnit: areaValues.length === 1 ? "m²" : "",
    targetLevel: unique("target_level"),
  };
}

const supportedFile = (name: string) =>
  /\.(pdf|doc|docx|xlsx|jpe?g|png)$/i.test(name);

export function NewProjectForm() {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sourceFiles, setSourceFiles] = useState<
    { path: string; name: string; relativePath?: string; parseStatus: string }[]
  >([]);
  const [fields, setFields] = useState<ProjectFields>(emptyFields);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preview, setPreview] = useState("");
  const [candidates, setCandidates] = useState<IntakeCandidate[]>([]);
  const [intakeMessage, setIntakeMessage] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [busy, setBusy] = useState<"upload" | "recheck" | "save" | null>(null);
  const [message, setMessage] = useState("");
  const requestKey = useRef<string | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const conflictingFields = (
    ["name", "project_type", "location", "area", "target_level"] as const
  ).filter((field) => {
    const values = candidates
      .filter((item) => item.field === field)
      .map((item) =>
        item.value.trim().replace(/\s+/g, " ").toLocaleLowerCase(),
      );
    return new Set(values).size > 1;
  });

  function fillFromCandidate(candidate: IntakeCandidate) {
    if (candidate.field === "area") {
      const area = candidate.value
        .replaceAll(",", "")
        .match(/(\d+(?:\.\d+)?)\s*(?:m²|㎡|m2|平方米)/i);
      if (!area) {
        setMessage(
          "这条建筑面积候选没有可确认的平方米单位，请对照原件手动填写。",
        );
        return;
      }
      setFields((current) => ({
        ...current,
        areaValue: area[1],
        areaUnit: "m²",
      }));
      return;
    }
    switch (candidate.field) {
      case "name":
        setFields((current) => ({ ...current, name: candidate.value }));
        break;
      case "project_type":
        setFields((current) => ({ ...current, projectType: candidate.value }));
        break;
      case "location":
        setFields((current) => ({ ...current, location: candidate.value }));
        break;
      case "target_level":
        setFields((current) => ({ ...current, targetLevel: candidate.value }));
        break;
    }
  }

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    const first = selectedFiles[0];
    if (!first) return;
    const url = URL.createObjectURL(first);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFiles]);

  function selectFiles(files: FileList | null) {
    const all = Array.from(files ?? []);
    const supported = all.filter((item) => supportedFile(item.name));
    setSelectedFiles(supported);
    setUploadProgress(0);
    setIntakeMessage("");
    setMessage(
      all.length > supported.length
        ? `已跳过 ${all.length - supported.length} 个不支持的文件；可上传 PDF、DOC、DOCX、XLSX、JPG、PNG。`
        : "",
    );
  }

  async function uploadIntake() {
    if (!selectedFiles.length) return;
    setBusy("upload");
    setMessage("");
    const gathered: IntakeCandidate[] = [];
    const errors: string[] = [];
    for (const [index, file] of selectedFiles.entries()) {
      const payload = new FormData();
      payload.set("file", file);
      try {
        const response = await fetch("/api/projects/intake", {
          method: "POST",
          body: payload,
        });
        const result = (await response.json()) as IntakeResponse;
        if (!result.ok || !result.data)
          throw new Error(result.message ?? "上传失败");
        const data = result.data;
        setSourceFiles((current) =>
          current.some((item) => item.path === data.path)
            ? current
            : [
                ...current,
                {
                  path: data.path,
                  name: file.name,
                  relativePath: file.webkitRelativePath || undefined,
                  parseStatus: data.parseStatus,
                },
              ],
        );
        gathered.push(...data.candidates);
      } catch (error) {
        errors.push(
          `${file.webkitRelativePath || file.name}：${error instanceof Error ? error.message : "上传失败"}`,
        );
      }
      setUploadProgress(index + 1);
    }
    const combined = [...candidates, ...gathered];
    setCandidates(combined);
    const inferred = candidateFields(combined);
    setFields(
      (current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [
            key,
            value || inferred[key as keyof ProjectFields] || "",
          ]),
        ) as ProjectFields,
    );
    setIntakeMessage(
      `已处理 ${selectedFiles.length} 份材料，提取 ${gathered.length} 条候选；右侧已预填唯一候选，请对照原件核对。`,
    );
    if (errors.length)
      setMessage(
        `${errors.length} 份材料未成功：${errors.slice(0, 3).join("；")}`,
      );
    setSelectedFiles([]);
    setBusy(null);
  }

  async function recheckIntake() {
    if (!sourceFiles.length) return;
    setBusy("recheck");
    setMessage("");
    setRecognitionMessage("");
    setUploadProgress(0);
    const gathered: IntakeCandidate[] = [];
    const errors: string[] = [];
    for (const [index, file] of sourceFiles.entries()) {
      try {
        const response = await fetch("/api/projects/intake/recheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: file.path, name: file.name }),
        });
        const result = (await response.json()) as {
          ok: boolean;
          data?: { candidates: IntakeCandidate[] };
          message?: string;
        };
        if (!result.ok || !result.data)
          throw new Error(result.message ?? "识别失败");
        gathered.push(...result.data.candidates);
      } catch (error) {
        errors.push(
          `${file.name}：${error instanceof Error ? error.message : "识别失败"}`,
        );
      }
      setUploadProgress(index + 1);
    }
    const combined = [...candidates, ...gathered];
    setCandidates(combined);
    const inferred = candidateFields(combined);
    setFields(
      (current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [
            key,
            value || inferred[key as keyof ProjectFields] || "",
          ]),
        ) as ProjectFields,
    );
    const projectCount = gathered.filter((item) =>
      ["name", "project_type", "location", "area", "target_level"].includes(
        item.field,
      ),
    ).length;
    setRecognitionMessage(
      projectCount
        ? `重新识别出 ${projectCount} 条项目资料候选；唯一候选已预填，请对照原件核对。`
        : "已重新识别材料，但没有找到可定位的项目资料；请对照原件填写空白项。",
    );
    if (errors.length)
      setMessage(
        `${errors.length} 份材料未成功：${errors.slice(0, 3).join("；")}`,
      );
    setBusy(null);
  }

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setMessage("");
    const input = {
      name: fields.name,
      projectType: fields.projectType,
      location: fields.location,
      areaValue: Number(fields.areaValue),
      areaUnit: fields.areaUnit,
      targetLevel: fields.targetLevel,
      sourceFiles,
    };
    requestKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey.current,
        },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.message ?? "项目保存失败");
      router.push(`/projects/${result.data.projectId}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "项目保存失败，请重试。",
      );
    } finally {
      setBusy(null);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-lg border border-[#c9d9cf] bg-white px-4 py-3 outline-none focus:border-[#23825a] focus:ring-2 focus:ring-[#23825a]/15";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section className="self-start rounded-2xl border border-[#dce8df] bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">项目审核材料</h2>
        <p className="mt-2 text-sm text-[#60766a]">
          可选择多份文件或整个文件夹。系统逐份上传并识别候选信息，保存前请对照原件核对。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <label className="cursor-pointer rounded-lg bg-[#e7f3eb] px-4 py-2 text-sm font-semibold text-[#07583a]">
            选择文件
            <input
              className="sr-only"
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png"
              onChange={(event) => {
                selectFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <label className="cursor-pointer rounded-lg bg-[#e7f3eb] px-4 py-2 text-sm font-semibold text-[#07583a]">
            选择文件夹
            <input
              ref={folderInput}
              className="sr-only"
              type="file"
              multiple
              onChange={(event) => {
                selectFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {selectedFiles.length > 0 && (
          <p className="mt-3 text-sm text-[#376b53]">
            已选择 {selectedFiles.length} 份可识别文件
          </p>
        )}
        <button
          type="button"
          disabled={!selectedFiles.length || busy !== null}
          onClick={uploadIntake}
          className="mt-4 rounded-lg bg-[#07583a] px-5 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy === "upload"
            ? `上传并识别中 ${uploadProgress}/${selectedFiles.length}…`
            : "上传并识别候选"}
        </button>
        {sourceFiles.length > 0 && (
          <div className="mt-4 space-y-1 text-sm text-[#376b53]">
            {sourceFiles.map((item) => (
              <p key={item.path}>
                ✓ {item.relativePath || item.name} ·{" "}
                {item.parseStatus === "extracted" ? "已提取内容" : "待人工核对"}
              </p>
            ))}
          </div>
        )}
        {intakeMessage && (
          <output className="mt-4 rounded-lg bg-[#ecf7f0] p-3 text-sm text-[#206149]">
            {intakeMessage}
          </output>
        )}
        {candidates.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold">待核对候选</h3>
            {candidates.map((candidate, index) => (
              <div
                className="rounded-lg border border-[#dce8df] p-3 text-sm"
                key={`${candidate.field}-${index}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="font-semibold">
                    {fieldLabels[candidate.field]}：{candidate.value}
                  </div>
                  {(
                    [
                      "name",
                      "project_type",
                      "location",
                      "area",
                      "target_level",
                    ] as string[]
                  ).includes(candidate.field) && (
                    <button
                      type="button"
                      onClick={() => fillFromCandidate(candidate)}
                      className="shrink-0 rounded-md border border-[#a8cbb5] px-2 py-1 text-xs font-semibold text-[#0b7950] hover:bg-[#f0f8f3]"
                    >
                      填入右侧
                    </button>
                  )}
                </div>
                <div className="mt-1 text-[#668276]">
                  来源：
                  {sourceFiles.find((file) =>
                    file.path.includes(candidate.source.materialVersionId),
                  )?.name ?? "已上传材料"}{" "}
                  ·
                  {candidate.source.page
                    ? `第 ${candidate.source.page} 页`
                    : candidate.source.sheet
                      ? `${candidate.source.sheet} ${candidate.source.cell ?? ""}`
                      : candidate.source.paragraph
                        ? `第 ${candidate.source.paragraph} 段`
                        : "图像区域／待人工核对"}
                </div>
              </div>
            ))}
          </div>
        )}
        {preview && selectedFiles[0] && (
          <a
            href={preview}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-block text-sm font-semibold text-[#0b704b] underline"
          >
            打开本地原件对照：{selectedFiles[0].name}
          </a>
        )}
      </section>

      <form
        onSubmit={saveProject}
        className="rounded-2xl border border-[#dce8df] bg-white p-6 shadow-sm"
      >
        <h2 className="text-xl font-bold">管理员确认资料</h2>
        <p className="mt-2 text-sm text-[#60766a]">
          只上传 GV
          材料也可以建档；识别出的唯一候选已预填，缺少的基本资料请对照原件补齐。建档后再分配
          LT 审核员。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setFields((current) => ({
                name: current.name || "【测试】GV 审核项目",
                projectType: current.projectType || "办公建筑（测试）",
                location: current.location || "测试地点（待核对）",
                areaValue: current.areaValue || "1000",
                areaUnit: current.areaUnit || "m²",
                targetLevel: current.targetLevel || "测试／待确认",
              }))
            }
            className="rounded-lg border border-[#a8cbb5] px-3 py-2 text-sm font-semibold text-[#0b7950] hover:bg-[#f0f8f3]"
          >
            填入测试项目资料（仅补空白）
          </button>
          <button
            type="button"
            disabled={!sourceFiles.length || busy !== null}
            onClick={recheckIntake}
            className="rounded-lg border border-[#a8cbb5] px-3 py-2 text-sm font-semibold text-[#0b7950] hover:bg-[#f0f8f3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "recheck"
              ? `识别中 ${uploadProgress}/${sourceFiles.length}…`
              : "根据材料识别项目信息"}
          </button>
        </div>
        {recognitionMessage && (
          <output className="mt-3 block rounded-lg bg-[#ecf7f0] p-3 text-sm text-[#206149]">
            {recognitionMessage}
          </output>
        )}
        {conflictingFields.length > 0 && (
          <p className="mt-3 rounded-lg bg-[#fff8e9] p-3 text-sm text-[#895c19]">
            {conflictingFields.map((field) => fieldLabels[field]).join("、")}
            有不同表述，系统未擅自选定。请查看左侧来源并点击对应候选的“填入右侧”。
          </p>
        )}
        <p className="mt-1 text-xs text-[#7d8f83]">
          测试值带有明显标记，请勿用于正式项目。
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-semibold">
            项目名称
            <input
              className={inputClass}
              name="name"
              value={fields.name}
              onChange={(event) =>
                setFields({ ...fields, name: event.target.value })
              }
              required
            />
          </label>
          <label className="text-sm font-semibold">
            项目类型
            <input
              className={inputClass}
              name="projectType"
              value={fields.projectType}
              onChange={(event) =>
                setFields({ ...fields, projectType: event.target.value })
              }
              required
            />
          </label>
          <label className="text-sm font-semibold md:col-span-2">
            项目地点
            <input
              className={inputClass}
              name="location"
              value={fields.location}
              onChange={(event) =>
                setFields({ ...fields, location: event.target.value })
              }
              required
            />
          </label>
          <label className="text-sm font-semibold">
            建筑面积
            <input
              className={inputClass}
              name="areaValue"
              value={fields.areaValue}
              onChange={(event) =>
                setFields({ ...fields, areaValue: event.target.value })
              }
              type="number"
              min="0.01"
              step="any"
              required
            />
          </label>
          <label className="text-sm font-semibold">
            面积单位
            <input
              className={inputClass}
              name="areaUnit"
              value={fields.areaUnit}
              onChange={(event) =>
                setFields({ ...fields, areaUnit: event.target.value })
              }
              placeholder="例如 m²"
              required
            />
          </label>
          <label className="text-sm font-semibold md:col-span-2">
            目标／申报等级
            <input
              className={inputClass}
              name="targetLevel"
              value={fields.targetLevel}
              onChange={(event) =>
                setFields({ ...fields, targetLevel: event.target.value })
              }
              required
            />
          </label>
        </div>
        <div className="my-6 border-t border-[#e1ebe4]" />
        <h3 className="font-bold">审核分配</h3>
        <p className="mt-2 text-sm leading-6 text-[#60766a]">
          建档后可按 LT、SS、WE
          等类别分别派单。材料将关联到项目，并同步至对应审核任务。
        </p>
        <p className="mt-5 rounded-lg bg-[#f2f8f4] p-3 text-sm text-[#517363]">
          识别候选会保留来源；缺失或冲突由审核员对照申报表单和审核材料核对。
        </p>
        {message && (
          <p className="mt-5 text-sm text-[#ab3434]" role="alert">
            {message}
          </p>
        )}
        <button
          className="mt-6 w-full rounded-lg bg-[#07583a] px-5 py-3.5 font-semibold text-white disabled:opacity-50"
          disabled={busy !== null}
          type="submit"
        >
          {busy === "save" ? "正在保存…" : "建立项目"}
        </button>
      </form>
    </div>
  );
}
