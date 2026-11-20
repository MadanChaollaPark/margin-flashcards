import type { CardDraft } from "./schema";

function normalize(front: string): string {
  return front.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function trigrams(value: string): Set<string> {
  const chars = Array.from(value);
  return new Set(chars.slice(2).map((_, index) => chars.slice(index, index + 3).join("")));
}

function similarity(first: Set<string>, second: Set<string>): number {
  if (!first.size || !second.size) return 0;
  let common = 0;
  for (const trigram of first) {
    if (second.has(trigram)) common++;
  }
  return common / (first.size + second.size - common);
}

export function dedupe<T extends CardDraft>(cards: readonly T[], existing: readonly CardDraft[] = []): T[] {
  const fronts = new Set<string>();
  const compared: { type: CardDraft["type"]; grams: Set<string> }[] = [];
  const accepted: T[] = [];
  for (const card of existing) {
    const front = normalize(card.front) || card.front.trim();
    fronts.add(`${card.type}:${front}`);
    compared.push({ type: card.type, grams: trigrams(front) });
  }
  for (const card of cards) {
    const front = normalize(card.front) || card.front.trim();
    const key = `${card.type}:${front}`;
    const grams = trigrams(front);
    if (fronts.has(key)) continue;
    if (compared.some((item) => item.type === card.type && similarity(item.grams, grams) >= 0.82)) continue;
    fronts.add(key);
    compared.push({ type: card.type, grams });
    accepted.push(card);
  }
  return accepted;
}
