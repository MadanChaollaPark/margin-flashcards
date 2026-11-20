import assert from "node:assert/strict";
import { test } from "node:test";
import { Rating } from "ts-fsrs";
import type { Card } from "../../src/cards/schema";
import { cardToDoc, docToCard, syncBackup } from "../../src/firebase/sync";
import { nextSchedule } from "../../src/srs/fsrs";
import { createMemoryDatabase } from "../../src/storage/db";

const createdAt = Date.UTC(2026, 10, 20);
const card: Card = {
  id: "card-1",
  deckId: "bio",
  createdAt,
  type: "cloze",
  front: "{{c1::Chlorophyll}} absorbs light.",
  back: "Chlorophyll",
  tags: ["plants", "photosynthesis"],
  source: { url: "https://example.invalid/#:~:text=Private%20excerpt", title: "Private source" },
  route: { source: "on_device", reason: "Kept local", tokensEst: 20, ms: 100 },
};

test("Firestore mapping stores only study content, deck membership, and scheduling dates as numbers", () => {
  const schedule = nextSchedule(card, Rating.Good, new Date(createdAt));
  const { id, source, route, ...studyContent } = card;
  const data = cardToDoc({ ...card, schedule });

  assert.deepEqual(data, {
    ...studyContent,
    schedule: { ...schedule, due: schedule.due.getTime(), last_review: schedule.last_review?.getTime() },
  });
  assert.deepEqual(docToCard(id, data), { id, ...studyContent, schedule });
});

test("an unreviewed card without tags restores without a fabricated schedule or route", () => {
  const { id, source, route, tags, schedule, ...studyContent } = card;
  assert.deepEqual(cardToDoc({ id, ...studyContent }), studyContent);
  assert.deepEqual(docToCard(id, studyContent), { id, ...studyContent });
});

test("restoring adds missing decks and cards and preserves local edits", async () => {
  const database = createMemoryDatabase();
  const deck = { id: card.deckId, name: "Biology", createdAt };
  const empty = { id: "empty", name: "Empty deck", createdAt };
  const savedCard = docToCard(card.id, cardToDoc(card));

  assert.deepEqual(await database.restoreLibrary([deck, empty], [savedCard]), { decks: 2, cards: 1 });
  await database.put("cards", { ...savedCard, back: "Local edit" });
  assert.deepEqual(await database.restoreLibrary([deck, empty], [savedCard]), { decks: 0, cards: 0 });
  assert.equal((await database.get("cards", card.id))?.back, "Local edit");
});

test("Privacy mode blocks backup and restore even with the backup setting enabled", async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { storage: { local: { get: async () => ({ privacyMode: true, firestoreBackup: true }) } } },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "chrome", original);
    else Reflect.deleteProperty(globalThis, "chrome");
  });

  await assert.rejects(syncBackup("write"), /unavailable in Privacy mode/u);
  await assert.rejects(syncBackup("restore"), /unavailable in Privacy mode/u);
  assert.equal(await syncBackup("write", true), undefined);
});
