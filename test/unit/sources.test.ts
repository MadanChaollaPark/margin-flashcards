import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { encodeBase64, readImage } from "../../src/sources/image";
import { extractPage } from "../../src/sources/page";
import { extractPdfText } from "../../src/sources/pdf";
import { textFragmentUrl } from "../../src/sources/selection";
import { parseCaptions, youtubeVideoUrl } from "../../src/sources/youtube";

const fixture = (path: string) => new URL(`../fixtures/${path}`, import.meta.url);

test("page extraction prefers the main article and removes page chrome", async () => {
  const dom = new JSDOM(await readFile(fixture("article.html"), "utf8"));
  try {
    const text = extractPage(dom.window.document);
    assert.match(text, /Plant metabolism\nPhotosynthesis is/u);
    assert.match(text, /Stomata are pores/u);
    assert.doesNotMatch(text, /menu text|copyright|excluded|site-wide|newsletter/iu);
  } finally {
    dom.window.close();
  }
});

test("selection highlights preserve the existing anchor and escape fragment syntax", () => {
  assert.equal(textFragmentUrl("https://example.test/page#target:~:text=old", "  ice-age, plant 🌱 "),
    "https://example.test/page#target:~:text=ice%2Dage%2C%20plant%20%F0%9F%8C%B1");
  assert.match(textFragmentUrl("https://example.test/page", "The quick brown fox jumps ".repeat(9) + "above the snowy little hill"),
    /text=The%20quick%20brown%20fox%20jumps,above%20the%20snowy%20little%20hill/u);
});

test("parses YouTube timedtext XML and JSON3 and skips duplicate lines", async () => {
  const dom = new JSDOM();
  try {
    const parser = new dom.window.DOMParser();
    const expected = "Plants & algae use light.\nEnergy is stored as sugar.";
    assert.equal(parseCaptions(await readFile(fixture("captions.xml"), "utf8"), parser), expected);
    assert.equal(parseCaptions(JSON.stringify({ events: [
      { segs: [{ utf8: "Plants & " }, { utf8: "algae use light." }] },
      {},
      { segs: [{ utf8: "Energy is stored\nas sugar." }] },
    ] }), parser), expected);
    assert.equal(parseCaptions("<broken>", parser), "");
  } finally {
    dom.window.close();
  }
  assert.equal(youtubeVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=17"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(youtubeVideoUrl("https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), undefined);
});

test("PDF.js extracts local text and detects a page with no text", async () => {
  const bytes = new Uint8Array(await readFile(fixture("text.pdf")));
  assert.match(await extractPdfText(bytes), /Chlorophyll absorbs light energy for photosynthesis/u);
  assert.equal(await extractPdfText(new Uint8Array(await readFile(fixture("scan.pdf")))), "");
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 8)), "%PDF-1.4");
});

test("image conversion encodes binary data across chunk boundaries", async () => {
  const bytes = Uint8Array.from({ length: 9500 }, (_, index) => index % 256);
  const base64 = Buffer.from(bytes).toString("base64");
  assert.equal(encodeBase64(bytes), base64);
  assert.deepEqual(await readImage(new Blob([bytes], { type: "image/png" })), {
    kind: "image", mimeType: "image/png", data: base64,
  });
  await assert.rejects(readImage(new Blob(["notes"], { type: "text/plain" })), /choose an image/iu);
});
