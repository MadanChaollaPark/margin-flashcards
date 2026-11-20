import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupe } from "../../src/cards/dedupe";
import { parseCardResponse, parseCards } from "../../src/cards/parse";
import { MAX_CARDS, MAX_FRONT_LENGTH, validate } from "../../src/cards/schema";

const basic = { type: "basic", front: "How do plants capture energy from sunlight?", back: "Photosynthesis." } as const;

test("parses fenced JSON, normalizes whitespace and accepts a cards wrapper", () => {
  const json = JSON.stringify({ cards: [{ ...basic, front: `  ${basic.front}  ` }] });
  assert.deepEqual(parseCards("Flashcards\n```json\n" + json + "\n```\n"), [basic]);
});

test("repairs trailing commas without changing quoted content and recovers complete cards from a partial array", () => {
  const raw = String.raw`[{"front":"What are \"array\" delimiters?","back":"[,]",},
    {"front":false,"back":"invalid"}, {"front":"What follows?","back":"A complete card"}, {"front":"truncated`;
  assert.deepEqual(parseCards(raw), [
    { type: "basic", front: 'What are "array" delimiters?', back: "[,]" },
    { type: "basic", front: "What follows?", back: "A complete card" },
  ]);
  assert.deepEqual(parseCards("[{\"nogood\": }, " + JSON.stringify(basic) + ",]"), [basic]);
  assert.deepEqual(parseCards("No usable JSON"), []);
  assert.deepEqual(parseCardResponse('```json\n{"cards":[]}\n```'), []);
  assert.equal(parseCardResponse('[{"front":false}]'), undefined);
});

test("caps oversized responses and rejects oversized card fields", () => {
  const response = JSON.stringify(Array.from({ length: MAX_CARDS + 5 }, (_, index) => ({
    ...basic, front: `Question ${index}?`,
  })));
  assert.equal(parseCards(response).length, MAX_CARDS);
  assert.equal(parseCards(response, 2).length, 2);
  assert.equal(parseCards(response, 0).length, 0);
  assert.deepEqual(parseCards(" ".repeat(256_001) + response), []);
  assert.deepEqual(parseCards(JSON.stringify([{ ...basic, front: "x".repeat(MAX_FRONT_LENGTH + 1) }])), []);
});

test("rejects empty fronts and backs, unknown card types and cloze cards without a deletion", () => {
  for (const invalid of [null, { ...basic, front: "  " }, { ...basic, back: "" },
    { ...basic, type: "other" }, { ...basic, type: "cloze" },
    { ...basic, type: "cloze", front: "Plants use {{c1:: }}." }]) {
    assert.equal(validate(invalid), undefined);
  }
  assert.deepEqual(validate({ type: "cloze", front: "Plants use {{c1::chlorophyll}}.", back: "chlorophyll" }),
    { type: "cloze", front: "Plants use {{c1::chlorophyll}}.", back: "chlorophyll" });
});

test("deduplicates normalized fronts and near-duplicates while keeping the first card", () => {
  const unrelated = { ...basic, front: "What is an enzyme?" };
  assert.deepEqual(dedupe([
    basic,
    { ...basic, front: basic.front.toUpperCase().replace("?", "!"), back: "Duplicate." },
    { ...basic, front: "How do plants capture energy from the sunlight?" },
    unrelated,
  ]), [basic, unrelated]);
});
