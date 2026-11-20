import { indexedDBLocalPersistence, initializeAuth, signInAnonymously } from "firebase/auth/web-extension";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore/lite";
import { validate, type Card, type Deck } from "../cards/schema";
import type { Schedule } from "../srs/fsrs";
import { db } from "../storage/db";
import { readSettings } from "../storage/settings";
import { shouldUseMock } from "./config";
import { initializeFirebase } from "./init";

type ScheduleDoc = Omit<Schedule, "due" | "last_review"> & { due: number; last_review?: number };
type CardDoc = Pick<Card, "type" | "front" | "back" | "tags" | "deckId" | "createdAt"> & {
  schedule?: ScheduleDoc;
};
type BackupAction = "write" | "restore";

export function cardToDoc(card: Card): CardDoc {
  const { type, front, back, tags, deckId, createdAt, schedule } = card;
  const data: CardDoc = { type, front, back, deckId, createdAt, ...(tags && { tags: [...tags] }) };
  if (schedule) {
    const { due, last_review, stability, difficulty, scheduled_days, learning_steps, reps, lapses, state } = schedule;
    data.schedule = {
      due: due.getTime(), stability, difficulty, scheduled_days, learning_steps, reps, lapses, state,
      ...(last_review && { last_review: last_review.getTime() }),
    };
  }
  return data;
}

export function docToCard(id: string, data: CardDoc): Card {
  const draft = validate(data);
  if (!draft || typeof data.deckId !== "string" || !data.deckId || !Number.isFinite(data.createdAt)) {
    throw new Error("A backed-up card has invalid data.");
  }
  const card: Card = { ...draft, id, deckId: data.deckId, createdAt: data.createdAt };
  if (data.schedule !== undefined) {
    const { due, last_review, stability, difficulty, scheduled_days, learning_steps, reps, lapses, state } = data.schedule;
    if (![due, stability, difficulty, scheduled_days, learning_steps, reps, lapses].every(Number.isFinite) ||
        ![0, 1, 2, 3].includes(state) || (last_review !== undefined && !Number.isFinite(last_review))) {
      throw new Error("A backed-up card has an invalid review schedule.");
    }
    card.schedule = {
      due: new Date(due), last_review: last_review === undefined ? undefined : new Date(last_review),
      stability, difficulty, scheduled_days, learning_steps, reps, lapses, state,
    };
  }
  return card;
}

async function requireBackup() {
  const settings = await readSettings();
  if (settings.privacyMode) throw new Error("Firestore backup is unavailable in Privacy mode.");
  if (shouldUseMock(settings.mock)) throw new Error("Connect a Firebase project and use Live mode to back up decks.");
  if (!settings.firestoreBackup) throw new Error("Turn on Firestore backup to continue.");
  return settings;
}

export async function syncBackup(action: BackupAction, automatic = false) {
  // Skip automatic jobs before touching Firebase when the backup is disabled.
  if (automatic) {
    const settings = await readSettings();
    if (settings.privacyMode || shouldUseMock(settings.mock) || !settings.firestoreBackup) return;
  } else {
    await requireBackup();
  }
  return navigator.locks.request("margin-firestore-backup", async () => {
    const app = initializeFirebase(await requireBackup());
    const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
    await auth.authStateReady();
    await requireBackup();
    const { uid } = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const firestore = getFirestore(app);
    const cardsRef = collection(firestore, "users", uid, "cards");
    const decksRef = collection(firestore, "users", uid, "decks");

    if (action === "restore") {
      await requireBackup();
      const [decks, cards] = await Promise.all([getDocs(decksRef), getDocs(cardsRef)]);
      const localDecks = decks.docs.map((deck): Deck => {
        const { name, createdAt } = deck.data();
        if (typeof name !== "string" || !name.trim() || !Number.isFinite(createdAt)) {
          throw new Error("A backed-up deck has invalid data.");
        }
        return { id: deck.id, name, createdAt };
      });
      const localCards = cards.docs.map((card) => docToCard(card.id, card.data() as CardDoc));
      await requireBackup();
      return db.restoreLibrary(localDecks, localCards);
    }

    const [decks, cards] = await Promise.all([db.all("decks"), db.all("cards")]);
    const writes = [
      ...decks.map(({ id, name, createdAt }) => ({ ref: doc(decksRef, id), data: { name, createdAt } })),
      ...cards.map((card) => ({ ref: doc(cardsRef, card.id), data: cardToDoc(card) })),
    ];
    for (let i = 0; i < writes.length; i += 500) {
      const batch = writeBatch(firestore);
      for (const { ref, data } of writes.slice(i, i + 500)) batch.set(ref, data);
      await requireBackup();
      await batch.commit();
    }
    return { decks: decks.length, cards: cards.length };
  });
}
