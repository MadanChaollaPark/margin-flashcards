import { strToU8, zipSync } from "fflate";
import initSqlJs from "sql.js";
import type { Card, Deck } from "../cards/schema";
import { fieldHtml } from "./tsv";
import { cardTags } from "../cards/schema";

const basicId = 1795132800001;
const clozeId = 1795132800002;

// Anki's schema version 11 is the database format for collection.anki2.
const schema = `
CREATE TABLE col (
  id INTEGER PRIMARY KEY, crt INTEGER NOT NULL, mod INTEGER NOT NULL, scm INTEGER NOT NULL,
  ver INTEGER NOT NULL, dty INTEGER NOT NULL, usn INTEGER NOT NULL, ls INTEGER NOT NULL,
  conf TEXT NOT NULL, models TEXT NOT NULL, decks TEXT NOT NULL, dconf TEXT NOT NULL, tags TEXT NOT NULL
);
CREATE TABLE notes (
  id INTEGER PRIMARY KEY, guid TEXT NOT NULL, mid INTEGER NOT NULL, mod INTEGER NOT NULL,
  usn INTEGER NOT NULL, tags TEXT NOT NULL, flds TEXT NOT NULL, sfld INTEGER NOT NULL,
  csum INTEGER NOT NULL, flags INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE cards (
  id INTEGER PRIMARY KEY, nid INTEGER NOT NULL, did INTEGER NOT NULL, ord INTEGER NOT NULL,
  mod INTEGER NOT NULL, usn INTEGER NOT NULL, type INTEGER NOT NULL, queue INTEGER NOT NULL,
  due INTEGER NOT NULL, ivl INTEGER NOT NULL, factor INTEGER NOT NULL, reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL, left INTEGER NOT NULL, odue INTEGER NOT NULL, odid INTEGER NOT NULL,
  flags INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE revlog (
  id INTEGER PRIMARY KEY, cid INTEGER NOT NULL, usn INTEGER NOT NULL, ease INTEGER NOT NULL,
  ivl INTEGER NOT NULL, lastIvl INTEGER NOT NULL, factor INTEGER NOT NULL, time INTEGER NOT NULL, type INTEGER NOT NULL
);
CREATE TABLE graves (usn INTEGER NOT NULL, oid INTEGER NOT NULL, type INTEGER NOT NULL);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_notes_csum ON notes (csum);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_revlog_cid ON revlog (cid);
`;

function noteModel(cloze: boolean, mod: number) {
  const [front, back] = cloze ? ["Text", "Back Extra"] : ["Front", "Back"];
  return {
    id: cloze ? clozeId : basicId,
    name: cloze ? "Cloze" : "Basic",
    type: cloze ? 1 : 0,
    mod, usn: -1, sortf: 0, did: 1, tags: [], vers: [],
    css: ".card { font-family: system-ui, sans-serif; font-size: 20px; text-align: center; } .cloze { font-weight: bold; color: #32836c; }",
    flds: [front, back].map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: "Arial", size: 20 })),
    tmpls: [{
      name: cloze ? "Cloze" : "Card 1", ord: 0,
      qfmt: cloze ? "{{cloze:Text}}" : "{{Front}}",
      afmt: cloze ? "{{cloze:Text}}<br>{{Back Extra}}" : "{{FrontSide}}<hr id=answer>{{Back}}",
      bqfmt: "", bafmt: "", did: null,
    }],
    req: [[0, "all", [0]]],
    latexPre: "", latexPost: "",
  };
}

function newDeck(id: number, name: string, mod: number) {
  return {
    id, name, mod, usn: -1, desc: "", dyn: 0, conf: 1, collapsed: false, browserCollapsed: false,
    newToday: [0, 0], revToday: [0, 0], lrnToday: [0, 0], timeToday: [0, 0], extendNew: 0, extendRev: 0,
  };
}

async function checksum(text: string): Promise<number> {
  const hash = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return new DataView(hash).getUint32(0);
}

let sql: ReturnType<typeof initSqlJs> | undefined;

export async function buildApkg(cards: Card[], decks: Deck[]): Promise<Uint8Array> {
  const runtime = typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime : undefined;
  sql ??= initSqlJs(runtime ? { locateFile: (name) => runtime.getURL(name), useOldExtensionFunctions: false } : undefined)
    .catch((error) => { sql = undefined; throw error; });
  const SQL = await sql;

  const now = Date.now();
  const mod = Math.floor(now / 1000);
  const deckIds = new Map<string, number>();
  const byName = new Map([["default", newDeck(1, "Default", mod)]]);
  for (const deck of decks) {
    let name = "";
    for (const part of deck.name.split("::").map((part) => part.trim()).filter(Boolean)) {
      name = name ? `${name}::${part}` : part;
      const key = name.toLowerCase();
      if (!byName.has(key)) byName.set(key, newDeck(now + byName.size, name, mod));
    }
    deckIds.set(deck.id, byName.get(name.toLowerCase())?.id ?? 1);
  }
  const models = { [basicId]: noteModel(false, mod), [clozeId]: noteModel(true, mod) };
  const ankiDecks = Object.fromEntries([...byName.values()].map((deck) => [deck.id, deck]));
  const deckConfig = {
    id: 1, name: "Default", mod, usn: -1, maxTaken: 60, autoplay: true, timer: 0, replayq: true,
    new: { delays: [1, 10], ints: [1, 4, 7], initialFactor: 2500, order: 1, perDay: 20, bury: false },
    rev: { perDay: 200, ease4: 1.3, fuzz: 0.05, ivlFct: 1, maxIvl: 36500, hardFactor: 1.2, bury: false },
    lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 0 },
  };

  const checksums = await Promise.all(cards.map((card) => checksum(card.front)));
  const database = new SQL.Database();
  try {
    database.run(schema);
    database.run("INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '{}')", [
      mod, now, now, JSON.stringify({ nextPos: cards.length + 1, curDeck: 1, activeDecks: [1], curModel: basicId }),
      JSON.stringify(models), JSON.stringify(ankiDecks), JSON.stringify({ 1: deckConfig }),
    ]);
    database.run("BEGIN");
    const note = database.prepare("INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')");
    const row = database.prepare("INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')");
    try {
      cards.forEach((card, index) => {
        const id = now + index;
        const tags = cardTags(card.tags);
        note.run([
          id, card.id, card.type === "cloze" ? clozeId : basicId, mod, tags.length ? ` ${tags.join(" ")} ` : "",
          `${fieldHtml(card.front)}\x1f${fieldHtml(card.back)}`, card.front, checksums[index],
        ]);
        row.run([id, id, deckIds.get(card.deckId) ?? 1, mod, index + 1]);
      });
    } finally {
      note.free();
      row.free();
    }
    database.run("COMMIT");
    return zipSync({ "collection.anki2": database.export(), media: strToU8("{}") });
  } finally {
    database.close();
  }
}
