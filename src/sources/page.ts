// executeScript serializes this function, so it must be self-contained.
export function extractPage(doc: Document = document): string {
  const root = doc.body?.cloneNode(true) as HTMLElement | undefined;
  if (!root) return "";
  root.querySelectorAll("nav, footer, aside, script, style, noscript, template, svg, form, button, [hidden], [aria-hidden='true'], [role='navigation'], [role='complementary']").forEach((node) => node.remove());

  const candidates = [...root.querySelectorAll("article, main, [role='main']")];
  const size = (element: Element) => element.textContent?.trim().length ?? 0;
  candidates.sort((a, b) => size(b) - size(a));
  const largest = candidates[0];
  const article = candidates.find((element) => element.matches("article"));
  const content = largest && size(largest)
    ? (article && size(article) >= size(largest) * 0.65 ? article : largest)
    : root;
  content.querySelectorAll("h1, h2, h3, h4, h5, h6, p, div, li, blockquote, pre, br, tr, section").forEach((node) => {
    node.append("\n");
  });
  return (content.textContent ?? "").split("\n")
    .map((line) => line.replace(/\s+/gu, " ").trim()).filter(Boolean).join("\n");
}
