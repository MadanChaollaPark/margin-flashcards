import { createEmptyCard, fsrs, Rating, type Card as FsrsCard, type Grade } from "ts-fsrs";
import type { Card } from "../cards/schema";

export type Schedule = FsrsCard;

const scheduler = fsrs({ enable_fuzz: false });
export const LEARN_AHEAD_MS = 20 * 60_000;
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

// Copy the queue and insert a short learning step into the remaining cards in due order.
export function requeueReviewed(queue: Card[], index: number, reviewed: Card, now: number): Card[] {
  const nextQueue = [...queue];
  const due = dueAt(reviewed);
  if (due - now <= LEARN_AHEAD_MS) {
    const position = queue.findIndex((card, i) => i > index && dueAt(card) > due);
    nextQueue.splice(position === -1 ? nextQueue.length : position, 0, reviewed);
  }
  return nextQueue;
}

function roundedInterval(milliseconds: number): { amount: number; unit: "minute" | "hour" | "day" | "month" | "year" } {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  if (minutes < 60) return { amount: minutes, unit: "minute" };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { amount: hours, unit: "hour" };
  const days = Math.max(1, Math.round(minutes / 1_440));
  if (days < 30) return { amount: days, unit: "day" };
  const months = Math.round((days / 30) * 10) / 10;
  if (months < 12) return { amount: months, unit: "month" };
  return { amount: Math.round((days / 365) * 10) / 10, unit: "year" };
}

const intervalSuffix = { minute: "m", hour: "h", day: "d", month: "mo", year: "y" };

export function intervalLabel(milliseconds: number): string {
  const { amount, unit } = roundedInterval(milliseconds);
  return `${amount}${intervalSuffix[unit]}`;
}

export function intervalDescription(milliseconds: number): string {
  const { amount, unit } = roundedInterval(milliseconds);
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}
