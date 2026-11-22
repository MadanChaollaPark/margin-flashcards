export function readSelection() {
  return { text: window.getSelection()?.toString().trim() ?? "", url: location.href, title: document.title };
}

function encodeTerm(text: string): string {
  return encodeURIComponent(text.replace(/[\uD800-\uDFFF]/gu, "\uFFFD")).replace(/-/gu, "%2D");
}

function encodeRange(text: string): string {
  // CJK text may have no spaces, and Chrome requires textEnd to follow textStart.
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  const words = [...segmenter.segment(text)].filter(({ isWordLike }) => isWordLike);
  if (!words.length) return encodeTerm(text);

  let startEnd = 0;
  for (const { index, segment } of words.slice(0, 5)) {
    startEnd = index + segment.length;
    if (startEnd >= 40) break;
  }

  let endStart = text.length;
  for (const { index } of words.slice(-5).reverse()) {
    endStart = index;
    if (text.length - endStart >= 40) break;
  }

  if (endStart < startEnd) return encodeTerm(text);
  const start = text.slice(0, startEnd).trim();
  const end = text.slice(endStart).trim();
  return `${encodeTerm(start)},${encodeTerm(end)}`;
}

export function textFragmentUrl(url: string, selection: string): string {
  const text = normalizeAnchorText(selection);
  if (!text) return url;
  const range = text.length <= 200 ? encodeTerm(text) : encodeRange(text);
  const anchor = url.split("#")[1]?.split(":~:")[0] ?? "";
  return `${url.split("#")[0]}#${anchor}:~:text=${range}`;
}

export function normalizeAnchorText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

// Check the quote against the supplied chunk and use a unique excerpt from the page.
export function pageFragmentUrl(url: string, page: string, chunk: string, quote: string): string | undefined {
  const text = normalizeAnchorText(quote);
  if (text.length < 12 || !chunk.includes(text)) return;
  const prefix = text.split(" ").slice(0, 8).join(" ");
  for (const excerpt of [prefix, text]) {
    if (excerpt.length < 12 || excerpt.length > 200) continue;
    const lower = excerpt.toLowerCase();
    const offset = page.indexOf(lower);
    if (offset !== -1 && offset === page.lastIndexOf(lower)) return textFragmentUrl(url, excerpt);
  }
}
