import assert from "node:assert/strict";
import { test } from "node:test";
import { Rating } from "ts-fsrs";
import type { Card } from "../../src/cards/schema";
import { cardToDoc, docToCard, docToDeck, parseBackupState, parseRestoredLibrary, planBackup, syncBackup } from "../../src/firebase/sync";
import { nextSchedule } from "../../src/srs/fsrs";
import { createMemoryDatabase, planRestore } from "../../src/storage/db";

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

const deckDoc = { id: card.deckId, data: { name: "Biology", createdAt } };
const invalidDeckDoc = { id: "blank-name", data: { name: "  ", createdAt } };
const cardDoc = { id: card.id, data: cardToDoc(card) };
const legacyClozeDoc = {
  id: "legacy-cloze",
  data: { ...cardDoc.data, front: "{{c1::Paris}} is the capital of {{c2::}}" },
};
const { schedule: scheduleDoc } = cardToDoc({ ...card, schedule: nextSchedule(card, Rating.Good, new Date(createdAt)) });
const invalidScheduleDoc = {
  id: "invalid-schedule",
  data: { ...cardDoc.data, schedule: { ...scheduleDoc, state: 7 } },
};

test("restored library parsing skips and counts invalid deck and card documents", () => {
  const parsed = parseRestoredLibrary(
    [invalidDeckDoc, deckDoc, { id: "null-deck", data: null }],
    [legacyClozeDoc, cardDoc, invalidScheduleDoc],
  );

  assert.deepEqual(parsed, {
    decks: [docToDeck(deckDoc.id, deckDoc.data)],
    cards: [docToCard(cardDoc.id, cardDoc.data)],
    skipped: 4,
  });
});

test("restored library parsing keeps all valid documents in input order", () => {
  const otherDeck = { id: "another-deck", data: { name: "Another deck", createdAt } };
  const otherCard = { id: "another-card", data: { ...cardDoc.data, deckId: otherDeck.id } };

  assert.deepEqual(parseRestoredLibrary([deckDoc, otherDeck], [cardDoc, otherCard]), {
    decks: [docToDeck(deckDoc.id, deckDoc.data), docToDeck(otherDeck.id, otherDeck.data)],
    cards: [docToCard(cardDoc.id, cardDoc.data), docToCard(otherCard.id, otherCard.data)],
    skipped: 0,
  });
});

test("deck mapping rejects invalid data and preserves a valid name as stored", () => {
  for (const data of [{ createdAt }, { name: "Biology", createdAt: Infinity }, null, "Biology"]) {
    assert.throws(() => docToDeck(deckDoc.id, data), /invalid data/u);
  }
  const data = { name: " Biology ", createdAt };
  assert.deepEqual(docToDeck(deckDoc.id, data), { id: deckDoc.id, ...data });
});

