import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { captureSource } from "../../src/sources/capture";
import { encodeBase64, MAX_INLINE_MEDIA_BYTES, readImage, sniffImageType } from "../../src/sources/image";
import { extractPage } from "../../src/sources/page";
import { extractPdfText, pdfInput } from "../../src/sources/pdf";
import { textFragmentUrl } from "../../src/sources/selection";
import { parseCaptions, readCaptionTracks, youtubeVideoUrl } from "../../src/sources/youtube";

const fixture = (path: string) => new URL(`../fixtures/${path}`, import.meta.url);
const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const clickedImageUrl = "https://cdn.example.test/a.png";
const screenshot = { kind: "image", mimeType: "image/png", data: "U0NSRUVO" };

function stubPdfFetch(t: TestContext, bytes: Uint8Array<ArrayBuffer>): void {
  t.mock.method(globalThis, "fetch", async () => new Response(bytes));
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  t.after(() => {
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  });
  const pdfjsPackage = import.meta.resolve("pdfjs-dist/package.json");
  globalThis.chrome = {
    runtime: {
      getURL: (path: string) => path === "pdf.worker.min.mjs"
        ? import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
        : fileURLToPath(new URL(path, pdfjsPackage)),
    },
  } as typeof chrome;
}

function stubImageCapture(t: TestContext, fetchImage: typeof fetch, grantAccess = false) {
  const mockFetch = t.mock.method(globalThis, "fetch", fetchImage);
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  t.after(() => {
    if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
    else Reflect.deleteProperty(globalThis, "chrome");
  });
  const tab = { id: 1, windowId: 2, url: "https://example.test/article", title: "Article" };
  const captureVisibleTab = t.mock.fn(async () => `data:image/png;base64,${screenshot.data}`);
  const contains = t.mock.fn(async (_permission: chrome.permissions.Permissions) => false);
  const requestAccess = t.mock.fn(async (_origin: string, _purpose: string) => grantAccess);
  globalThis.chrome = {
    tabs: { get: async () => tab, query: async () => [tab], captureVisibleTab },
    permissions: { contains },
  } as unknown as typeof chrome;
  const capture = (imageUrl?: string) => captureSource({ kind: "image", tabId: 1, imageUrl }, "deck", "", undefined, requestAccess);
  return { capture, captureVisibleTab, contains, mockFetch, requestAccess };
}

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

test("page extraction separates table cells, definition lists and captions", () => {
  const dom = new JSDOM([
    "<main><h1>Capitals</h1><table><tr><th>City</th><!-- column --><th>Country</th></tr>",
    "<tr><td>Paris</td><td>France</td></tr></table>",
    "<dl><dt>Mitosis</dt><dd>Cell division</dd></dl>",
    '<figure><img alt="x"><figcaption>Figure 1</figcaption></figure><p>Text</p></main>',
  ].join(""));
  try {
    assert.equal(extractPage(dom.window.document),
      "Capitals\nCity | Country\nParis | France\nMitosis\nCell division\nFigure 1\nText");
  } finally {
    dom.window.close();
  }
});

test("page extraction keeps content inside a page-wide wrapper form but drops its controls", () => {
  const dom = new JSDOM(`
    <form id="aspnetForm">
      <div><h1>Lecture</h1><p>Osmosis is diffusion of water across a membrane.</p></div>
      <select><option>Choose term</option><option>Spring 2026</option></select>
      <textarea>draft</textarea><button>Submit</button>
    </form>
  `);
  try {
    assert.equal(extractPage(dom.window.document), "Lecture\nOsmosis is diffusion of water across a membrane.");
  } finally {
    dom.window.close();
  }
});

test("page extraction still removes small search, newsletter and comment forms", () => {
  const dom = new JSDOM(`
    <form role="search"><label>Search the site<input></label></form>
    <main><article>
      <p>Water moves across a semipermeable membrane by osmosis.</p>
      <form><label>Leave a comment<textarea></textarea></label></form>
      <p>Solute concentration affects the direction of water movement.</p>
    </article></main>
    <form><label>Sign up for the newsletter<input type="email"></label></form>
  `);
  try {
    assert.equal(extractPage(dom.window.document), [
      "Water moves across a semipermeable membrane by osmosis.",
      "Solute concentration affects the direction of water movement.",
    ].join("\n"));
  } finally {
    dom.window.close();
  }
});

