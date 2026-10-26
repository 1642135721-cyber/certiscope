import "server-only";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import type { ParsedFragment, ParseResult } from "./types";

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function parseDocx(
  bytes: Uint8Array,
  materialVersionId: string,
): Promise<ParseResult> {
  const converted = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  const fragments: ParsedFragment[] = [];
  let paragraph = 0;
  let table = 0;
  const blocks =
    converted.value.match(/<table\b[\s\S]*?<\/table>|<p\b[\s\S]*?<\/p>/gi) ??
    [];
  for (const block of blocks) {
    if (block.startsWith("<table")) {
      table++;
      const rows = block.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
      rows.forEach((row, rowIndex) => {
        const cells = row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? [];
        cells.forEach((cell, colIndex) => {
          fragments.push({
            text: plainText(cell),
            source: {
              materialVersionId,
              cell: `表${table}:R${rowIndex + 1}C${colIndex + 1}`,
              note: "DOCX 页码与浮动图形未可靠定位",
            },
            kind: "table_cell",
            status: "needs_review",
          });
        });
      });
    } else {
      const text = plainText(block);
      if (text)
        fragments.push({
          text,
          source: {
            materialVersionId,
            paragraph: ++paragraph,
            note: "DOCX 分段位置；页码未可靠定位",
          },
          kind: "paragraph",
          status: "needs_review",
        });
    }
  }
  return {
    extension: "docx",
    status: "needs_review",
    fragments,
    manualReason: converted.messages.length
      ? "部分 DOCX 结构未完整转换，须核对原件。"
      : "已提取段落和表格；分页、图形与空间关系须核对原件。",
  };
}

export async function parseDoc(
  bytes: Uint8Array,
  materialVersionId: string,
): Promise<ParseResult> {
  const document = await new WordExtractor().extract(Buffer.from(bytes));
  const fragments = document
    .getBody()
    .split(/\r?\n/)
    .map(
      (text, index): ParsedFragment => ({
        text: text.trim(),
        source: {
          materialVersionId,
          paragraph: index + 1,
          note: "旧 DOC 结构及分页不可靠",
        },
        kind: "paragraph",
        status: "needs_review",
      }),
    )
    .filter((item) => item.text);
  return {
    extension: "doc",
    status: "needs_review",
    fragments,
    manualReason:
      "旧 DOC 仅能初次提取文本；表格、图纸和分页请人工核对或受控转换。",
  };
}

export async function parseXlsx(
  bytes: Uint8Array,
  materialVersionId: string,
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const fragments: ParsedFragment[] = [];
  let needsReview = false;
  workbook.eachSheet((sheet) => {
    if (sheet.state !== "visible") needsReview = true;
    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const text = cell.text.trim();
        if (cell.formula && !cell.result) needsReview = true;
        if (!text) return;
        fragments.push({
          text,
          source: {
            materialVersionId,
            sheet: sheet.name,
            cell: cell.address,
            note: cell.formula ? "公式值须核对计算结果" : undefined,
          },
          kind: "table_cell",
          status: cell.formula && !cell.result ? "needs_review" : "extracted",
        });
      });
    });
  });
  return {
    extension: "xlsx",
    status: needsReview ? "needs_review" : "extracted",
    fragments,
    manualReason: needsReview
      ? "隐藏工作表或未计算公式需要人工核对。"
      : undefined,
  };
}
