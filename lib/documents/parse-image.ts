import "server-only";
import type { LocatedContent } from "@/lib/ai/provider";
import type { ParseResult, SupportedExtension } from "./types";

export function parseImage(
  extension: Extract<SupportedExtension, "jpg" | "jpeg" | "png">,
  materialVersionId: string,
): ParseResult {
  return {
    extension,
    status: "needs_review",
    fragments: [
      {
        text: "",
        source: {
          materialVersionId,
          image: 1,
          region: [0, 0, 1, 1],
          note: "全图区域；文字、位号及空间关系待视觉识别或人工核对",
        },
        kind: "image",
        status: "needs_review",
      },
    ],
    manualReason:
      "图像已接收，视觉候选须与原件区域核对；文字数量不代表独立空间核数。",
  };
}

export function imageVisionContent(
  bytes: Uint8Array,
  extension: "jpg" | "jpeg" | "png",
  materialVersionId: string,
): LocatedContent {
  const mime = extension === "png" ? "image/png" : "image/jpeg";
  return {
    imageDataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
    source: { materialVersionId, image: 1, region: [0, 0, 1, 1] },
  };
}
