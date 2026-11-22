import assert from "node:assert/strict";
import { test } from "node:test";
import { InferenceMode, InferenceSource } from "firebase/ai";
import { Rating, State } from "ts-fsrs";
import { checkAnswer, parseGrade } from "../../src/ai/grade";
import { MockProvider } from "../../src/ai/mockProvider";
import { expectedAnswer, renderFront } from "../../src/cards/cloze";
import type { Card, Review } from "../../src/cards/schema";
import { dueCards, intervalDescription, intervalLabel, LEARN_AHEAD_MS, nextIntervals, nextSchedule, requeueReviewed } from "../../src/srs/fsrs";
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
  const relearning = { ...card, schedule: lapse };
  assert.deepEqual(requeueReviewed([card], 0, relearning, third.due.getTime()), [card, relearning]);
  assert.equal(nextIntervals(card, start).length, 4);
  assert.equal(nextIntervals(card, start)[2].milliseconds, first.due.getTime() - start.getTime());
});

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

test("interval labels round up to larger units at display boundaries", () => {
  const cases = [
    [30_000, "1m"],
    [10 * minute, "10m"],
    [59 * minute, "59m"],
    [59.6 * minute, "1h"],
    [3 * hour, "3h"],
    [23.4 * hour, "23h"],
    [23.5 * hour, "1d"],
    [day, "1d"],
    [29 * day, "29d"],
    [30 * day, "1mo"],
    [45 * day, "1.5mo"],
    [358 * day, "11.9mo"],
    [359 * day, "1y"],
    [365 * day, "1y"],
    [900 * day, "2.5y"],
  ] as const;
  for (const [milliseconds, expected] of cases) {
    assert.equal(intervalLabel(milliseconds), expected, `${milliseconds} ms`);
  }
});

test("interval descriptions spell out the rounded units and pluralize amounts other than one", () => {
  const cases = [
    [minute, "1 minute"],
    [10 * minute, "10 minutes"],
    [hour, "1 hour"],
    [3 * hour, "3 hours"],
    [23.5 * hour, "1 day"],
    [day, "1 day"],
    [5 * day, "5 days"],
    [30 * day, "1 month"],
    [45 * day, "1.5 months"],
    [359 * day, "1 year"],
    [730 * day, "2 years"],
  ] as const;
  for (const [milliseconds, expected] of cases) {
    assert.equal(intervalDescription(milliseconds), expected, `${milliseconds} ms`);
  }
});

test("Hard and Good learning steps requeue after due cards without mutating the queue", () => {
  const remaining = { ...card, id: "two" };
  const queue = [card, remaining];
  for (const rating of [Rating.Hard, Rating.Good] as const) {
    const reviewed = { ...card, schedule: nextSchedule(card, rating, start) };
    const nextQueue = requeueReviewed(queue, 0, reviewed, start.getTime());
    assert.deepEqual(nextQueue, [card, remaining, reviewed]);
    assert.deepEqual(queue, [card, remaining]);
  }
});

test("Easy returns a fresh queue without requeuing the reviewed card", () => {
  const queue = [card];
  const reviewed = { ...card, schedule: nextSchedule(card, Rating.Easy, start) };
  const nextQueue = requeueReviewed(queue, 0, reviewed, start.getTime());
  assert.notStrictEqual(nextQueue, queue);
  assert.deepEqual(nextQueue, [card]);
});

test("requeued learning cards follow the remaining due cards in due order", () => {
  const second = { ...card, id: "two" };
  const remaining = { ...card, id: "three" };
  const good = { ...card, schedule: nextSchedule(card, Rating.Good, start) };
  const again = { ...second, schedule: nextSchedule(second, Rating.Again, start) };
  const queue = requeueReviewed([card, second, remaining], 0, good, start.getTime());
  assert.deepEqual(requeueReviewed(queue, 1, again, start.getTime()), [card, second, remaining, again, good]);
});

