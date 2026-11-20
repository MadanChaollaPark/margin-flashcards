import { InferenceSource } from "firebase/ai";
import { checkAnswer, type CheckedAnswer } from "../ai/grade";
import { createRuntime } from "../ai/runtime";
import { renderFront } from "../cards/cloze";
import type { Card, Review } from "../cards/schema";
import { dueAt, dueCards, intervalLabel, nextIntervals, nextSchedule, ratings } from "../srs/fsrs";
import { db } from "../storage/db";
import { cardRouteBadge, clearNotice, element, message, notify, showDemoBanner, watchDemoBanner } from "./shared";

const deckId = new URLSearchParams(location.search).get("deck");
const study = element("study");
const status = element("review-status");
const input = element<HTMLInputElement>("answer");
const check = element<HTMLButtonElement>("check");
const answerForm = element<HTMLFormElement>("answer-form");
const revealButton = element<HTMLButtonElement>("reveal");
const front = element("card-front");
const revealed = element("revealed");
const ratingGroup = element("ratings");
const feedback = element("feedback");
const progress = element<HTMLProgressElement>("progress");

let cards: Card[] = [];
let index = 0;
let checking = false;
let saving = false;
const sessionRatings = [0, 0, 0, 0];

function cardFront(card: Card, shown: boolean) {
  return card.type === "cloze" ? renderFront(card.front, shown) : card.front;
}

function showCard() {
  element("review-progress").textContent = `${index} of ${cards.length} complete`;
  progress.max = Math.max(1, cards.length);
  progress.value = index;
  const card = cards[index];
  if (!card) {
    study.hidden = element("shortcuts").hidden = true;
    element("summary").hidden = false;
    const count = sessionRatings.reduce((sum, value) => sum + value, 0);
    element("summary-count").textContent = `${count} ${count === 1 ? "card" : "cards"} reviewed.`;
    const tally = element("summary-ratings");
    tally.replaceChildren(...ratings.map(([rating, label]) => {
      const item = document.createElement("div");
      const title = document.createElement("dt");
      title.textContent = label;
      const value = document.createElement("dd");
      value.textContent = String(sessionRatings[rating - 1]);
      item.append(title, value);
      return item;
    }));
    element("summary-heading").focus();
    return;
  }

  front.textContent = cardFront(card, false);
  const link = element<HTMLAnchorElement>("show-source");
  link.hidden = !card.source?.url || !/^(https?|file):/iu.test(card.source.url);
  if (!link.hidden) {
    link.href = card.source!.url!;
    link.title = card.source?.title ?? "";
  }
  input.value = "";
  input.disabled = false;
  check.disabled = true;
  revealButton.disabled = false;
  answerForm.hidden = false;
  revealed.hidden = feedback.hidden = true;
  front.focus({ preventScroll: true });
}

function showFeedback(grade: CheckedAnswer) {
  const labels = { correct: "Correct", partial: "Partly correct", incorrect: "Incorrect" };
  const verdict = document.createElement("strong");
  verdict.textContent = grade.simulated ? `Simulated — ${labels[grade.verdict]}` : labels[grade.verdict];
  const header = document.createElement("div");
  header.className = "row feedback-heading";
  header.append(verdict);
  if (grade.source === InferenceSource.ON_DEVICE) {
    const route = document.createElement("span");
    route.className = "badge device";
    route.textContent = grade.simulated ? "Simulated · Graded on-device" : "Graded on-device";
    header.append(route);
  }
  feedback.dataset.verdict = grade.verdict;
  feedback.replaceChildren(header);
  if (grade.missing.length) {
    const title = document.createElement("p");
    title.textContent = `Missing: ${grade.missing.join(" · ")}`;
    feedback.append(title);
  }
  feedback.hidden = false;
}

function reveal(grade?: CheckedAnswer) {
  const card = cards[index];
  if (!card || !revealed.hidden) return;
  front.textContent = cardFront(card, true);
  element("card-back").textContent = card.back;
  element("generation-route").replaceChildren(cardRouteBadge(card.route));
  const response = input.value.trim();
  element("submitted-answer").hidden = !response;
  element("user-answer").textContent = response;
  answerForm.hidden = true;
  revealed.hidden = false;
  if (grade) showFeedback(grade);

  ratingGroup.replaceChildren(...nextIntervals(card).map(({ rating, label, milliseconds }) => {
    const button = document.createElement("button");
    const suggested = rating === grade?.suggestedRating;
    button.className = suggested ? "secondary suggested" : "secondary";
    button.type = "button";
    button.dataset.rating = String(rating);
    if (suggested) button.setAttribute("aria-description", "Suggested rating");
    button.textContent = label;
    const interval = document.createElement("span");
    interval.textContent = intervalLabel(milliseconds);
    button.append(interval);
    if (suggested) {
      const chip = document.createElement("span");
      chip.className = "suggestion-chip";
      chip.setAttribute("aria-hidden", "true");
      chip.textContent = "Suggested";
      button.append(chip);
    }
    button.addEventListener("click", () => { void rate(rating); });
    return button;
  }));
  front.focus({ preventScroll: true });
}