test("page extraction uses a fixed half-page threshold and keeps forms containing main content", () => {
  const cases = [
    ["<form><p>Lecture</p></form><p>Summary</p><select><option>Choose term</option></select>", "Lecture\nSummary"],
    ["<form>x</form><form><p>Lecture</p></form><p>Summary</p>", "Summary"],
    ['<form><div role="main">Lecture</div></form><p>More text outside the wrapper form.</p>', "Lecture"],
    ["<form><textarea>draft</textarea></form>", ""],
  ];
  for (const [html, expected] of cases) {
    const dom = new JSDOM(html);
    try {
      assert.equal(extractPage(dom.window.document), expected);
    } finally {
      dom.window.close();
    }
  }
});

test("selection highlights preserve the existing anchor and escape fragment syntax", () => {
  assert.equal(textFragmentUrl("https://example.test/page#target:~:text=old", "  ice-age, plant 🌱 "),
    "https://example.test/page#target:~:text=ice%2Dage%2C%20plant%20%F0%9F%8C%B1");
  assert.match(textFragmentUrl("https://example.test/page", "The quick brown fox jumps ".repeat(9) + "above the snowy little hill"),
    /text=The%20quick%20brown%20fox%20jumps,above%20the%20snowy%20little%20hill/u);
});

test("long selections without spaces or with long words get a non-overlapping text range when possible", () => {
  const url = "https://example.test/page#target:~:text=old";
  const fragmentTerms = (fragmentUrl: string) => fragmentUrl.split(":~:text=")[1].split(",").map(decodeURIComponent);
  const japanese = "光合成は光エネルギーを化学エネルギーに変換する過程である。".repeat(8);
  const japaneseUrl = textFragmentUrl(url, japanese);
  assert.ok(japaneseUrl.startsWith("https://example.test/page#target:~:text="));
  assert.ok(japaneseUrl.length < 500);

  const terms = fragmentTerms(japaneseUrl);
  assert.equal(terms.length, 2);
  const [start, end] = terms;
  assert.ok(start && japanese.startsWith(start));
  assert.ok(end && japanese.endsWith(end));
  assert.ok(start.length + end.length < japanese.length);
  const segments = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(japanese)];
  assert.ok(segments.some(({ index, segment, isWordLike }) => isWordLike && index + segment.length === start.length));
  assert.ok(segments.some(({ index, isWordLike }) => isWordLike && index === japanese.length - end.length));

  const words = ["a", "b", "c", "d", "e", "f"].map((letter) => letter.repeat(45));
  assert.deepEqual(fragmentTerms(textFragmentUrl(url, words.join(" "))), [words[0], words[5]]);

  const token = "a".repeat(250);
  assert.deepEqual(fragmentTerms(textFragmentUrl(url, token)), [token]);
  const punctuation = "!".repeat(250);
  assert.deepEqual(fragmentTerms(textFragmentUrl(url, punctuation)), [punctuation]);
});

test("parses YouTube timedtext XML and JSON3 and skips duplicate lines", async () => {
  const dom = new JSDOM();
  try {
    const parser = new dom.window.DOMParser();
    const expected = "Plants & algae use light.\nEnergy is stored as sugar.\nChlorophyll is a pigment that captures light.";
    assert.equal(parseCaptions(await readFile(fixture("captions.xml"), "utf8"), parser), expected);
    assert.equal(parseCaptions(JSON.stringify({ events: [
      { segs: [{ utf8: "Plants & " }, { utf8: "algae use light." }] },
      {},
      { segs: [{ utf8: "Energy is stored\nas sugar." }] },
      { segs: [{ utf8: "Chlorophyll is a pigment that captures light." }] },
    ] }), parser), expected);
    assert.equal(parseCaptions("<broken>", parser), "");
  } finally {
    dom.window.close();
  }
  assert.equal(youtubeVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=17"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(youtubeVideoUrl("https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), undefined);
});

