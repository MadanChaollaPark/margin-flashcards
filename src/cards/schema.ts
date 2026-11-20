import type { InferenceSource } from "firebase/ai";
import type { Schedule } from "../srs/fsrs";

export const MAX_CARDS = 50;
export const MAX_FRONT_LENGTH = 500;
export const MAX_BACK_LENGTH = 1_500;

export interface CardDraft {
  type: "basic" | "cloze";
  front: string;
  back: string;
  tags?: string[];
}

export interface Route {
  source: InferenceSource;
  reason: string;
  tokensEst: number;
  ms: number;
  localBytes?: number;
  simulated?: boolean;
  runId?: string;
}

export interface Card extends CardDraft {
  id: string;
  deckId: string;
  createdAt: number;
  route?: Route;
  schedule?: Schedule;
  source?: { url?: string; title?: string };
}

export interface Deck {
  id: string;
  name: string;
  createdAt: number;
}

export interface Review {
  id: string;
  cardId: string;
  reviewedAt: number;
  rating: 1 | 2 | 3 | 4;
}

export function cardTags(tags: string[] = []): string[] {
  return [...new Set(tags.flatMap((tag) => tag.split(/\s+/u)).filter(Boolean))];
}

export function validate(value: unknown): CardDraft | undefined {
  if (typeof value !== "object" || value === null) return;
  const { front, back, tags, type = "basic" } = value as Partial<CardDraft>;
  if (type !== "basic" && type !== "cloze") return;
  if (typeof front !== "string" || typeof back !== "string") return;

  const question = front.trim();
  const answer = back.trim();
  if (!question || !answer || question.length > MAX_FRONT_LENGTH || answer.length > MAX_BACK_LENGTH) return;
  if (type === "cloze" && !question.match(/\{\{c1::([^{}]+)\}\}/u)?.[1].trim()) return;
  const cleanTags = Array.isArray(tags)
    ? cardTags(tags.filter((tag) => typeof tag === "string")).filter((tag) => tag.length <= 80).slice(0, 16)
    : [];
  return { type, front: question, back: answer, ...(cleanTags.length && { tags: cleanTags }) };
}
