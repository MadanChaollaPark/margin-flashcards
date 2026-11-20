import { cardTags, type Card, type Deck } from "../cards/schema";

export function fieldHtml(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/\r\n?|\n/gu, "<br>").replace(/\t/gu, "&#9;").replace(/\u001f/gu, "&#31;");
}

function tsvField(text: string): string {
  return /[\t\r\n"]|^#/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function buildTsv(cards: Card[], decks: Deck[]): string {
  const names = new Map(decks.map(({ id, name }) => [id, name]));
  const headers = [
    "#separator:tab", "#html:true", "#deck column:3", "#notetype column:4", "#tags column:5",
    "#columns:Front or Text\tBack or Extra\tDeck\tNote Type\tTags",
  ];
  const rows = cards.map((card) => [
    fieldHtml(card.front), fieldHtml(card.back), names.get(card.deckId) ?? "Default",
    card.type === "cloze" ? "Cloze" : "Basic", cardTags(card.tags).join(" "),
  ].map(tsvField).join("\t"));
  return [...headers, ...rows].join("\n") + "\n";
}