test("decodes YouTube XML captions to plain text before deduplication", () => {
  const dom = new JSDOM();
  try {
    const parser = new dom.window.DOMParser();
    assert.equal(parseCaptions(`
      <transcript>
        <text start="0" dur="1">I&amp;#39;m sure it&amp;#39;s &amp;quot;fine&amp;quot; &amp;amp; ready</text>
        <text start="1" dur="1">&lt;font color=&quot;#E5E5E5&quot;&gt;Energy&lt;/font&gt; is stored</text>
        <text start="2" dur="1">&lt;font color=&quot;#fff&quot;&gt;&lt;/font&gt;</text>
        <text start="3" dur="1">it&#39;s</text>
        <text start="4" dur="1">it&amp;#39;s</text>
      </transcript>
    `, parser), `I'm sure it's "fine" & ready\nEnergy is stored\nit's`);
    assert.equal(parseCaptions(`
      <timedtext><body><p t="0" d="1">I&amp;#39;m <s>here</s></p></body></timedtext>
    `, parser), "I'm here");
    assert.equal(parseCaptions(JSON.stringify({ events: [
      { segs: [{ utf8: "&lt;b&gt;" }] },
    ] }), parser), "&lt;b&gt;");
  } finally {
    dom.window.close();
  }
});

test("YouTube capture reads MAIN-world caption tracks and keeps the video link", async (t) => {
  const url = "https://www.youtube.com/watch?v=margin-demo";
  const captionUrl = "https://www.youtube.com/api/timedtext?v=margin-demo&lang=en";
  const dom = new JSDOM("<title>Light and plants</title>", { runScripts: "outside-only", url });
  const captions = await readFile(fixture("captions.xml"), "utf8");
  const savedGlobals = ["chrome", "DOMParser"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  t.after(() => {
    dom.window.close();
    for (const [key, descriptor] of savedGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  dom.window.ytInitialPlayerResponse = { captions: { playerCaptionsTracklistRenderer: {
    captionTracks: [{ baseUrl: captionUrl, languageCode: "en" }],
  } } };
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 1, url, title: dom.window.document.title }] },
    scripting: {
      executeScript: async ({ target, world, func }: chrome.scripting.ScriptInjection<[], unknown>) => {
        assert.deepEqual(target, { tabId: 1 });
        assert.equal(world, "MAIN");
        assert.equal(func, readCaptionTracks);
        return [{ result: dom.window.eval(`(${func})()`) }];
      },
    },
  } as unknown as typeof chrome;
  const download = t.mock.method(globalThis, "fetch", async () => new Response(captions));
  const requestAccess = t.mock.fn(async () => false);
  const job = await captureSource({ kind: "youtube" }, "deck", "", undefined, requestAccess);
  assert.deepEqual(job, {
    deckId: "deck", source: { url, title: "Light and plants" }, input: { kind: "text",
      text: "Plants & algae use light.\nEnergy is stored as sugar.\nChlorophyll is a pigment that captures light." },
  });
  assert.equal(download.mock.callCount(), 1);
  assert.equal(String(download.mock.calls[0].arguments[0]), captionUrl);
  assert.equal(requestAccess.mock.callCount(), 0);
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

test("inline PNG and JPEG captures reject oversized blobs before reading them", async (t) => {
  const bytes = new Uint8Array(MAX_INLINE_MEDIA_BYTES + 1);
  for (const type of ["image/png", "image/jpeg"]) {
    const oversized = new Blob([bytes], { type });
    const arrayBuffer = t.mock.method(oversized, "arrayBuffer");
    await assert.rejects(readImage(oversized), /image is too large/iu);
    assert.equal(arrayBuffer.mock.callCount(), 0);
  }
  const atLimit = new Blob([bytes.subarray(0, MAX_INLINE_MEDIA_BYTES)], { type: "image/png" });
  assert.equal((await readImage(atLimit)).kind, "image");
});

test("sniffs PNG, JPEG, both GIF versions and WebP signatures", () => {
  const ascii = (value: string) => new TextEncoder().encode(value);
  assert.equal(sniffImageType(pngSignature), "image/png");
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(sniffImageType(ascii("GIF87a")), "image/gif");
  assert.equal(sniffImageType(ascii("GIF89a")), "image/gif");
  assert.equal(sniffImageType(ascii("RIFF1234WEBP")), "image/webp");
  assert.equal(sniffImageType(ascii("unrecognized")), undefined);
  assert.equal(sniffImageType(ascii("RIFF1234WEB")), undefined);
  assert.equal(sniffImageType(pngSignature.subarray(0, 7)), undefined);
});

test("image capture reads the clicked data URL and keeps the source tab metadata", async (t) => {
  const data = Buffer.from(pngSignature).toString("base64");
  const url = `data:image/png;base64,${data}`;
  const fetchData = globalThis.fetch;
  const { capture, captureVisibleTab, contains, mockFetch } = stubImageCapture(t, async (input, init) => {
    assert.equal(input, url);
    return fetchData(url, init);
  });
  assert.deepEqual(await capture(url), {
    deckId: "deck",
    source: { url: "https://example.test/article", title: "Article" },
    input: { kind: "image", mimeType: "image/png", data },
  });
  assert.deepEqual(mockFetch.mock.calls.map(({ arguments: args }) => args), [[url, { credentials: "include" }]]);
  assert.equal(contains.mock.callCount(), 0);
  assert.equal(captureVisibleTab.mock.callCount(), 0);
});

test("image capture requests access to the image origin and retries after approval", async (t) => {
  let shouldFail = true;
  const { capture, captureVisibleTab, contains, mockFetch, requestAccess } = stubImageCapture(t, async () => {
    if (shouldFail) {
      shouldFail = false;
      throw new TypeError("Failed to fetch");
    }
    return new Response(pngSignature, { headers: { "Content-Type": "image/png" } });
  }, true);
  assert.deepEqual((await capture(clickedImageUrl)).input, {
    kind: "image", mimeType: "image/png", data: Buffer.from(pngSignature).toString("base64"),
  });
  const request = [clickedImageUrl, { credentials: "include" }];
  assert.deepEqual(mockFetch.mock.calls.map(({ arguments: args }) => args), [request, request]);
  assert.equal(contains.mock.callCount(), 1);
  assert.deepEqual(contains.mock.calls[0].arguments, [{ origins: ["https://cdn.example.test/*"] }]);
  assert.equal(requestAccess.mock.callCount(), 1);
  assert.deepEqual(requestAccess.mock.calls[0].arguments, ["https://cdn.example.test/*", "download this image"]);
  assert.equal(captureVisibleTab.mock.callCount(), 0);
});

for (const grantAccess of [false, true]) {
  test(`image capture falls back when ${grantAccess ? "the retry fails" : "site access is declined"}`, async (t) => {
    const { capture, captureVisibleTab, mockFetch, requestAccess } = stubImageCapture(t, async () => {
      throw new TypeError("Failed to fetch");
    }, grantAccess);
    assert.deepEqual((await capture(clickedImageUrl)).input, screenshot);
    assert.equal(mockFetch.mock.callCount(), grantAccess ? 2 : 1);
    assert.equal(requestAccess.mock.callCount(), 1);
    assert.equal(captureVisibleTab.mock.callCount(), 1);
  });
}

for (const type of ["application/octet-stream", "BINARY/OCTET-STREAM; x=1", ""]) {
  test(`image capture detects JPEG bytes with Content-Type ${type || "absent"}`, async (t) => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const response = new Response(bytes, type ? { headers: { "Content-Type": type } } : undefined);
    const blob = t.mock.method(response, "blob");
    const { capture, captureVisibleTab } = stubImageCapture(t, async () => response);
    assert.deepEqual((await capture(clickedImageUrl)).input, {
      kind: "image", mimeType: "image/jpeg", data: Buffer.from(bytes).toString("base64"),
    });
    assert.equal(blob.mock.callCount(), 1);
    assert.equal(captureVisibleTab.mock.callCount(), 0);
  });
}

for (const [scenario, fetchImage] of Object.entries({
  "an HTML response": async () => new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html" } }),
  "unknown bytes with a generic type": async () => new Response("not an image", { headers: { "Content-Type": "application/octet-stream" } }),
  "an HTTP error": async () => new Response(null, { status: 404 }),
  "a non-network fetch error": async () => { throw new Error("Fetch interrupted"); },
})) {
  test(`image capture falls back for ${scenario} without requesting site access`, async (t) => {
    const { capture, captureVisibleTab, contains } = stubImageCapture(t, fetchImage);
    assert.deepEqual((await capture(clickedImageUrl)).input, screenshot);
    assert.equal(contains.mock.callCount(), 0);
    assert.equal(captureVisibleTab.mock.callCount(), 1);
  });
}

test("image capture takes a screenshot when the clicked image cannot be decoded", async (t) => {
  const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  t.after(() => {
    if (originalCreateImageBitmap) Object.defineProperty(globalThis, "createImageBitmap", originalCreateImageBitmap);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  });
  const createImageBitmap = t.mock.fn(async () => {
    throw new DOMException("The source image could not be decoded.", "InvalidStateError");
  });
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: createImageBitmap });

  const { capture, captureVisibleTab } = stubImageCapture(t, async () =>
    new Response("<svg xmlns=\"http://www.w3.org/2000/svg\"/>", { headers: { "Content-Type": "image/svg+xml" } }));
  assert.deepEqual((await capture("https://cdn.example.test/logo.svg")).input, screenshot);
  assert.equal(createImageBitmap.mock.callCount(), 1);
  assert.equal(captureVisibleTab.mock.callCount(), 1);
});

