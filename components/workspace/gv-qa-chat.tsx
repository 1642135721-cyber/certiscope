"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownElements = [
  "p",
  "strong",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "br",
  "del",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
];

type Citation = { id: string; clause: string; page: number; quote: string };
type Exchange = {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  insufficient: boolean;
};

export function GvQaChat({ compact = false }: { compact?: boolean }) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messagesRef = useRef<HTMLDivElement>(null);
  const messageCount = exchanges.length;

  useEffect(() => {
    if (messageCount === 0) return;
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messageCount]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rules/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: asked,
          history: exchanges
            .slice(-4)
            .map(({ question, answer }) => ({ question, answer })),
        }),
      });
      const data: unknown = await response.json();
      if (!data || typeof data !== "object") throw new Error("服务响应无效。");
      const value = data as Record<string, unknown>;
      if (!response.ok)
        throw new Error(String(value.error ?? "提问失败，请稍后重试。"));
      setExchanges((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          question: asked,
          answer: String(value.answer ?? ""),
          citations: Array.isArray(value.citations)
            ? (value.citations as Citation[])
            : [],
          insufficient: value.insufficient === true,
        },
      ]);
      setQuestion("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "提问失败，请稍后重试。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        compact ? "flex h-full min-h-0 flex-col" : "mx-auto max-w-4xl space-y-5"
      }
    >
      {!compact && (
        <header>
          <p className="text-sm font-semibold text-[#168358]">规则库 · GV</p>
          <h1 className="mt-1 text-3xl font-bold">规范问答助手</h1>
          <p className="mt-2 text-sm text-[#627b6d]">
            目前仅支持
            GV（绿色车辆）规范问答。回答依据官方规则原文，具体项目仍需审核员核对材料与适用版本。
          </p>
        </header>
      )}
      <div
        className={
          compact
            ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-3"
            : "flex h-[calc(100dvh-210px)] min-h-[380px] max-h-[820px] flex-col overflow-hidden rounded-2xl border border-[#d8e8dc] bg-white p-5 shadow-sm"
        }
      >
        <div
          ref={messagesRef}
          role="log"
          aria-live="polite"
          aria-label="规范问答记录"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-2"
        >
          {exchanges.length === 0 && (
            <p className="rounded-xl bg-[#f3f8f4] p-4 text-sm text-[#526d5d]">
              直接提问，例如“绿色车辆的资格具体是什么？”
            </p>
          )}
          {exchanges.map((item) => (
            <div
              key={item.id}
              className="space-y-3 border-b border-[#e6eee8] pb-5 last:border-0 last:pb-0"
            >
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl bg-[#e8f4ec] px-4 py-3 text-sm">
                {item.question}
              </p>
              <div className="rounded-2xl bg-[#f7faf7] p-4 text-sm leading-7">
                <div className="gv-qa-markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    allowedElements={markdownElements}
                    unwrapDisallowed
                  >
                    {item.answer}
                  </ReactMarkdown>
                </div>
                {item.citations.length > 0 && (
                  <div className="mt-3 border-t border-[#e2ece4] pt-3">
                    <p className="font-semibold">原文依据</p>
                    {item.citations.map((source) => (
                      <details key={source.id} className="mt-2">
                        <summary className="cursor-pointer text-[#087a50]">
                          {source.clause} · 第 {source.page} 页
                        </summary>
                        <p className="mt-1 rounded-lg bg-white p-3 text-xs leading-6 text-[#596f60]">
                          {source.quote}
                        </p>
                      </details>
                    ))}
                    <a
                      href="/rules/gv-source.pdf"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold text-[#087a50]"
                    >
                      打开官方规则原件 ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <form
          onSubmit={submit}
          className="shrink-0 space-y-3 border-t border-[#e6eee8] bg-white pt-4"
        >
          <label
            className="block text-sm font-semibold"
            htmlFor="gv-qa-question"
          >
            你的问题
          </label>
          <textarea
            id="gv-qa-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            rows={compact ? 2 : 3}
            placeholder="输入有关 GV 官方规范的问题…"
            className="w-full resize-none rounded-xl border border-[#cadfd0] px-3 py-2 text-sm"
          />
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="rounded-xl bg-[#087a50] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "正在查阅规范…" : "发送问题"}
          </button>
        </form>
      </div>
    </div>
  );
}
