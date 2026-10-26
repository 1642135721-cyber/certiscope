"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Opinion = {
  english_opinion: string;
  chinese_explanation: string;
  has_pending_items: boolean;
  submitted_at: string;
};
type Summary = {
  english_summary: string;
  chinese_summary: string;
  confirmed: boolean;
  created_at: string;
};
type Action = {
  action: string;
  reason: string;
  created_at: string;
  new_round_id: string | null;
};

export function AdminHandoff({
  taskId,
  roundId,
  roundStatus,
  opinion,
  summary,
  actions,
}: {
  taskId: string;
  roundId: string;
  roundStatus: string;
  opinion: Opinion | null;
  summary: Summary | null;
  actions: Action[];
}) {
  const router = useRouter();
  const [english, setEnglish] = useState(summary?.english_summary ?? "");
  const [chinese, setChinese] = useState(summary?.chinese_summary ?? "");
  const [confirmed, setConfirmed] = useState(summary?.confirmed ?? false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, ...body }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setMessage(result.message);
      if (result.ok) router.refresh();
    } catch {
      setMessage("操作失败，请检查连接后重试。");
    } finally {
      setBusy(false);
    }
  }
  const canManage = roundStatus === "submitted" && Boolean(opinion);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-[23px] font-bold">意见汇总与管理员处理</h2>
        <p className="mt-2 text-sm text-[#819388]">
          审核员提交专业意见后，由审核管理员核对、汇总，并决定退回、发起补件新轮或归档。
        </p>
        {opinion ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[#e2ece5] p-4">
              <h3 className="font-semibold">审核员英文意见</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                {opinion.english_opinion}
              </p>
            </div>
            <div className="rounded-xl border border-[#e2ece5] p-4">
              <h3 className="font-semibold">中文解释</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                {opinion.chinese_explanation}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-[#fff4e8] p-4 text-sm text-[#956733]">
            等待审核员提交本轮专业意见。
          </p>
        )}
        {opinion?.has_pending_items && (
          <p className="mt-4 rounded-xl bg-[#fff4e8] p-4 text-sm text-[#956733]">
            审核员意见含待跟进事项。本轮不可直接归档，可退回或开启补件新轮。
          </p>
        )}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">管理员汇总</h2>
          <p className="mt-2 text-sm text-[#819388]">
            保存后保留历史版本；确认汇总是归档的必要条件。
          </p>
          <label className="mt-5 block text-sm font-semibold">
            English summary
            <textarea
              className="mt-2 w-full rounded-xl border border-[#dce8df] p-3 leading-6"
              rows={5}
              value={english}
              onChange={(event) => setEnglish(event.target.value)}
              disabled={!canManage}
            />
          </label>
          <label className="mt-4 block text-sm font-semibold">
            中文说明
            <textarea
              className="mt-2 w-full rounded-xl border border-[#dce8df] p-3 leading-6"
              rows={4}
              value={chinese}
              onChange={(event) => setChinese(event.target.value)}
              disabled={!canManage}
            />
          </label>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={!canManage}
            />
            已核对并确认汇总
          </label>
          <button
            type="button"
            onClick={() =>
              send({ mode: "summary", english, chinese, confirmed })
            }
            disabled={!canManage || busy || !english.trim() || !chinese.trim()}
            className="mt-4 rounded-full bg-[#0b8255] px-6 py-2.5 font-semibold text-white disabled:opacity-45"
          >
            保存汇总
          </button>
          {summary && (
            <p className="mt-3 text-xs text-[#82948a]">
              最近保存：
              {new Date(summary.created_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}{" "}
              · {summary.confirmed ? "已确认" : "待确认"}
            </p>
          )}
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">轮次处理</h2>
          <p className="mt-2 text-sm text-[#819388]">
            退回供审核员修订判断；补件会创建新轮，已提交材料保持锁定。
          </p>
          <label className="mt-5 block text-sm font-semibold">
            处理依据
            <textarea
              className="mt-2 w-full rounded-xl border border-[#dce8df] p-3 leading-6"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={!canManage}
              placeholder="说明需修订或补充的具体事项。"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => send({ mode: "action", action: "return", reason })}
              disabled={!canManage || busy || !reason.trim()}
              className="rounded-full border border-[#92baa2] px-4 py-2 text-sm font-semibold text-[#0b7950] disabled:opacity-45"
            >
              退回复核
            </button>
            <button
              type="button"
              onClick={() =>
                send({ mode: "action", action: "supplement", reason })
              }
              disabled={!canManage || busy || !reason.trim()}
              className="rounded-full bg-[#0b8255] px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
            >
              开启补件新轮
            </button>
            <button
              type="button"
              onClick={() =>
                send({ mode: "action", action: "archive", reason })
              }
              disabled={
                !canManage ||
                busy ||
                !reason.trim() ||
                opinion?.has_pending_items ||
                !summary?.confirmed
              }
              className="rounded-full border border-[#92baa2] px-4 py-2 text-sm font-semibold text-[#0b7950] disabled:opacity-45"
            >
              归档任务
            </button>
          </div>
          <p className="mt-4 text-xs text-[#82948a]">
            归档要求：本轮汇总已确认，且专业意见没有待跟进事项。
          </p>
          {message && (
            <output className="mt-4 block text-sm text-[#9c6539]">
              {message}
            </output>
          )}
        </div>
      </section>
      {actions.length > 0 && (
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">处理记录</h2>
          <div className="mt-3 divide-y divide-[#edf2ee]">
            {actions.map((item, index) => (
              <div key={`${item.created_at}-${index}`} className="py-3 text-sm">
                <strong>
                  {item.action === "supplement"
                    ? "开启补件新轮"
                    : item.action === "return"
                      ? "退回复核"
                      : "归档"}
                </strong>
                <span className="ml-3 text-[#82948a]">
                  {new Date(item.created_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </span>
                <p className="mt-1 text-[#557162]">{item.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
