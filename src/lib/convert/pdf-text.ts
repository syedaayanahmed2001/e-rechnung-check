/**
 * Browser-side PDF reading for Convert: the text layer via pdf.js, or (for scans) the first page
 * rendered to PNG for the vision model. Runs in the browser; only the text or the image of the
 * first page is sent to /api/extract.
 */
"use client";

type PdfJs = typeof import("pdfjs-dist");

let pdfjs: Promise<PdfJs> | undefined;

function load(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return pdfjs;
}

/** Page text with line breaks where pdf.js reports end-of-line. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const lib = await load();
  const task = lib.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let page = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      page += item.str + (item.hasEOL ? "\n" : "");
    }
    pages.push(page.trim());
  }
  await task.destroy();
  return pages.join("\n\n");
}

/** First page as PNG (base64, no data: prefix), for scanned PDFs. */
export async function pdfFirstPagePng(bytes: Uint8Array, scale = 2): Promise<string> {
  const lib = await load();
  const task = lib.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/png");
  await task.destroy();
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
