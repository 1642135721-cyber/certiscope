import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import { selectProjectCoverSource } from "@/lib/gv/project-cover";
import { AuthorizationError, getCurrentActor } from "@/lib/supabase/auth";

async function renderPdfCover(bytes: Uint8Array): Promise<Buffer> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const projectRequire = createRequire(`${process.cwd()}/package.json`);
  const pdfRequire = createRequire(
    projectRequire.resolve("pdfjs-dist/package.json"),
  );
  const { createCanvas } = pdfRequire("@napi-rs/canvas") as {
    createCanvas: (
      width: number,
      height: number,
    ) => {
      getContext: (type: "2d") => CanvasRenderingContext2D;
      toBuffer: (format: "image/png") => Buffer;
    };
  };
  const loading = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: true,
  });
  try {
    const pdf = await loading.promise;
    const page = await pdf.getPage(1);
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(1, 520 / original.width),
    });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    await page.render({
      canvasContext: canvas.getContext("2d"),
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
    }).promise;
    page.cleanup();
    return canvas.toBuffer("image/png");
  } finally {
    await loading.destroy();
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { supabase, actor } = await getCurrentActor();
    if (actor.role === "rule_maintainer")
      return new Response(null, { status: 403 });
    const { data: sources, error } = await supabase
      .from("project_source_files")
      .select("file_name, storage_path")
      .eq("project_id", projectId)
      .is("removed_at", null);
    if (error) throw error;
    const source = selectProjectCoverSource(sources ?? []);
    if (!source) return new Response(null, { status: 404 });
    const { data, error: downloadError } = await supabase.storage
      .from("gv-intake")
      .download(source.storage_path);
    if (downloadError || !data) return new Response(null, { status: 404 });
    const bytes = new Uint8Array(await data.arrayBuffer());
    const isPdf = source.file_name.toLowerCase().endsWith(".pdf");
    const body = isPdf ? await renderPdfCover(bytes) : Buffer.from(bytes);
    const contentType =
      isPdf || source.file_name.toLowerCase().endsWith(".png")
        ? "image/png"
        : "image/jpeg";
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return new Response(null, { status: error.status });
    return NextResponse.json(
      { error: "项目图片暂时无法读取" },
      { status: 500 },
    );
  }
}