async function rate(rating: Review["rating"]) {
  if (saving || revealed.hidden || !cards[index]) return;
  const focusedRating = ratingGroup.querySelector<HTMLButtonElement>(":focus");
  saving = true;
  ratingGroup.inert = true;
  clearNotice();
  const card = cards[index];
  try {
    const now = new Date();
    const schedule = nextSchedule(card, rating, now);
    const recorded = await db.recordReview(card, schedule, {
      id: crypto.randomUUID(), cardId: card.id, reviewedAt: now.getTime(), rating,
    });
    if (recorded) sessionRatings[rating - 1]++;
    else notify("This card was already handled in another tab.");
    index++;
    showCard();
  } catch (error) {
    notify(message(error, "Could not save your rating."), true);
    ratingGroup.inert = false;
    if (document.activeElement === document.body) focusedRating?.focus();
  } finally {
    saving = false;
    ratingGroup.inert = false;
  }
}

input.addEventListener("input", () => { check.disabled = Boolean(check.hidden) || !input.value.trim(); });
revealButton.addEventListener("click", () => { if (!checking) reveal(); });
answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const card = cards[index];
  const answer = input.value.trim();
  if (check.hidden || checking || !card || !answer || !revealed.hidden) return;
  checking = input.disabled = check.disabled = revealButton.disabled = true;
  check.textContent = "Checking…";
  clearNotice();
  try {
    const { provider, config, mock } = await createRuntime();
    showDemoBanner(mock);
    const grade = await checkAnswer(provider, config.cloudModel, cardFront(card, false), card.back, answer);
    reveal(grade);
  } catch (error) {
    notify(message(error, "Could not check your answer."), true);
  } finally {
    checking = input.disabled = check.disabled = revealButton.disabled = false;
    check.textContent = "Check";
    if (!answerForm.hidden && document.activeElement === document.body) input.focus();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || checking || study.hidden) return;
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, button, a, [contenteditable]")) return;
  if (event.key === " " && revealed.hidden) {
    event.preventDefault();
    reveal();
  }
  if (event.key === "Enter" && !check.hidden && revealed.hidden && input.value.trim()) {
    event.preventDefault();
    answerForm.requestSubmit();
  }
  if (/^[1-4]$/u.test(event.key) && !revealed.hidden) {
    event.preventDefault();
    void rate(Number(event.key) as Review["rating"]);
  }
});

async function start() {
  const [all, deck] = await Promise.all([db.all("cards"), deckId ? db.get("decks", deckId) : undefined]);
  if (deckId) {
    element("all-due").hidden = false;
    if (!deck) {
      status.textContent = "This deck could not be found.";
      return;
    }
    document.querySelector("h1")!.textContent = deck.name;
    document.title = `${deck.name} review · Margin`;
  }
  cards = dueCards(all, deckId);
  if (!cards.length) {
    status.hidden = true;
    const next = all.filter((card) => !deckId || card.deckId === deckId)
      .reduce((earliest, card) => Math.min(earliest, dueAt(card)), Infinity);
    element("caught-up").hidden = false;
    if (Number.isFinite(next)) {
      const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(next);
      element("next-due").textContent = `Next review ${time}`;
    } else {
      element("empty-heading").textContent = "No flashcards yet";
      element("next-due").textContent = "Generate and save cards in the Margin side panel to start studying.";
    }
    return;
  }
  const canGrade = await createRuntime()
    .then(async ({ provider, mock }) => mock || (await provider.status()).nano === "available")
    .catch(() => false);
  if (!canGrade) {
    check.hidden = element("check-shortcut").hidden = true;
    input.placeholder = "On-device grading unavailable. Reveal and rate yourself.";
  }
  status.hidden = false;
  status.textContent = `${cards.length} ${cards.length === 1 ? "card" : "cards"} due`;
  status.className = "sr-only";
  study.hidden = element("session-progress").hidden = element("shortcuts").hidden = false;
  showCard();
}

void start().catch(() => { status.textContent = "Margin could not load your flashcards."; });

watchDemoBanner();
