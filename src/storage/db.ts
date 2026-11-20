import type { QueuedJob } from "../ai/queue";
import type { Card, CardDraft, Deck, Review } from "../cards/schema";
import { dedupe } from "../cards/dedupe";
import type { Schedule } from "../srs/fsrs";

interface Records {
  cards: Card;
  decks: Deck;
  reviews: Review;
  queue: QueuedJob;
}

type Store = keyof Records;
const STORES = ["cards", "decks", "reviews", "queue"] as const;

export interface Database {
  get<S extends Store>(store: S, id: string): Promise<Records[S] | undefined>;
  all<S extends Store>(store: S): Promise<Records[S][]>;
  put<S extends Store>(store: S, value: Records[S]): Promise<void>;
  delete(store: Store, id: string): Promise<void>;
  saveCards(deckId: string, cards: Card[]): Promise<number>;
  updateCard(id: string, deckId: string, draft: CardDraft): Promise<Card>;
  deleteCard(id: string): Promise<void>;
  recordReview(card: Card, schedule: Schedule, review: Review): Promise<boolean>;
  deleteDeck(id: string): Promise<void>;
  restoreLibrary(decks: Deck[], cards: Card[]): Promise<{ decks: number; cards: number }>;
  completeQueuedJob(id: string, cards: Card[]): Promise<void>;
  updateQueuedJob(entry: QueuedJob): Promise<void>;
}

function sameSchedule(current: Card | undefined, expected: Card): current is Card {
  return !!current && current.schedule?.reps === expected.schedule?.reps &&
    current.schedule?.last_review?.getTime() === expected.schedule?.last_review?.getTime();
}

function editedCard(current: Card | undefined, deck: Deck | undefined, draft: CardDraft): Card {
  if (!current) throw new Error("This card was deleted.");
  if (!deck) throw new Error("Choose an existing deck to save this card.");
  return { ...current, ...draft, tags: draft.tags, deckId: deck.id };
}

export function createMemoryDatabase(): Database {
  const stores: { [S in Store]: Map<string, Records[S]> } = {
    cards: new Map(), decks: new Map(), reviews: new Map(), queue: new Map(),
  };
  return {
    async get(store, id) { return structuredClone(stores[store].get(id)); },
    async all(store) { return Array.from(stores[store].values(), (value) => structuredClone(value)); },
    async put(store, value) { stores[store].set(value.id, structuredClone(value)); },
    async delete(store, id) { stores[store].delete(id); },
    async saveCards(deckId, cards) {
      if (!stores.decks.has(deckId)) throw new Error("Choose an existing deck to save these cards.");
      const fresh = dedupe(cards, [...stores.cards.values()].filter((card) => card.deckId === deckId));
      for (const card of fresh) stores.cards.set(card.id, structuredClone({ ...card, deckId }));
      return fresh.length;
    },
    async updateCard(id, deckId, draft) {
      const card = editedCard(stores.cards.get(id), stores.decks.get(deckId), draft);
      stores.cards.set(id, structuredClone(card));
      return structuredClone(card);
    },
    async deleteCard(id) {
      stores.cards.delete(id);
      for (const review of stores.reviews.values()) if (review.cardId === id) stores.reviews.delete(review.id);
    },
    async recordReview(card, schedule, review) {
      const current = stores.cards.get(card.id);
      if (!sameSchedule(current, card)) return false;
      stores.cards.set(card.id, structuredClone({ ...current, schedule }));
      stores.reviews.set(review.id, structuredClone(review));
      return true;
    },
    async deleteDeck(id) {
      const cards = [...stores.cards.values()].filter((card) => card.deckId === id);
      const ids = new Set(cards.map((card) => card.id));
      stores.decks.delete(id);
      for (const card of cards) stores.cards.delete(card.id);
      for (const review of stores.reviews.values()) if (ids.has(review.cardId)) stores.reviews.delete(review.id);
      for (const entry of stores.queue.values()) if (entry.job.deckId === id) stores.queue.delete(entry.id);
    },
    async restoreLibrary(decks, cards) {
      const added = { decks: 0, cards: 0 };
      for (const deck of decks) {
        if (stores.decks.has(deck.id)) continue;
        stores.decks.set(deck.id, structuredClone(deck));
        added.decks++;
      }
      for (const card of cards) {
        if (stores.cards.has(card.id) || !stores.decks.has(card.deckId)) continue;
        stores.cards.set(card.id, structuredClone(card));
        added.cards++;
      }
      return added;
    },
    async completeQueuedJob(id, cards) {
      const entry = stores.queue.get(id);
      if (!entry) return;
      const copies = structuredClone(dedupe(cards, [...stores.cards.values()].filter((card) => card.deckId === entry.job.deckId)));
      for (const card of copies) stores.cards.set(card.id, card);
      stores.queue.delete(id);
    },
    async updateQueuedJob(entry) {
      if (stores.queue.has(entry.id)) stores.queue.set(entry.id, structuredClone(entry));
    },
  };
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Database transaction aborted."));
  });
}

