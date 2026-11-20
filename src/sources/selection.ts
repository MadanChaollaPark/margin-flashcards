export function readSelection() {
  return { text: window.getSelection()?.toString().trim() ?? "", url: location.href, title: document.title };
}

function encodeTerm(text: string): string {
  return encodeURIComponent(text.replace(/[\uD800-\uDFFF]/gu, "\uFFFD")).replace(/-/gu, "%2D");
}

export function textFragmentUrl(url: string, selection: string): string {
  const text = normalizeAnchorText(selection);
  if (!text) return url;
  const words = text.split(" ");
  const range = text.length <= 200
    ? encodeTerm(text)
    : [words.slice(0, 5).join(" "), words.slice(-5).join(" ")].map(encodeTerm).join(",");
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
