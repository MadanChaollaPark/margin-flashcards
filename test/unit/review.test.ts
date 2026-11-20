import assert from "node:assert/strict";
import { test } from "node:test";
import { InferenceMode, InferenceSource } from "firebase/ai";
import { Rating, State } from "ts-fsrs";
import { checkAnswer, parseGrade } from "../../src/ai/grade";
import { MockProvider } from "../../src/ai/mockProvider";
import { renderFront } from "../../src/cards/cloze";
import type { Card, Review } from "../../src/cards/schema";
import { dueCards, nextIntervals, nextSchedule } from "../../src/srs/fsrs";
import { createMemoryDatabase } from "../../src/storage/db";

const start = new Date("2026-11-20T09:00:00Z");
const card: Card = {
  id: "one", deckId: "bio", type: "basic", front: "What does chlorophyll absorb?", back: "Light",
  createdAt: start.getTime(), route: { source: "on_device", reason: "Local.", ms: 0, tokensEst: 5 },
};

test("FSRS Good reviews increase intervals and Again sends a review card to relearning", () => {
  const first = nextSchedule(card, Rating.Good, start);
  const second = nextSchedule({ ...card, schedule: first }, Rating.Good, first.due);
  const third = nextSchedule({ ...card, schedule: second }, Rating.Good, second.due);
  assert.ok(second.scheduled_days > first.scheduled_days);
  assert.ok(third.scheduled_days > second.scheduled_days);
  const lapse = nextSchedule({ ...card, schedule: third }, Rating.Again, third.due);
  assert.equal(lapse.state, State.Relearning);
  assert.equal(lapse.lapses, 1);
  assert.ok(lapse.due.getTime() - third.due.getTime() < 3_600_000);
  assert.equal(nextIntervals(card, start).length, 4);
  assert.equal(nextIntervals(card, start)[2].milliseconds, first.due.getTime() - start.getTime());
});

test("the grade verdict maps to a consistent rating", () => {
  assert.equal(parseGrade('{"verdict":"partial","missing":["light"],"suggestedRating":4}').suggestedRating, 2);
  assert.equal(parseGrade('{"verdict":"incorrect","missing":[],"suggestedRating":3}').suggestedRating, 1);
  assert.equal(parseGrade('{"verdict":"correct","missing":[],"suggestedRating":4}').suggestedRating, 4);
  assert.throws(() => parseGrade('{"verdict":"unknown","missing":[]}'), /incomplete/iu);
});

test("typed grading requests only on-device inference and rejects cloud results", async (t) => {
  const provider = new MockProvider();
  const generate = t.mock.method(provider, "generate");
  const check = () => checkAnswer(provider, "demo", card.front, card.back, "Light");
  assert.deepEqual(await check(), {
    verdict: "correct", missing: [], suggestedRating: 3, source: InferenceSource.ON_DEVICE, simulated: true,
  });
  generate.mock.mockImplementationOnce(async () => ({
    text: "", source: InferenceSource.IN_CLOUD, reason: "Unexpected cloud result.",
  }));
  await assert.rejects(check(), /on-device answer feedback is unavailable/iu);
  t.mock.method(provider, "status", async () => ({ nano: "unavailable" }));
  await assert.rejects(check(), /enable on-device/iu);
  assert.deepEqual(generate.mock.calls.map(({ arguments: [request] }) => request.mode), [
    InferenceMode.ONLY_ON_DEVICE, InferenceMode.ONLY_ON_DEVICE,
  ]);
});

test("cloze blanks and hints hide the answer until reveal", () => {
  const front = "{{c1::Chlorophyll::pigment}} absorbs {{c1::light}}.";
  assert.equal(renderFront(front, false), "[pigment] absorbs […].");
  assert.equal(renderFront(front, true), "Chlorophyll absorbs light.");
});

test("saving deduplicates against the deck and each review updates its schedule once", async () => {
  const database = createMemoryDatabase();
  await database.put("decks", { id: card.deckId, name: "Biology", createdAt: card.createdAt });
  assert.equal(await database.saveCards(card.deckId, [card]), 1);
  assert.equal(await database.saveCards(card.deckId, [{ ...card, id: "duplicate" }]), 0);
  assert.deepEqual(dueCards(await database.all("cards"), card.deckId, start.getTime()), [card]);
  const schedule = nextSchedule(card, Rating.Good, start);
  const review: Review = { id: "review", cardId: card.id, reviewedAt: start.getTime(), rating: Rating.Good };
  assert.equal(await database.recordReview(card, schedule, review), true);
  assert.equal(await database.recordReview(card, schedule, { ...review, id: "duplicate-review" }), false);
  assert.equal(dueCards(await database.all("cards"), null, start.getTime()).length, 0);
  await database.deleteDeck(card.deckId);
  assert.deepEqual(await database.all("cards"), []);
  assert.deepEqual(await database.all("reviews"), []);
});
