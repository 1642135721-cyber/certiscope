import "server-only";
import { parseImage } from "./parse-image";
import { parseDoc, parseDocx, parseXlsx } from "./parse-office";
import { parsePdf } from "./parse-pdf";
import type { ParseResult, SupportedExtension } from "./types";

const supported = new Set<SupportedExtension>([
  "pdf",
  "doc",
  "docx",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
]);

export function documentExtension(fileName: string): SupportedExtension | null {
  const extension = fileName.split(".").at(-1)?.toLowerCase() as
    | SupportedExtension
    | undefined;
  return extension && supported.has(extension) ? extension : null;
}

function hasSignature(
  bytes: Uint8Array,
  extension: SupportedExtension,
): boolean {
  if (extension === "pdf")
    return Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  if (extension === "png")
    return Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  if (extension === "jpg" || extension === "jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (extension === "doc")
    return Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]),
    );
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function parseDocument(
  fileName: string,
  bytes: Uint8Array,
  materialVersionId: string,
): Promise<ParseResult> {
  const extension = documentExtension(fileName);
  if (!extension)
    throw new Error(
      /\.(dwg|dxf)$/i.test(fileName)
        ? "DWG／DXF 请先导出为 PDF 或图片并登记转换来源。"
        : "当前文件格式不在直接接收范围内，请受控转换或人工接续。",
    );
  if (!hasSignature(bytes, extension))
    return {
      extension,
      status: "failed",
      fragments: [],
      manualReason: "文件内容与扩展名不符或文件损坏，请核对原件。",
    };
  try {
    switch (extension) {
      case "pdf":
        return await parsePdf(bytes, materialVersionId);
      case "doc":
        return await parseDoc(bytes, materialVersionId);
      case "docx":
        return await parseDocx(bytes, materialVersionId);
      case "xlsx":
        return await parseXlsx(bytes, materialVersionId);
      case "jpg":
      case "jpeg":
      case "png":
        return parseImage(extension, materialVersionId);
    }
  } catch {
    return {
      extension,
      status: "failed",
      fragments: [],
      manualReason: "自动解析失败，请核对文件并转人工处理。",
    };
  }
}
