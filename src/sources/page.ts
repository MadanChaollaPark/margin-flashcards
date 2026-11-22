// executeScript serializes this function, so it must be self-contained.
export function extractPage(doc: Document = document): string {
  const root = doc.body?.cloneNode(true) as HTMLElement | undefined;
  if (!root) return "";
  root.querySelectorAll(
    "nav, footer, aside, script, style, noscript, template, svg, button, select, textarea, " +
    "[hidden], [aria-hidden='true'], [role='navigation'], [role='complementary']",
  ).forEach((node) => node.remove());

  const size = (element: Element) => element.textContent?.trim().length ?? 0;
  const candidateSelector = "article, main, [role='main']";
  const rootLength = size(root);
  root.querySelectorAll("form").forEach((form) => {
    if (form.querySelector(candidateSelector) || size(form) >= 0.5 * rootLength) return;
    form.remove();
  });

  const candidates = [...root.querySelectorAll(candidateSelector)];
  candidates.sort((a, b) => size(b) - size(a));
  const largest = candidates[0];
  const article = candidates.find((element) => element.matches("article"));
  const content = largest && size(largest)
    ? (article && size(article) >= size(largest) * 0.65 ? article : largest)
    : root;
  content.querySelectorAll(
    "h1, h2, h3, h4, h5, h6, p, div, li, blockquote, pre, br, tr, section, " +
    "dt, dd, figcaption, caption, figure, header, article, main, ul, ol, dl, table, details, summary, hr",
  ).forEach((node) => {
    node.append("\n");
  });
  content.querySelectorAll("td, th").forEach((cell) => {
    if (cell.previousElementSibling?.matches("td, th")) cell.prepend(" | ");
  });
  return (content.textContent ?? "").split("\n")
    .map((line) => line.replace(/\s+/gu, " ").trim()).filter(Boolean).join("\n");
}
