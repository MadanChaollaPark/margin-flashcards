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

test("rejects empty fronts and backs, unknown card types and invalid cloze deletions", () => {
  for (const invalid of [null, { ...basic, front: "  " }, { ...basic, back: "" },
    { ...basic, type: "other" }, { ...basic, type: "cloze" },
    { ...basic, type: "cloze", front: "Plants use {{c1:: }}." },
    { ...basic, type: "cloze", front: "{{c1::::pigment}}" },
    { ...basic, type: "cloze", front: "{{c1::Paris}} {{c2::  }}" },
    { ...basic, type: "cloze", front: "{{c1::Paris}} {{c2::}}" },
    { ...basic, type: "cloze", front: "{{c2::France}}" }]) {
    assert.equal(validate(invalid), undefined);
  }
  assert.deepEqual(validate({ type: "cloze", front: "Plants use {{c1::chlorophyll}}.", back: "chlorophyll" }),
    { type: "cloze", front: "Plants use {{c1::chlorophyll}}.", back: "chlorophyll" });
});

test("accepts cloze cards with multiple deletion numbers or a hint", () => {
  const multiple = { type: "cloze", front: "{{c1::Paris}} is in {{c2::France}}", back: "Paris" };
  const hinted = { type: "cloze", front: "{{c1::Chlorophyll::pigment}}", back: "Chlorophyll" };
  assert.deepEqual(validate(multiple), multiple);
  assert.deepEqual(validate(hinted), hinted);
  assert.deepEqual(parseCards(JSON.stringify([multiple])), [multiple]);
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

test("keeps cards that differ only in numbers or Roman numerals", () => {
  const year1914 = { ...basic, front: "What happened in Europe in 1914?" };
  const year1918 = { ...basic, front: "What happened in Europe in 1918?" };
  assert.deepEqual(dedupe([year1914, year1918]), [year1914, year1918]);
  assert.deepEqual(dedupe([year1918], [year1914]), [year1918]);
  assert.deepEqual(dedupe([year1914, { ...year1914, front: "WHAT HAPPENED IN EUROPE IN 1914!" }]), [year1914]);

  const firstWar = { ...basic, front: "What year did World War I end?" };
  const secondWar = { ...basic, front: "What year did World War II end?" };
  assert.deepEqual(dedupe([firstWar, secondWar]), [firstWar, secondWar]);

  const firstLabel = { ...basic, front: "How does the label C1 identify this component in the circuit?" };
  const secondLabel = { ...basic, front: "How does the label C2 identify this component in the circuit?" };
  assert.deepEqual(dedupe([firstLabel, secondLabel]), [firstLabel, secondLabel]);
});

test("deduplicates rewordings that use the same number tokens", () => {
  const first = { ...basic, front: "How did the civil engineers mix the concrete for bridge 12?" };
  const second = { ...basic, front: "How do the civil engineers mix the concrete for bridge 12?" };
  assert.deepEqual(dedupe([first, second]), [first]);

  const capital = { ...basic, front: "What is the capital of France?" };
  assert.deepEqual(dedupe([capital, { ...capital, front: "What's the capital of France?" }]), [capital]);
});

test("keeps cloze cards that hide different answers in the same sentence", () => {
  const mitochondria = { type: "cloze", front: "{{c1::Mitochondria}} produce ATP in cells.", back: "Mitochondria" } as const;
  const atp = { ...mitochondria, front: "Mitochondria produce {{c1::ATP}} in cells.", back: "ATP" };
  const reworded = { ...mitochondria, front: "{{c1::Mitochondria}} produce ATP in the cells." };
  assert.deepEqual(dedupe([mitochondria, atp]), [mitochondria, atp]);
  assert.deepEqual(dedupe([atp, reworded], [mitochondria]), [atp]);
  assert.deepEqual(dedupe([mitochondria, reworded]), [mitochondria]);
});

test("ignores deletion numbers and hint text when matching the same hidden answers", () => {
  const first = { type: "cloze", front: "{{c1::Mitochondria::organelle}} produce {{c2::ATP}} in animal cells.", back: "ATP" } as const;
  const renumbered = { ...first, front: "{{c1::Mitochondria::organelle}} produce {{c3::ATP}} in animal cells." };
  const rehinted = { ...first, front: "{{c1::MITOCHONDRIA::organelles}} produce {{c2::ATP}} in animal cells." };
  assert.deepEqual(dedupe([first, renumbered]), [first]);
  assert.deepEqual(dedupe([first, rehinted]), [first]);
});
