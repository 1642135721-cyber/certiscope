import type { SourceLocation } from "@/lib/gv/types";

export type SupportedExtension =
  | "pdf"
  | "doc"
  | "docx"
  | "xlsx"
  | "jpg"
  | "jpeg"
  | "png";
export type ParseStatus = "extracted" | "needs_review" | "failed";

export interface ParsedFragment {
  text: string;
  source: SourceLocation;
  kind: "paragraph" | "table_cell" | "image" | "page_text";
  status: ParseStatus;
}

export interface ParseResult {
  extension: SupportedExtension;
  status: ParseStatus;
  fragments: ParsedFragment[];
  manualReason?: string;
  pageCount?: number;
}
