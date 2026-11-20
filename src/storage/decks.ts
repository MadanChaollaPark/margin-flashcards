import type { Deck } from "../cards/schema";
import { db } from "./db";

const byName = (a: Deck, b: Deck) => a.name.localeCompare(b.name);

export async function listDecks(): Promise<Deck[]> {
  const initialize = async () => {
    const decks = await db.all("decks");
    if (decks.length) return decks.sort(byName);
    const deck = { id: "default", name: "Inbox", createdAt: Date.now() };
    await db.put("decks", deck);
    return [deck];
  };
  return navigator.locks.request("margin-decks", initialize);
}

export async function setDeckName(name: string, existing?: Deck): Promise<Deck> {
  const clean = name.replace(/\s+/gu, " ").trim();
  if (!clean || clean.length > 80) throw new Error("Enter a deck name of 1–80 characters.");
  return navigator.locks.request("margin-decks", async () => {
    const decks = await db.all("decks");
    if (existing && !decks.some(({ id }) => id === existing.id)) throw new Error("This deck was deleted.");
    if (decks.some((deck) => deck.id !== existing?.id && deck.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error("A deck with that name already exists.");
    }
    const deck = { id: existing?.id ?? crypto.randomUUID(), name: clean, createdAt: existing?.createdAt ?? Date.now() };
    await db.put("decks", deck);
    return deck;
  });
}
