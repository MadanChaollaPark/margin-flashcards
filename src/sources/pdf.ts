import type { ContentInput } from "../ai/provider";
import { assertInlineMediaSize, encodeBase64 } from "./image";

export async function extractPdfText(bytes: Uint8Array, assetUrl?: (path: string) => string): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (assetUrl) GlobalWorkerOptions.workerSrc = assetUrl("pdf.worker.min.mjs");
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: !assetUrl,
    ...(assetUrl && {
      cMapUrl: assetUrl("cmaps/"),
      cMapPacked: true,
      standardFontDataUrl: assetUrl("standard_fonts/"),
    }),
  });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const { items } = await page.getTextContent();
      pages.push(items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim());
      page.cleanup();
    }
    return pages.filter(Boolean).join("\n\n");
  } finally {
    await task.destroy();
  }
}

export async function pdfInput(url: string): Promise<ContentInput> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Could not download the PDF (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")) {
    throw new Error("This tab did not return a PDF. Open the PDF directly, then try again.");
  }
  const text = await extractPdfText(bytes, (path) => chrome.runtime.getURL(path)).catch(() => "");
  if ((text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 40) return { kind: "text", text };
  assertInlineMediaSize(bytes.byteLength,
    "This PDF has no extractable text and is too large to send for cloud OCR (max 14 MB). Select or paste the text instead.");
  return { kind: "pdf", mimeType: "application/pdf", data: encodeBase64(bytes), text };
}
