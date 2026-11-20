import { dueCards } from "../srs/fsrs";
import { db } from "../storage/db";
import { listDecks } from "../storage/decks";
import { element, notify, watchDemoBanner } from "./shared";

const open = element<HTMLButtonElement>("open-panel");
let windowId: number | undefined;
open.disabled = true;
void chrome.windows.getCurrent().then(({ id }) => {
  if (id === undefined) throw new Error("No active browser window.");
  windowId = id;
  open.disabled = false;
}).catch(showPanelError);

open.addEventListener("click", () => {
  if (windowId !== undefined) void chrome.sidePanel.open({ windowId }).then(() => window.close()).catch(showPanelError);
});

function showPanelError() {
  notify("The side panel could not open. Try again from a browser tab.", true);
}

async function refresh() {
  const [cards, decks] = await Promise.all([db.all("cards"), listDecks()]);
  const due = dueCards(cards);
  element("due-total").textContent = `${due.length} ${due.length === 1 ? "card" : "cards"} due`;
  element("review-due").textContent = due.length ? `Review ${due.length} due` : "Open review";
  const counts = new Map<string, number>();
  for (const card of due) counts.set(card.deckId, (counts.get(card.deckId) ?? 0) + 1);
  element("deck-list").replaceChildren(...decks.map((deck) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `review.html?deck=${encodeURIComponent(deck.id)}`;
    link.target = "_blank";
    link.textContent = deck.name;
    const count = document.createElement("span");
    const deckDue = counts.get(deck.id) ?? 0;
    count.textContent = String(deckDue);
    count.className = deckDue ? "due-count" : "due-count zero";
    count.setAttribute("aria-hidden", "true");
    link.setAttribute("aria-description", `${deckDue} due`);
    link.className = "row";
    link.append(count);
    item.append(link);
    return item;
  }));

}

const update = () => { void refresh().catch(() => notify("Could not load your cards.", true)); };
window.addEventListener("focus", update);
update();

watchDemoBanner();