function createIndexedDatabase(): Database {
  let opening: Promise<IDBDatabase> | undefined;

  function connect(): Promise<IDBDatabase> {
    if (!opening) {
      const operation = indexedDB.open("margin", 1);
      operation.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!operation.result.objectStoreNames.contains(store)) {
            operation.result.createObjectStore(store, { keyPath: "id" });
          }
        }
      };
      opening = request(operation).then((connection) => {
        connection.onversionchange = () => {
          connection.close();
          opening = undefined;
        };
        return connection;
      }).catch((error: unknown) => {
        opening = undefined;
        throw error;
      });
    }
    return opening;
  }

  async function write<T>(
    stores: Store[],
    apply: (transaction: IDBTransaction) => T | Promise<T>,
    notifyBackup = true,
  ): Promise<T> {
    const transaction = (await connect()).transaction(stores, "readwrite");
    const done = completion(transaction);
    let result: T;
    try {
      result = await apply(transaction);
    } catch (error) {
      try { transaction.abort(); } catch { /* The transaction may have already aborted. */ }
      await done.catch(() => {});
      throw error;
    }
    await done;
    if (notifyBackup && (stores.includes("cards") || stores.includes("decks"))) {
      void chrome.runtime.sendMessage({ type: "margin.backupChanged" }).catch(() => {});
    }
    return result;
  }

  return {
    async get(store, id) {
      const transaction = (await connect()).transaction(store, "readonly");
      return request(transaction.objectStore(store).get(id));
    },
    async all(store) {
      const transaction = (await connect()).transaction(store, "readonly");
      return request(transaction.objectStore(store).getAll());
    },
    async put(store, value) {
      await write([store], (transaction) => { transaction.objectStore(store).put(value); });
    },
    async delete(store, id) {
      await write([store], (transaction) => { transaction.objectStore(store).delete(id); });
    },
    saveCards(deckId, candidates) {
      return write(["decks", "cards"], async (transaction) => {
        const cards = transaction.objectStore("cards");
        const [deck, existing] = await Promise.all([
          request<Deck | undefined>(transaction.objectStore("decks").get(deckId)),
          request<Card[]>(cards.getAll()),
        ]);
        if (!deck) throw new Error("Choose an existing deck to save these cards.");
        const fresh = dedupe(candidates, existing.filter((card) => card.deckId === deckId));
        for (const card of fresh) cards.put({ ...card, deckId });
        return fresh.length;
      });
    },
    updateCard(id, deckId, draft) {
      return write(["cards", "decks"], async (transaction) => {
        const cards = transaction.objectStore("cards");
        const [current, deck] = await Promise.all([
          request<Card | undefined>(cards.get(id)),
          request<Deck | undefined>(transaction.objectStore("decks").get(deckId)),
        ]);
        const card = editedCard(current, deck, draft);
        cards.put(card);
        return card;
      });
    },
    deleteCard(id) {
      return write(["cards", "reviews"], async (transaction) => {
        const reviews = transaction.objectStore("reviews");
        for (const review of await request<Review[]>(reviews.getAll())) {
          if (review.cardId === id) reviews.delete(review.id);
        }
        transaction.objectStore("cards").delete(id);
      });
    },
    recordReview(card, schedule, review) {
      return write(["cards", "reviews"], async (transaction) => {
        const cards = transaction.objectStore("cards");
        const current = await request<Card | undefined>(cards.get(card.id));
        if (!sameSchedule(current, card)) return false;
        cards.put({ ...current, schedule });
        transaction.objectStore("reviews").put(review);
        return true;
      });
    },
    async deleteDeck(id) {
      await write(["decks", "cards", "reviews", "queue"], async (transaction) => {
        const cards = transaction.objectStore("cards");
        const reviews = transaction.objectStore("reviews");
        const queue = transaction.objectStore("queue");
        const [allCards, allReviews, entries] = await Promise.all([
          request<Card[]>(cards.getAll()), request<Review[]>(reviews.getAll()), request<QueuedJob[]>(queue.getAll()),
        ]);
        const ids = new Set(allCards.filter((card) => card.deckId === id).map((card) => card.id));
        for (const cardId of ids) cards.delete(cardId);
        for (const review of allReviews) if (ids.has(review.cardId)) reviews.delete(review.id);
        for (const entry of entries) if (entry.job.deckId === id) queue.delete(entry.id);
        transaction.objectStore("decks").delete(id);
      });
    },
    restoreLibrary(decks, cards) {
      return write(["decks", "cards"], async (transaction) => {
        const deckStore = transaction.objectStore("decks");
        const cardStore = transaction.objectStore("cards");
        const [deckKeys, cardKeys] = await Promise.all([
          request(deckStore.getAllKeys()), request(cardStore.getAllKeys()),
        ]);
        const deckIds = new Set(deckKeys);
        const cardIds = new Set(cardKeys);
        const added = { decks: 0, cards: 0 };
        for (const deck of decks) {
          if (deckIds.has(deck.id)) continue;
          deckStore.add(deck);
          deckIds.add(deck.id);
          added.decks++;
        }
        for (const card of cards) {
          if (cardIds.has(card.id) || !deckIds.has(card.deckId)) continue;
          cardStore.add(card);
          cardIds.add(card.id);
          added.cards++;
        }
        return added;
      }, false);
    },
    async completeQueuedJob(id, cards) {
      await write(["cards", "queue"], async (transaction) => {
        const queue = transaction.objectStore("queue");
        const store = transaction.objectStore("cards");
        const [entry, existing] = await Promise.all([
          request<QueuedJob | undefined>(queue.get(id)), request<Card[]>(store.getAll()),
        ]);
        if (!entry) return;
        const fresh = dedupe(cards, existing.filter((card) => card.deckId === entry.job.deckId));
        for (const card of fresh) store.put(card);
        queue.delete(id);
      });
    },
    async updateQueuedJob(entry) {
      await write(["queue"], async (transaction) => {
        const queue = transaction.objectStore("queue");
        if (await request(queue.getKey(entry.id))) queue.put(entry);
      });
    },
  };
}

export const db = typeof indexedDB === "undefined" ? createMemoryDatabase() : createIndexedDatabase();