test("image capture surfaces the oversized-image error without taking a screenshot", async (t) => {
  const bytes = new Uint8Array(MAX_INLINE_MEDIA_BYTES + 1);
  bytes.set(pngSignature);
  const { capture, captureVisibleTab } = stubImageCapture(t, async () =>
    new Response(bytes, { headers: { "Content-Type": "image/png" } }));
  await assert.rejects(capture(clickedImageUrl), /image is too large/iu);
  assert.equal(captureVisibleTab.mock.callCount(), 0);
});

for (const url of ["blob:https://example.test/image", undefined]) {
  test(`image capture takes a screenshot with ${url ? "a blob URL" : "no image URL"} without attempting a download`, async (t) => {
    const { capture, captureVisibleTab, contains, mockFetch } = stubImageCapture(t, async () => new Response());
    assert.deepEqual((await capture(url)).input, screenshot);
    assert.equal(mockFetch.mock.callCount(), 0);
    assert.equal(contains.mock.callCount(), 0);
    assert.equal(captureVisibleTab.mock.callCount(), 1);
  });
}

test("PDF capture rejects oversized inline media when text extraction fails", async (t) => {
  const bytes = new Uint8Array(MAX_INLINE_MEDIA_BYTES + 1);
  bytes.set(new TextEncoder().encode("%PDF-1.4\n"));
  stubPdfFetch(t, bytes);
  await assert.rejects(pdfInput("https://example.test/oversized.pdf"), /PDF has no extractable text and is too large/iu);
});

test("PDF capture encodes scanned PDFs within the inline limit", async (t) => {
  const bytes = await readFile(fixture("scan.pdf"));
  stubPdfFetch(t, bytes);
  assert.deepEqual(await pdfInput("https://example.test/scan.pdf"), {
    kind: "pdf", mimeType: "application/pdf", data: bytes.toString("base64"), text: "",
  });
});

test("PDF capture extracts text even when the file exceeds the inline limit", async (t) => {
  const pdf = await readFile(fixture("text.pdf"));
  const startXref = pdf.lastIndexOf("startxref");
  const bytes = new Uint8Array(MAX_INLINE_MEDIA_BYTES + 1).fill(0x20);
  // Pad before startxref so the cross-reference offsets and end-of-file marker remain valid.
  bytes.set(pdf.subarray(0, startXref));
  bytes.set(pdf.subarray(startXref), bytes.length - (pdf.length - startXref));
  stubPdfFetch(t, bytes);
  const input = await pdfInput("https://example.test/text.pdf");
  assert.equal(input.kind, "text");
  assert.match(input.text, /Chlorophyll absorbs light energy for photosynthesis/u);
});
