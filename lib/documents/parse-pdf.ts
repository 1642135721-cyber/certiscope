import "server-only";
import type { ParsedFragment, ParseResult } from "./types";

export async function parsePdf(
  bytes: Uint8Array,
  materialVersionId: string,
): Promise<ParseResult> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  const fragments: ParsedFragment[] = [];
  let scannedPages = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .filter((item): item is typeof item & { str: string } => "str" in item)
        .map((item) => item.str)
        .join(" ")
        .trim();
      if (!text) scannedPages++;
      fragments.push({
        text,
        source: {
          materialVersionId,
          page: pageNumber,
          note: text
            ? "逐页文字；空间位置需核对原件"
            : "扫描页或图纸页，自动文字定位不可用",
        },
        kind: text ? "page_text" : "image",
        status: text ? "extracted" : "needs_review",
      });
      page.cleanup();
    }
    return {
      extension: "pdf",
      status: scannedPages ? "needs_review" : "extracted",
      fragments,
      pageCount: pdf.numPages,
      manualReason: scannedPages
        ? `${scannedPages} 页未提取到可定位文字，需视觉识别或人工核对。`
        : undefined,
    };
  } finally {
    await loading.destroy();
  }
}