test("requeueing includes cards due exactly at the learn-ahead limit", () => {
  const now = start.getTime();
  const schedule = nextSchedule(card, Rating.Good, start);
  const atLimit = { ...card, schedule: { ...schedule, due: new Date(now + LEARN_AHEAD_MS) } };
  const pastLimit = { ...card, schedule: { ...schedule, due: new Date(now + LEARN_AHEAD_MS + 1) } };
  assert.deepEqual(requeueReviewed([card], 0, atLimit, now), [card, atLimit]);
  assert.deepEqual(requeueReviewed([card], 0, pastLimit, now), [card]);
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

test("cloze rendering hides and reveals every positive deletion number", () => {
  const front = "{{c1::Paris}} is the capital of {{c2::France}}.";
  assert.equal(renderFront(front, false), "[…] is the capital of […].");
  assert.equal(renderFront(front, true), "Paris is the capital of France.");
  assert.equal(renderFront("{{c2::x::hint}} and {{c10::y}}", false), "[hint] and […]");
  assert.equal(renderFront("{{c2::x::hint::ignored}}", false), "[hint]");
  for (const plain of ["{{c0::x}}", "{{x}}", "What is the capital of France?"]) {
    assert.equal(renderFront(plain, false), plain);
    assert.equal(renderFront(plain, true), plain);
  }
});

test("expected answers come from the basic back or the unique nonempty cloze deletions in front order", () => {
  const cases = [
    ["basic", "Q?", "A.", "A."],
    ["cloze", "{{c1::Paris}} is the capital of {{c2::France}}.", "Paris", "Paris; France"],
    ["cloze", "{{c1:: Chlorophyll ::pigment}} absorbs {{c2::light}}.", "Extra notes.", "Chlorophyll; light"],
    ["cloze", "{{c2::B}} then {{c1::A}} then {{c2::B}}", "Extra notes.", "B; A"],
    ["cloze", "Plants absorb {{c1::light}}.", "Chlorophyll.", "light"],
    ["cloze", "{{c1:: ::hint}} and {{c2::light}}", "Extra notes.", "light"],
    ["cloze", "{{c1::}} and {{c2:: ::hint}}", "x", "x"],
    ["cloze", "No markup", "x", "x"],
  ] as const;
  for (const [type, front, back, expected] of cases) {
    assert.equal(expectedAnswer({ type, front, back }), expected, front);
  }
});

test("typed cloze grading requires both hidden answers", async (t) => {
  const cloze = { type: "cloze" as const, front: "{{c1::Paris}} is the capital of {{c2::France}}.", back: "Paris" };
  const provider = new MockProvider();
  const generate = t.mock.method(provider, "generate");
  const question = renderFront(cloze.front, false);
  const expected = expectedAnswer(cloze);

  const partial = await checkAnswer(provider, "demo", question, expected, "France");
  assert.equal(partial.verdict, "partial");
  assert.ok(partial.missing.includes("paris"));
  assert.deepEqual(generate.mock.calls[0].arguments[0].task, {
    kind: "grade", question, expected: "Paris; France", answer: "France",
  });

  const complete = await checkAnswer(provider, "demo", question, expected, "Paris and France");
  assert.equal(complete.verdict, "correct");
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

test("the database saves both Good ratings for a requeued card", async () => {
  const database = createMemoryDatabase();
  await database.put("decks", { id: card.deckId, name: "Biology", createdAt: card.createdAt });
  await database.saveCards(card.deckId, [card]);

  const schedule = nextSchedule(card, Rating.Good, start);
  const first: Review = { id: "first", cardId: card.id, reviewedAt: start.getTime(), rating: Rating.Good };
  assert.equal(await database.recordReview(card, schedule, first), true);

  const requeued = requeueReviewed([card], 0, { ...card, schedule }, first.reviewedAt)[1];
  assert.ok(requeued);
  const next = nextSchedule(requeued, Rating.Good, schedule.due);
  const second = { ...first, id: "second", reviewedAt: schedule.due.getTime() };
  assert.equal(await database.recordReview(requeued, next, second), true);
  assert.equal((await database.get("cards", card.id))?.schedule?.reps, 2);
  assert.deepEqual(await database.all("reviews"), [first, second]);
});
