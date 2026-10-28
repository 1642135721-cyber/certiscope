import type { SourceLocation } from "./types";

type NumberLabel = { value: number; x: number; y: number; height: number };

export type ParkingDrawingNumberRun = {
  first: 1;
  last: number;
  readCount: number;
  missing: number[];
  source: SourceLocation;
};

function regularTail(labels: Map<number, NumberLabel[]>, end: number) {
  const points = Array.from(
    { length: 5 },
    (_, index) => labels.get(end - 4 + index)?.[0],
  );
  if (points.some((point) => !point)) return false;
  const found = points as NumberLabel[];
  const dx = found[4].x - found[0].x;
  const dy = found[4].y - found[0].y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const axis = found.map((point) => (horizontal ? point.x : point.y));
  const cross = found.map((point) => (horizontal ? point.y : point.x));
  const steps = axis.slice(1).map((value, index) => value - axis[index]);
  const average = steps.reduce((sum, value) => sum + value, 0) / steps.length;
  const fontHeight = found.reduce((sum, point) => sum + point.height, 0) / 5;
  return (
    Math.abs(average) > fontHeight &&
    steps.every(
      (step) =>
        Math.sign(step) === Math.sign(average) &&
        Math.abs(step - average) <= Math.abs(average) * 0.45,
    ) &&
    Math.max(...cross) - Math.min(...cross) <= fontHeight * 5
  );
}

/** A near-complete, spatially ordered drawing index is a clue, not a confirmed count. */
export function detectParkingDrawingNumberRun(
  labels: NumberLabel[],
  source: SourceLocation,
): ParkingDrawingNumberRun | null {
  const byNumber = new Map<number, NumberLabel[]>();
  for (const label of labels) {
    if (
      !Number.isInteger(label.value) ||
      label.value < 1 ||
      label.value > 400 ||
      !Number.isFinite(label.x) ||
      !Number.isFinite(label.y) ||
      label.height < 2 ||
      label.height > 12
    )
      continue;
    const choices = byNumber.get(label.value) ?? [];
    choices.push(label);
    byNumber.set(label.value, choices);
  }
  if (!regularTail(byNumber, 5)) return null;
  for (let end = 400; end >= 60; end--) {
    if (!regularTail(byNumber, end)) continue;
    const missing = Array.from({ length: end }, (_, index) => index + 1).filter(
      (number) => !byNumber.has(number),
    );
    if (missing.length > 2 || missing.length / end > 0.02) continue;
    return {
      first: 1,
      last: end,
      readCount: end - missing.length,
      missing,
      source,
    };
  }
  return null;
}

export async function readParkingDrawingNumbers(
  bytes: Uint8Array,
  materialVersionId: string,
): Promise<ParkingDrawingNumberRun[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  const runs: ParkingDrawingNumberRun[] = [];
  try {
    for (
      let pageNumber = 1;
      pageNumber <= Math.min(pdf.numPages, 5);
      pageNumber++
    ) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .filter((item): item is typeof item & { str: string } => "str" in item)
        .map((item) => item.str)
        .join(" ")
        .toLowerCase();
      if (!/parking|车位|停车/.test(text)) {
        page.cleanup();
        continue;
      }
      const labels: NumberLabel[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const value = item.str.trim();
        if (!/^\d{1,3}$/.test(value)) continue;
        labels.push({
          value: Number(value),
          x: item.transform[4],
          y: item.transform[5],
          height: item.height,
        });
      }
      const source: SourceLocation = {
        materialVersionId,
        page: pageNumber,
        note: "图纸文字坐标核对车位编号；漏号须查看原图，统计范围须人工确认",
      };
      const run = detectParkingDrawingNumberRun(labels, source);
      if (run) runs.push(run);
      page.cleanup();
    }
    return runs;
  } finally {
    await loading.destroy();
  }
}
