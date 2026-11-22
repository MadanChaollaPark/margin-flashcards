import { CLOZE_DELETION } from "./cloze";
import type { CardDraft } from "./schema";

const ROMAN_NUMERALS = new Set("i ii iii iv v vi vii viii ix x".split(" "));

function normalize(front: string): string {
  return front.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function signature(values: string[]): string {
  return JSON.stringify([...new Set(values)].sort());
}

function describeFront(card: CardDraft, front: string) {
  const tokens = normalize(card.front.replace(CLOZE_DELETION, " $2 ")).split(" ");
  const numbers = signature(tokens.filter((token) => /\p{Nd}/u.test(token) || ROMAN_NUMERALS.has(token)));
  const clozeAnswers = card.type === "cloze"
    ? signature(Array.from(card.front.matchAll(CLOZE_DELETION), ([, , content]) => normalize(content.split("::", 1)[0])))
    : "";
  return { type: card.type, grams: trigrams(front), numbers, clozeAnswers };
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
  const compared: ReturnType<typeof describeFront>[] = [];
  const accepted: T[] = [];
  for (const card of existing) {
    const front = normalize(card.front) || card.front.trim();
    fronts.add(`${card.type}:${front}`);
    compared.push(describeFront(card, front));
  }
  for (const card of cards) {
    const front = normalize(card.front) || card.front.trim();
    const key = `${card.type}:${front}`;
    if (fronts.has(key)) continue;
    const current = describeFront(card, front);
    if (compared.some((item) => item.type === current.type
      && item.numbers === current.numbers
      && item.clozeAnswers === current.clozeAnswers
      && similarity(item.grams, current.grams) >= 0.82)) continue;
    fronts.add(key);
    compared.push(current);
    accepted.push(card);
  }
  return accepted;
}
