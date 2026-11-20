import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from "ts-fsrs";
import type { Card } from "../cards/schema";

export type Schedule = FsrsCard;

const scheduler = fsrs({ enable_fuzz: false });
export const ratings = [
  [Rating.Again, "Again"], [Rating.Hard, "Hard"], [Rating.Good, "Good"], [Rating.Easy, "Easy"],
] as const;

export function nextSchedule(card: Pick<Card, "createdAt" | "schedule">, rating: Grade, now = new Date()): Schedule {
  return scheduler.next(card.schedule ?? createEmptyCard(card.createdAt), now, rating).card;
}

export function nextIntervals(card: Pick<Card, "createdAt" | "schedule">, now = new Date()) {
  const previews = scheduler.repeat(card.schedule ?? createEmptyCard(card.createdAt), now);
  return ratings.map(([rating, label]) => ({
    rating, label, milliseconds: previews[rating].card.due.getTime() - now.getTime(),
  }));
}

export function dueAt(card: Card): number {
  return card.schedule?.due.getTime() ?? card.createdAt;
}

export function dueCards(cards: Card[], deckId?: string | null, now = Date.now()): Card[] {
  return cards.filter((card) => (!deckId || card.deckId === deckId) && dueAt(card) <= now)
    .sort((a, b) => dueAt(a) - dueAt(b));
}

export function intervalLabel(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1_440)}d`;
}
