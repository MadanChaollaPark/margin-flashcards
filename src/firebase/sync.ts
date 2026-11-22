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

export interface BackupState {
  uid: string;
  docs: Record<string, string>;
}

export interface BackupEntry {
  key: string;
  data: object;
}

export function parseBackupState(value: unknown): BackupState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !("uid" in value) || typeof value.uid !== "string" || !("docs" in value)) return;

  const { uid, docs } = value;
  if (!docs || typeof docs !== "object" || Array.isArray(docs)) return;
  const prototype = Object.getPrototypeOf(docs);
  if ((prototype !== Object.prototype && prototype !== null) ||
      !Object.values(docs).every((fingerprint) => typeof fingerprint === "string")) return;
  return { uid, docs: docs as BackupState["docs"] };
}

export async function planBackup<Entry extends BackupEntry>(
  uid: string, entries: Entry[], previous: BackupState | undefined, full: boolean,
): Promise<{ changed: Entry[]; fingerprints: Record<string, string> }> {
  const encoder = new TextEncoder();
  const fingerprints = Object.fromEntries(await Promise.all(entries.map(async ({ key, data }) => {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(data)));
    const fingerprint = Array.from(new Uint8Array(digest, 0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return [key, fingerprint] as const;
  })));
  const changed = full || previous?.uid !== uid
    ? entries
    : entries.filter(({ key }) => fingerprints[key] !== previous.docs[key]);
  return { changed, fingerprints };
}

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

export function docToDeck(id: string, data: unknown): Deck {
  if (typeof data !== "object" || data === null) {
    throw new Error("A backed-up deck has invalid data.");
  }
  const { name, createdAt } = data as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    throw new Error("A backed-up deck has invalid data.");
  }
  return { id, name, createdAt };
}

export function parseRestoredLibrary(
  deckDocs: { id: string; data: unknown }[],
  cardDocs: { id: string; data: unknown }[],
): { decks: Deck[]; cards: Card[]; skipped: number } {
  const decks: Deck[] = [];
  const cards: Card[] = [];
  let skipped = 0;
  for (const { id, data } of deckDocs) {
    try {
      decks.push(docToDeck(id, data));
    } catch {
      skipped++;
    }
  }
  for (const { id, data } of cardDocs) {
    try {
      cards.push(docToCard(id, data as CardDoc));
    } catch {
      skipped++;
    }
  }
  return { decks, cards, skipped };
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
      const [deckSnapshot, cardSnapshot] = await Promise.all([getDocs(decksRef), getDocs(cardsRef)]);
      const { decks, cards, skipped } = parseRestoredLibrary(
        deckSnapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
        cardSnapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
      );
      await requireBackup();
      if (skipped > 0) console.warn(`Skipped ${skipped} invalid backed-up items during restore.`);
      return { ...(await db.restoreLibrary(decks, cards)), skipped };
    }

    const [decks, cards, { firestoreBackupState }] = await Promise.all([
      db.all("decks"), db.all("cards"), chrome.storage.local.get<{ firestoreBackupState?: unknown }>("firestoreBackupState"),
    ]);
    const writes = [
      ...decks.map(({ id, name, createdAt }) => ({ key: `decks/${id}`, ref: doc(decksRef, id), data: { name, createdAt } })),
      ...cards.map((card) => ({ key: `cards/${card.id}`, ref: doc(cardsRef, card.id), data: cardToDoc(card) })),
    ];
    const full = !automatic;
    const previous = parseBackupState(firestoreBackupState);
    const { changed, fingerprints } = await planBackup(uid, writes, previous, full);
    const progress = full || previous?.uid !== uid ? {} : Object.fromEntries(
      Object.entries(previous.docs).filter(([key]) => Object.hasOwn(fingerprints, key)),
    );

    for (let i = 0; i < changed.length; i += 500) {
      const entries = changed.slice(i, i + 500);
      const batch = writeBatch(firestore);
      for (const { ref, data } of entries) batch.set(ref, data);
      await requireBackup();
      await batch.commit();
      for (const { key } of entries) progress[key] = fingerprints[key];
      if (i + entries.length < changed.length) {
        await chrome.storage.local.set({ firestoreBackupState: { uid, docs: progress } });
      }
    }
    await chrome.storage.local.set({ firestoreBackupState: { uid, docs: fingerprints } });
    return { decks: decks.length, cards: cards.length };
  });
}