test("restoring a parsed backup adds its valid deck and card despite three invalid documents", async () => {
  const database = createMemoryDatabase();
  const { decks, cards, skipped } = parseRestoredLibrary(
    [deckDoc, invalidDeckDoc], [cardDoc, legacyClozeDoc, invalidScheduleDoc],
  );

  assert.equal(skipped, 3);
  assert.deepEqual(await database.restoreLibrary(decks, cards), { decks: 1, cards: 1 });
  assert.deepEqual(await database.get("decks", deckDoc.id), docToDeck(deckDoc.id, deckDoc.data));
  assert.deepEqual(await database.get("cards", cardDoc.id), docToCard(cardDoc.id, cardDoc.data));
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

test("restoring merges a backed-up deck into a local deck with the same name", async () => {
  const database = createMemoryDatabase();
  const local = { id: "local-es", name: "Spanish", createdAt };
  const backup = { id: "old-es", name: "  spanish ", createdAt };
  const savedCard = { ...card, deckId: backup.id };
  await database.put("decks", local);

  assert.deepEqual(await database.restoreLibrary([backup], [savedCard]), { decks: 0, cards: 1 });
  assert.deepEqual(await database.all("decks"), [local]);
  assert.equal((await database.get("cards", savedCard.id))?.deckId, local.id);
  assert.deepEqual(await database.restoreLibrary([backup], [savedCard]), { decks: 0, cards: 0 });
});

test("restoring merges same-name decks within one backup into the first one", async () => {
  const database = createMemoryDatabase();
  const first = { id: "first", name: "  World\tHistory ", createdAt };
  const second = { id: "second", name: "world history", createdAt };
  const firstCard = { ...card, deckId: first.id };
  const secondCard = { ...card, id: "other-card", deckId: second.id };

  assert.deepEqual(await database.restoreLibrary([first, second], [firstCard, secondCard]), { decks: 1, cards: 2 });
  assert.deepEqual(await database.all("decks"), [first]);
  assert.equal((await database.get("cards", firstCard.id))?.deckId, first.id);
  assert.equal((await database.get("cards", secondCard.id))?.deckId, first.id);
});

test("deck ID matches take precedence over name matches on restore", async () => {
  const database = createMemoryDatabase();
  const inbox = { id: "default", name: "Inbox", createdAt };
  const renamed = { id: "renamed", name: "Renamed", createdAt };
  const backup = { ...inbox, name: renamed.name };
  const savedCard = { ...card, deckId: backup.id };
  await database.put("decks", inbox);
  await database.put("decks", renamed);

  assert.deepEqual(await database.restoreLibrary([backup], [savedCard]), { decks: 0, cards: 1 });
  assert.deepEqual(await database.all("decks"), [inbox, renamed]);
  assert.equal((await database.get("cards", savedCard.id))?.deckId, inbox.id);
});

test("planRestore remaps a __proto__ deck ID without mutating inputs", () => {
  const local = { id: "local-bio", name: "Biology", createdAt };
  const backup = { id: "__proto__", name: "biology", createdAt };
  const added = { id: "new", name: "Physics", createdAt };
  const savedCard = { ...card, deckId: backup.id };
  const localDecks = [local];
  const localCardIds = ["existing-card"];
  const decks = [backup, added];
  const cards = [
    savedCard,
    { ...savedCard, deckId: added.id },
    { ...savedCard, id: "existing-card" },
    { ...savedCard, id: "orphan", deckId: "missing" },
  ];
  const inputs = [localDecks, localCardIds, decks, cards] as const;
  const before = structuredClone(inputs);

  assert.deepEqual(planRestore(...inputs), { decks: [added], cards: [{ ...savedCard, deckId: local.id }] });
  assert.deepEqual(inputs, before);
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

function cardEntry(card: Card) {
  return { key: `cards/${card.id}`, data: cardToDoc(card) };
}

const uid = "backup-user";
const secondCard = { ...card, id: "card-2", front: "{{c1::Roots}} absorb water.", back: "Roots" };
const deckEntry = { key: `decks/${card.deckId}`, data: { name: "Biology", createdAt } };
const entries = [deckEntry, cardEntry(card), cardEntry(secondCard)];

test("the first automatic backup plans every entry and an unchanged backup plans no writes", async () => {
  const { changed, fingerprints } = await planBackup(uid, entries, undefined, false);
  assert.deepEqual(changed, entries);
  assert.deepEqual(Object.keys(fingerprints), entries.map(({ key }) => key));
  for (const fingerprint of Object.values(fingerprints)) assert.match(fingerprint, /^[a-f0-9]{32}$/u);

  const next = await planBackup(uid, entries, { uid, docs: fingerprints }, false);
  assert.deepEqual(next, { changed: [], fingerprints });
});

test("rating one card and changing another card's tags only uploads those cards", async () => {
  const { fingerprints } = await planBackup(uid, entries, undefined, false);
  const reviewed = cardEntry({ ...card, schedule: nextSchedule(card, Rating.Good, new Date(createdAt)) });
  const retagged = cardEntry({ ...secondCard, tags: ["botany"] });
  const next = await planBackup(uid, [deckEntry, reviewed, retagged], { uid, docs: fingerprints }, false);

  assert.deepEqual(next.changed, [reviewed, retagged]);
});

test("editing either side of a card only uploads that card", async () => {
  const { fingerprints } = await planBackup(uid, entries, undefined, false);
  for (const edit of [{ front: "{{c1::Chlorophyll}} absorbs sunlight." }, { back: "Chlorophyll absorbs light." }]) {
    const edited = cardEntry({ ...card, ...edit });
    const next = await planBackup(uid, [deckEntry, edited, cardEntry(secondCard)], { uid, docs: fingerprints }, false);
    assert.deepEqual(next.changed, [edited]);
  }
});

test("automatic backups upload new entries and drop deleted cards from the fingerprints", async () => {
  const { fingerprints } = await planBackup(uid, entries, undefined, false);
  const newDeck = { key: "decks/other", data: { name: "Another deck", createdAt } };
  const newCard = cardEntry({ ...card, id: "card-3", deckId: "other" });
  const current = [deckEntry, newDeck, cardEntry(card), newCard];
  const next = await planBackup(uid, current, { uid, docs: fingerprints }, false);

  assert.deepEqual(next.changed, [newDeck, newCard]);
  assert.deepEqual(Object.keys(next.fingerprints), current.map(({ key }) => key));
});

test("manual backups and backups under a different uid plan every entry", async () => {
  const { fingerprints } = await planBackup(uid, entries, undefined, false);
  const previous = { uid, docs: fingerprints };

  assert.deepEqual((await planBackup(uid, entries, previous, true)).changed, entries);
  assert.deepEqual((await planBackup("different-user", entries, previous, false)).changed, entries);
});

test("malformed stored backup states are treated as missing", () => {
  for (const state of [undefined, null, [], {}, { uid: 1, docs: {} }, { uid }, { uid, docs: null },
    { uid, docs: "invalid" }, { uid, docs: [] }, { uid, docs: { "cards/card-1": 1 } }]) {
    assert.equal(parseBackupState(state), undefined);
  }
  const valid = { uid, docs: { "cards/card-1": "fingerprint" } };
  assert.deepEqual(parseBackupState(valid), valid);
});
