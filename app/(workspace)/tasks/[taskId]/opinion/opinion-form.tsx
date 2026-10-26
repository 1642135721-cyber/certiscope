"use client";

import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = {
  code: string;
  title: string;
  factCheck: string | null;
  decision: string | null;
};
type Opinion = {
  id: string;
  english_opinion: string;
  chinese_explanation: string;
  has_pending_items: boolean;
  submitted_at: string;
};
type HistoricalOpinion = {
  source_project: string;
  source_task_id: string;
  source_round_id: string;
  submitted_at: string;
  english_opinion: string;
  chinese_explanation: string;
  rule_version_id: string;
};
const labels: Record<string, string> = {
  pass: "支持符合",
  fail: "不符合要求",
  supplement: "需要补件",
  defer: "暂缓判断",
  not_applicable: "本项不适用",
};

export function OpinionForm({
  taskId,
  roundId,
  scopeConfirmed,
  canSubmit,
  projectName,
  rows,
  submitted,
  history,
}: {
  taskId: string;
  roundId: string;
  scopeConfirmed: boolean;
  canSubmit: boolean;
  projectName: string;
  rows: Row[];
  submitted: Opinion | null;
  history: HistoricalOpinion[];
}) {
  const router = useRouter();
  const [english, setEnglish] = useState("");
  const [chinese, setChinese] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<string[]>(
    history.map((item) => item.source_round_id),
  );
  const missing = rows.filter((row) => !row.decision);
  const pending = rows.filter(
    (row) =>
      row.decision === "supplement" ||
      row.decision === "defer" ||
      (row.factCheck && row.factCheck !== "confirmed"),
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/opinion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundId, english, chinese }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
      };
      setMessage(result.message);
      if (result.ok) router.refresh();
    } catch {
      setMessage("提交失败，请检查连接后重试。");
    } finally {
      setBusy(false);
    }
  }
  async function draft() {
    setDrafting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/opinion/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceRoundIds: selectedHistory }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message: string;
        data?: { englishDraft: string; chineseExplanation: string };
      };
      setMessage(result.message);
      if (result.ok && result.data) {
        setEnglish(result.data.englishDraft);
        setChinese(result.data.chineseExplanation);
      }
    } catch {
      setMessage("草稿生成失败，请人工填写意见。");
    } finally {
      setDrafting(false);
    }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,.8fr)]">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-[23px] font-bold">GV 专业意见</h2>
        <p className="mt-2 text-sm text-[#819388]">
          项目：{projectName}
          。意见由审核员基于原件和逐条判断填写；提交后本轮材料锁定。
        </p>
        {submitted ? (
          <div className="mt-6 space-y-5">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#e5f6ec] px-4 py-2 text-sm font-semibold text-[#16794f]">
              <CheckCircle2 size={17} /> 已提交 ·{" "}
              {new Date(submitted.submitted_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </p>
            {submitted.has_pending_items && (
              <p className="rounded-xl bg-[#fff3e8] p-4 text-sm text-[#a6783a]">
                本轮仍有待核事项，汇总与归档时必须保留该状态。
              </p>
            )}
            <div>
              <h3 className="font-bold">English review opinion</h3>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-[#e0ebe3] p-4 text-sm leading-7">
                {submitted.english_opinion}
              </p>
            </div>
            <div>
              <h3 className="font-bold">中文解释</h3>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-[#e0ebe3] p-4 text-sm leading-7">
                {submitted.chinese_explanation}
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f1faf5] p-4">
              <p className="text-sm text-[#60796a]">
                可先生成可编辑草稿；所有结论仍需审核员核对原件和判断记录。
              </p>
              <button
                type="button"
                onClick={draft}
                disabled={!canSubmit || missing.length > 0 || drafting}
                className="rounded-full border border-[#299464] px-4 py-2 text-sm font-semibold text-[#0b7950] disabled:opacity-45"
              >
                {drafting ? "生成中…" : "生成意见草稿"}
              </button>
            </div>
            <label className="block font-semibold">
              English review opinion
              <textarea
                className="mt-2 w-full rounded-xl border border-[#dce8df] p-4 text-sm leading-7 outline-[#278e5c]"
                rows={7}
                value={english}
                onChange={(event) => setEnglish(event.target.value)}
                placeholder="Describe the verified facts, applicable requirements, decision, and any remaining evidence gaps."
                required
                disabled={!canSubmit}
              />
            </label>
            <label className="block font-semibold">
              中文解释
              <textarea
                className="mt-2 w-full rounded-xl border border-[#dce8df] p-4 text-sm leading-7 outline-[#278e5c]"
                rows={5}
                value={chinese}
                onChange={(event) => setChinese(event.target.value)}
                placeholder="说明专业判断、证据出处及待核或补件事项。"
                required
                disabled={!canSubmit}
              />
            </label>
            {message && (
              <output className="block text-sm text-[#9c6539]">
                {message}
              </output>
            )}
            <button
              type="submit"
              disabled={
                !canSubmit || !scopeConfirmed || missing.length > 0 || busy
              }
              className="rounded-full bg-[#0b8255] px-7 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "提交中…" : "提交本轮专业意见"}
            </button>
            <p className="text-xs text-[#83948a]">
              {missing.length
                ? `还有 ${missing.length} 条适用规则未保存判断。`
                : pending.length
                  ? `有 ${pending.length} 条待核事项，提交时作为待核意见保留。`
                  : "全部适用规则已有人工判断。"}
            </p>
          </form>
        )}
      </section>
      <aside className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold">适用规则汇总</h2>
        <p className="mt-2 text-sm text-[#829489]">
          {rows.length - missing.length}/{rows.length} 条已保存判断
        </p>
        <div className="mt-4 divide-y divide-[#edf2ee]">
          {rows.map((row) => (
            <div
              key={row.code}
              className="flex items-center gap-3 py-3 text-sm"
            >
              <span className="font-semibold text-[#0b8255]">{row.code}</span>
              <span className="flex-1">{row.title}</span>
              <span
                className={row.decision ? "text-[#347857]" : "text-[#b27b39]"}
              >
                {row.decision === "defer" && row.factCheck === "conflict"
                  ? "证据冲突，需澄清"
                  : row.decision
                    ? labels[row.decision]
                    : "待核"}
              </span>
            </div>
          ))}
        </div>
        {!scopeConfirmed && (
          <p className="mt-4 flex gap-2 rounded-xl bg-[#fff3e8] p-3 text-sm text-[#9d6c30]">
            <CircleAlert size={17} /> 请先确认本轮范围。
          </p>
        )}
        <Link
          href={`/tasks/${taskId}/review`}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#0b8255]"
        >
          返回审核与复核 <ArrowRight size={16} />
        </Link>
        <div className="mt-6 border-t pt-4">
          <h3 className="font-bold">已核验历史意见</h3>
          <p className="mt-1 text-xs leading-5 text-[#829489]">
            仅参考同信用项、相同得分路径及规则版本且已归档的意见。选择后可用于本轮草稿，历史项目事实不会直接作为本轮结论。
          </p>
          {history.length ? (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {history.map((item) => (
                <label
                  key={item.source_round_id}
                  className="block rounded-xl border border-[#e1eee5] p-3 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedHistory.includes(item.source_round_id)}
                      onChange={() =>
                        setSelectedHistory((current) =>
                          current.includes(item.source_round_id)
                            ? current.filter(
                                (id) => id !== item.source_round_id,
                              )
                            : [...current, item.source_round_id],
                        )
                      }
                    />
                    <strong>{item.source_project}</strong>
                  </span>
                  <span className="mt-1 block text-[#849588]">
                    {new Date(item.submitted_at).toLocaleDateString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}{" "}
                    · 任务 {item.source_task_id.slice(0, 8)} · 规则版本{" "}
                    {item.rule_version_id.slice(0, 8)}
                  </span>
                  <span className="mt-2 line-clamp-3 block text-[#496957]">
                    {item.chinese_explanation}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-[#f5faf7] p-3 text-xs text-[#829489]">
              暂无符合当前路径和规则版本的已归档意见，草稿仍可根据本轮判断生成。
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
