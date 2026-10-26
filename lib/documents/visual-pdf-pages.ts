import "server-only";
import { PDFDocument } from "pdf-lib";

const maxDataUriBytes = 14 * 1024 * 1024;

export function relevantVisualPages(fileName: string, pageCount: number) {
  if (pageCount < 1) return [];
  if (/sign|标识|标牌/i.test(fileName)) return [pageCount];
  if (/floor|garage|parking|车库|停车|车位/i.test(fileName))
    return Array.from(
      { length: Math.min(2, pageCount) },
      (_, index) => index + 1,
    );
  if (/site|总平|场地/i.test(fileName)) return [1];
  return [...new Set([1, pageCount])];
}

export async function cropVisualPdf(bytes: Uint8Array, fileName: string) {
  const original = await PDFDocument.load(bytes);
  const originalPages = relevantVisualPages(fileName, original.getPageCount());
  if (!originalPages.length) throw new Error("PDF 没有可读取页面");
  const cropped = await PDFDocument.create();
  const pages = await cropped.copyPages(
    original,
    originalPages.map((page) => page - 1),
  );
  for (const page of pages) cropped.addPage(page);
  const output = await cropped.save();
  if (output.byteLength > maxDataUriBytes)
    throw new Error("裁出的 PDF 页仍超过视觉读取大小限制");
  return {
    originalPages,
    originalPageCount: original.getPageCount(),
    dataUrl: `data:application/pdf;base64,${Buffer.from(output).toString("base64")}`,
    bytes: output.byteLength,
  };
}
