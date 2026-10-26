import { readFile, writeFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const bytes = await readFile("public/rules/gv-source.pdf");
const loading = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: true });
try {
  const pdf = await loading.promise;
  const pages = {};
  for (const pageNumber of [1, 2, 5, 8, 9, 10, 11]) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages[pageNumber] = content.items.filter((item) => "str" in item)
      .map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    page.cleanup();
  }
  await writeFile("lib/gv/gv-source-pages.json", `${JSON.stringify(pages, null, 2)}\n`);
  console.log(`Extracted ${Object.keys(pages).length} pages from GV official rule PDF.`);
} finally {
  await loading.destroy();
}
