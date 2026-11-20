import { renderFront } from "../cards/cloze";
import { MAX_BACK_LENGTH, MAX_FRONT_LENGTH, validate, type Card, type Deck } from "../cards/schema";
import { dueAt } from "../srs/fsrs";
import { db } from "../storage/db";
import { listDecks } from "../storage/decks";
import { cardRouteBadge, element, fillTags, message, notify, watchDemoBanner } from "./shared";

const search = element<HTMLInputElement>("search");
const deckFilter = element<HTMLSelectElement>("deck-filter");
const list = element("library-cards");
const count = element("library-count");
const template = element<HTMLTemplateElement>("library-card");
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
let decks: Deck[] = [];
let entries: { card: Card; row: HTMLElement; text: string }[] = [];
let loading = false;

function filterCards() {
  const terms = search.value.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/u);
  let visible = 0;
  for (const { card, row, text } of entries) {
    row.hidden = (deckFilter.value !== "" && card.deckId !== deckFilter.value) ||
      !terms.every((term) => text.includes(term));
    if (!row.hidden) visible++;
  }
  count.textContent = !entries.length ? "No saved cards yet." : !visible ? "No cards match your search or deck filter."
    : `${visible} ${visible === 1 ? "card" : "cards"}`;
}

function cardEntry(card: Card) {
  const row = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const heading = row.querySelector("h2")!;
  heading.textContent = card.type === "cloze" ? renderFront(card.front, false) : card.front;
  heading.id = `card-${card.id}`;
  row.setAttribute("aria-labelledby", heading.id);
  row.querySelector(".preview-back")!.textContent = card.back;
  fillTags(row.querySelector("ul")!, card.tags);
  row.querySelector(".card-deck")!.textContent = decks.find(({ id }) => id === card.deckId)?.name ?? "Deck unavailable";
  const due = new Date(dueAt(card));
  const time = row.querySelector("time")!;
  time.dateTime = due.toISOString();
  time.textContent = dateFormat.format(due);
  const route = cardRouteBadge(card.route);
  route.open = true;
  row.querySelector(".library-route")!.append(route);

  const form = row.querySelector("form")!;
  const front = form.elements.namedItem("front") as HTMLTextAreaElement;
  const back = form.elements.namedItem("back") as HTMLTextAreaElement;
  const tags = form.elements.namedItem("tags") as HTMLInputElement;
  const deck = form.elements.namedItem("deck") as HTMLSelectElement;
  const error = form.querySelector("p")!;
  deck.id = `deck-${card.id}`;
  form.querySelector<HTMLLabelElement>(".edit-deck-label")!.htmlFor = deck.id;
  front.maxLength = MAX_FRONT_LENGTH;
  back.maxLength = MAX_BACK_LENGTH;
  if (card.type === "cloze") front.parentElement!.querySelector("span")!.textContent = "Front (cloze)";
  const copy = row.querySelector<HTMLElement>(".card-copy")!;
  const edit = row.querySelector<HTMLButtonElement>(".edit-card")!;
  const remove = row.querySelector<HTMLButtonElement>(".delete-card")!;
  form.id = `edit-${card.id}`;
  edit.setAttribute("aria-controls", form.id);
  function toggleEditor(open: boolean) {
    if (open) {
      front.value = card.front;
      back.value = card.back;
      tags.value = card.tags?.join(" ") ?? "";
      deck.replaceChildren(...decks.map(({ name, id }) => new Option(name, id)));
      deck.value = card.deckId;
      error.hidden = true;
    }
    form.hidden = !open;
    copy.hidden = open;
    edit.setAttribute("aria-expanded", String(open));
    edit.hidden = open;
    (open ? front : edit).focus();
  }

  edit.addEventListener("click", () => toggleEditor(true));
  form.querySelector(".cancel-edit")!.addEventListener("click", () => toggleEditor(false));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const draft = validate({ type: card.type, front: front.value, back: back.value, tags: [tags.value] });
    if (!draft) {
      error.textContent = card.type === "cloze" ? "Enter a front with {{c1::answer}} and a back." : "Enter a front and back.";
      error.hidden = false;
      return;
    }
    row.inert = true;
    error.hidden = true;
    try {
      const saved = cardEntry(await db.updateCard(card.id, deck.value, draft));
      entries = entries.map((entry) => entry.card.id === card.id ? saved : entry);
      row.replaceWith(saved.row);
      filterCards();
      (saved.row.hidden ? search : saved.row.querySelector<HTMLButtonElement>(".edit-card"))?.focus();
      notify("Card saved.");
    } catch (failure) {
      error.textContent = message(failure, "Could not save this card.");
      error.hidden = false;
    } finally {
      row.inert = false;
    }
  });

  remove.addEventListener("click", async () => {
    if (!confirm("Delete this card and its review history?")) return;
    row.inert = true;
    try {
      await db.deleteCard(card.id);
      entries = entries.filter((entry) => entry.card.id !== card.id);
      row.remove();
      filterCards();
      search.focus();
      notify("Card deleted.");
    } catch (failure) {
      notify(message(failure, "Could not delete this card."), true);
    } finally {
      row.inert = false;
    }
  });

  const text = [card.front, card.back, ...(card.tags ?? [])].join(" ").normalize("NFKC").toLocaleLowerCase();
  return { card, row, text };
}

async function loadCards() {
  const editing = "form:not([hidden]), [inert]";
  if (loading || list.querySelector(editing)) return;
  const previous = entries;
  loading = true;
  try {
    const [all, availableDecks] = await Promise.all([db.all("cards"), listDecks()]);
    if (entries !== previous || list.querySelector(editing)) return;
    decks = availableDecks;
    const selection = deckFilter.value;
    deckFilter.replaceChildren(new Option("All decks", ""), ...decks.map(({ name, id }) => new Option(name, id)));
    deckFilter.value = decks.some(({ id }) => id === selection) ? selection : "";
    entries = all.sort((a, b) => b.createdAt - a.createdAt).map(cardEntry);
    list.replaceChildren(...entries.map(({ row }) => row));
    filterCards();
  } catch (failure) {
    count.textContent = message(failure, "Could not load your cards.");
  } finally {
    loading = false;
  }
}

search.addEventListener("input", filterCards);
deckFilter.addEventListener("change", filterCards);
document.addEventListener("visibilitychange", () => { if (!document.hidden) void loadCards(); });
void loadCards();
watchDemoBanner();
