import { NextResponse } from "next/server";
import { aiProvider } from "@/lib/ai/qwen";
import { retrieveGvQaChunks } from "@/lib/gv/knowledge/gv-guidance";
import { getCurrentActor } from "@/lib/supabase/auth";

export async function POST(request: Request) {
  try {
    await getCurrentActor();
  } catch {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "提问格式无效。" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "提问格式无效。" }, { status: 400 });
  const { question, history } = body as Record<string, unknown>;
  if (typeof question !== "string" || !question.trim() || question.length > 500)
    return NextResponse.json(
      { error: "请输入 1 至 500 字的问题。" },
      { status: 400 },
    );
  if (
    !Array.isArray(history) ||
    history.length > 4 ||
    !history.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.question === "string" &&
        item.question.length <= 500 &&
        typeof item.answer === "string" &&
        item.answer.length <= 2000,
    )
  )
    return NextResponse.json({ error: "对话记录格式无效。" }, { status: 400 });

  const chunks = retrieveGvQaChunks(question, history.at(-1)?.question ?? "");
  if (!chunks.length)
    return NextResponse.json({
      answer: "未检索到相关知识",
      insufficient: true,
      citations: [],
    });
  const result = await aiProvider.answerGvQuestion({
    question: question.trim(),
    history,
    chunks: chunks.map(({ id, clause, page, quote }) => ({
      id,
      clause,
      page,
      quote,
    })),
  });
  if (!result.ok)
    return NextResponse.json({ error: result.message }, { status: 503 });

  const cited = chunks.filter((chunk) =>
    result.value.chunkIds.includes(chunk.id),
  );
  const answer = result.value.answer.trim().slice(0, 2000);
  if (!answer || result.value.insufficient || !cited.length)
    return NextResponse.json({
      answer: "未检索到相关知识",
      insufficient: true,
      citations: [],
    });
  return NextResponse.json({
    answer,
    insufficient: false,
    citations: cited.map(({ id, clause, page, quote }) => ({
      id,
      clause,
      page,
      quote,
    })),
  });
}
