"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Candidate = {
  id: string;
  field_key: string;
  candidate_value: string;
  source_location: {
    fileName?: string;
    note?: string;
    page?: number;
    sheet?: string;
    cell?: string;
    paragraph?: number;
  } | null;
};

const labels: Record<string, string> = {
  system: "认证体系",
  system_version: "标准版本",
  stage: "审核阶段",
  credit_scope: "GV 审核范围",
  incentive_path: "A／B 路径",
  facility_path: "C／D 路径",
};

export function ScopeConfirmation({
  taskId,
  roundId,
  hasIntake,
  candidates,
  current,
  materialVersions,
  availablePackages,
  confirmedAt,
  canConfirm,
}: {
  taskId: string;
  roundId: string;
  hasIntake: boolean;
  candidates: Candidate[];
  current: {
    system: string;
    systemVersion: string;
    stage: string;
    incentivePath: string | null;
    facilityPath: string | null;
  };
  materialVersions: {
    id: string;
    fileName: string;
    version: number;
    isReference: boolean;
  }[];
  availablePackages: {
    id: string;
    system: string;
    system_version: string;
    stage: string;
    package_version: string;
  }[];
  confirmedAt: string | null;
  canConfirm: boolean;
}) {
  const router = useRouter();
  const unique = (field: string) => {
    const values = [
      ...new Set(
        candidates
          .filter((item) => item.field_key === field)
          .map((item) => item.candidate_value),
      ),
    ];
    return values.length === 1 ? values[0] : "";
  };
  const [system, setSystem] = useState(unique("system") || current.system);
  const [version, setVersion] = useState(
    unique("system_version") || current.systemVersion,
  );
  const [stage, setStage] = useState(unique("stage") || current.stage);
  const [incentive, setIncentive] = useState(
    current.incentivePath || unique("incentive_path"),
  );
  const [facility, setFacility] = useState(
    current.facilityPath || unique("facility_path"),
  );
  const [selected, setSelected] = useState<string[]>(
    materialVersions.filter((item) => !item.isReference).map((item) => item.id),
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState("");
  const inputClass =
    "mt-1 w-full rounded-xl border border-[#d6e5dd] bg-white px-3 py-2.5 outline-[#2ca46b]";

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId,
          system,
          systemVersion: version,
          stage,
          incentivePath: incentive,
          facilityPath: facility,
          materialVersionIds: selected,
          reason,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setMessage(result.message);
      if (result.ok) router.refresh();
    } catch {
      setMessage("确认暂时失败，请检查连接后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function extractMaterials() {
    setExtracting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/scope/extract`, {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setMessage(result.message);
      if (result.ok) router.refresh();
    } catch {
      setMessage("本轮材料识别暂时失败，请检查连接后重试。");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <section
      id="scope-confirmation"
      className="scroll-mt-5 rounded-2xl border border-[#a6d9bd] bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[23px] font-bold">核对并确认审核范围</h2>
          <p className="mt-2 text-sm leading-6 text-[#8592a0]">
            系统从申报表单及本轮材料提取候选。审核员对照原件，在同一步确认版本、路径、范围及材料。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canConfirm && materialVersions.length > 0 && (
            <button
              type="button"
              onClick={extractMaterials}
              disabled={extracting}
              className="rounded-full border border-[#3aa573] px-4 py-2 text-sm font-semibold text-[#0c7950] disabled:opacity-50"
            >
              {extracting ? "正在识别材料…" : "从本轮材料识别"}
            </button>
          )}
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${confirmedAt ? "bg-[#e6f6ed] text-[#168456]" : "bg-[#fff4e6] text-[#a87325]"}`}
          >
            {confirmedAt ? "本轮已确认" : "待审核员确认"}
          </span>
        </div>
      </div>
      {!hasIntake && (
        <p className="mt-5 rounded-xl bg-[#fff4e9] p-4 text-sm text-[#a76d2e]">
          当前项目没有独立申报表单。请对照本轮材料核对下方候选；确认依据可以留空，系统会记录本次选择的范围与材料版本。
        </p>
      )}
      {message && (
        <output className="mt-3 block text-sm text-[#a56836]">{message}</output>
      )}
      {
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {Object.entries(labels).map(([field, label]) => {
            const matches = candidates.filter(
              (item) => item.field_key === field,
            );
            const distinct = [
              ...new Set(matches.map((item) => item.candidate_value)),
            ];
            return (
              <div
                key={field}
                className="rounded-xl border border-[#e5eee8] bg-[#fbfdfb] p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong>{label}</strong>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${distinct.length === 1 ? "bg-[#e7f5eb] text-[#138052]" : "bg-[#fff0e7] text-[#a4682e]"}`}
                  >
                    {distinct.length === 1
                      ? "系统候选"
                      : distinct.length
                        ? "候选冲突 · 待核"
                        : "未识别 · 待核"}
                  </span>
                </div>
                {matches.length ? (
                  matches.map((item) => (
                    <p key={item.id} className="mt-1 text-[#496a58]">
                      {item.candidate_value}
                      <span className="ml-2 text-[#8b9a90]">
                        {item.source_location?.fileName
                          ? `${item.source_location.fileName} · `
                          : ""}
                        {item.source_location?.page
                          ? `第 ${item.source_location.page} 页`
                          : item.source_location?.sheet
                            ? `${item.source_location.sheet} ${item.source_location.cell ?? ""}`
                            : item.source_location?.paragraph
                              ? `第 ${item.source_location.paragraph} 段`
                              : "原件位置待核"}
                      </span>
                    </p>
                  ))
                ) : (
                  <p className="mt-1 text-[#b47939]">
                    未可靠识别，须对照原件补正
                  </p>
                )}
              </div>
            );
          })}
        </div>
      }
      {canConfirm && (
        <form
          onSubmit={confirm}
          className="mt-6 grid gap-4 border-t border-[#e8efeb] pt-5 sm:grid-cols-2"
        >
          <label className="text-sm font-semibold sm:col-span-2">
            适用 GV 规则包（请对照项目申报体系和版本选择）
            <select
              className={inputClass}
              value={
                availablePackages.find(
                  (item) =>
                    item.system === system &&
                    item.system_version === version.replace(/^LEED\s+/i, "") &&
                    item.stage === stage,
                )?.id ?? ""
              }
              onChange={(event) => {
                const selectedPackage = availablePackages.find(
                  (item) => item.id === event.target.value,
                );
                if (!selectedPackage) return;
                setSystem(selectedPackage.system);
                setVersion(selectedPackage.system_version);
                setStage(selectedPackage.stage);
              }}
            >
              <option value="">待核对完整体系、版本和阶段</option>
              {availablePackages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.system} {item.system_version} · {item.stage} ·{" "}
                  {item.package_version}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal leading-5 text-[#8a6c3a]">
              材料只写“v4”时，不能据此确定 BD+C
              NC；选包后仍须在下方记录原件依据。
            </span>
          </label>
          <label className="text-sm font-semibold">
            认证体系
            <input
              className={inputClass}
              value={system}
              onChange={(event) => setSystem(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            标准版本
            <input
              className={inputClass}
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            审核阶段
            <input
              className={inputClass}
              value={stage}
              onChange={(event) => setStage(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-semibold">
            审核范围
            <input
              className={inputClass}
              value="LT · Green Vehicles"
              readOnly
            />
          </label>
          <label className="text-sm font-semibold">
            A／B 申报路径
            <select
              className={inputClass}
              value={incentive}
              onChange={(event) => setIncentive(event.target.value)}
              required
            >
              <option value="">待核对</option>
              <option value="A">A · 优先停车</option>
              <option value="B">B · 停车折扣</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            C／D 申报路径
            <select
              className={inputClass}
              value={facility}
              onChange={(event) => setFacility(event.target.value)}
              required
            >
              <option value="">待核对</option>
              <option value="C">C · EVSE</option>
              <option value="D">D · 替代燃料／换电</option>
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-semibold">
              本轮参与审核的材料版本
            </legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {materialVersions.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-[#dfece4] px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    disabled={item.isReference}
                    onChange={(event) =>
                      setSelected((old) =>
                        event.target.checked
                          ? [...old, item.id]
                          : old.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {item.fileName} · 第 {item.version} 版
                  {item.isReference ? " · 规则参考文件（不作项目证据）" : ""}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm font-semibold sm:col-span-2">
            确认依据（选填）
            <textarea
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="例如：绿色车辆材料第 2 页勾选 A＋C，自动识别遗漏"
            />
          </label>
          {message && (
            <output className="text-sm text-[#a45537] sm:col-span-2">
              {message}
            </output>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              selected.length === 0 ||
              !system ||
              !version ||
              !stage ||
              !incentive ||
              !facility
            }
            className="rounded-full bg-[#0b8555] px-5 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2"
          >
            {busy
              ? "正在确认…"
              : confirmedAt
                ? "重新核对并确认"
                : "确认本轮版本、范围与路径"}
          </button>
        </form>
      )}
      {!canConfirm && (
        <p className="mt-5 rounded-xl bg-[#f5f8f6] p-4 text-sm text-[#738a7b]">
          当前轮次不可确认：仅当前审核员可在开放或退回的轮次完成此操作。
        </p>
      )}
      {canConfirm && !materialVersions.length && (
        <p className="mt-3 text-sm text-[#a77737]">
          请先在“本轮材料”上传至少一份文件，再返回此处确认。
        </p>
      )}
    </section>
  );
}
