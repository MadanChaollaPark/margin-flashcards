import { MAX_CARDS, validate, type CardDraft } from "./schema";

const MAX_RESPONSE_LENGTH = 256_000;

type ParsedDraft = CardDraft & { sourceQuote?: string };

export function parseCards(response: string, maxCards = MAX_CARDS): CardDraft[] {
  return parseCardResponse(response, maxCards) ?? [];
}

// Recover complete card objects from a top-level array or a {"cards":[...]} wrapper.
// An empty array is a valid model response. Undefined means no response was recovered.
export function parseCardResponse(response: string, maxCards = MAX_CARDS, quoteSource = false): ParsedDraft[] | undefined {
  const limit = Math.min(MAX_CARDS, Math.floor(maxCards));
  if (limit < 1 || !Number.isFinite(limit)) return [];

  const input = response.slice(0, MAX_RESPONSE_LENGTH);
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/iu);
  const text = (fenced?.[1] ?? input).trimStart();
  const wrapper = text.match(/"cards"\s*:\s*\[/u);
  const start = text.startsWith("[") ? 0
    : wrapper ? (wrapper.index ?? 0) + wrapper[0].length - 1
    : text.search(/\[\s*(?:\{|\]|$)/u);
  if (start === -1) return;
  if (/^\[\s*\]/u.test(text.slice(start))) return [];

  const stack = ["["];
  const cards: ParsedDraft[] = [];
  let quoted = false;
  let escaped = false;
  let objectStart = -1;
  for (let index = start + 1; index < text.length && cards.length < limit; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === "{" || char === "[") {
      if (char === "{" && stack.length === 1) objectStart = index;
      stack.push(char);
    } else if (char === "}" || char === "]") {
      if (stack.pop() !== (char === "}" ? "{" : "[")) break;
      if (stack.length === 0) break;
      if (stack.length === 1 && objectStart !== -1) {
        const candidate = text.slice(objectStart, index + 1);
        // Match complete quoted strings before removing trailing commas.
        const repaired = candidate.replace(/"(?:[^"\\]|\\[\s\S])*"|,(?=\s*[}\]])/gu, (match) =>
          match === "," ? "" : match,
        );
        try {
          const value = JSON.parse(repaired);
          const card = validate(value);
          if (card) {
            const quote = quoteSource && typeof value.sourceQuote === "string" ? value.sourceQuote.trim() : "";
            cards.push(quote && quote.length <= 240 ? { ...card, sourceQuote: quote } : card);
          }
        } catch {
          // A malformed object does not invalidate the rest of the array.
        }
        objectStart = -1;
      }
    }
  }
  return cards.length ? cards : undefined;
}
