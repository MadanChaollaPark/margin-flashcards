import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { JSDOM } from "jsdom";
import initSqlJs from "sql.js";
import type { Card, Deck } from "../../src/cards/schema";
import { buildApkg } from "../../src/export/apkg";
import { buildTsv } from "../../src/export/tsv";

const deck: Deck = { id: "bio", name: 'Biology::"Plant science"', createdAt: 1 };
const card: Card = {
  id: "example-basic", deckId: deck.id, type: "basic", createdAt: 1,
  front: '# Read "light" & <energy>\t中文', back: 'Line 1\nLine 2\r\n"quoted".',
  tags: ["plants", "light", "plants"],
  route: { source: "on_device", reason: "Short text.", ms: 0, tokensEst: 10 },
};
const cloze: Card = { ...card, id: "example-cloze", type: "cloze", front: "Plants absorb {{c1::light}}.", back: "Chlorophyll." };

test("Anki TSV headers map the deck, note type and tags, with escaped fields round-tripping", () => {
  const tsv = buildTsv([card, cloze], [deck]);
  const lines = tsv.trimEnd().split("\n");
  assert.deepEqual(lines.slice(0, 5), ["#separator:tab", "#html:true", "#deck column:3", "#notetype column:4", "#tags column:5"]);
  const rows = lines.slice(6).map((line) => line.split("\t").map((field) =>
    field.startsWith('"') ? field.slice(1, -1).replace(/""/gu, '"') : field,
  ));
  const dom = new JSDOM();
  try {
    const decode = (field: string) => {
      const span = dom.window.document.createElement("span");
      span.innerHTML = field.replace(/<br>/gu, "\n");
      return span.textContent;
    };
    assert.deepEqual([decode(rows[0][0]), decode(rows[0][1]), ...rows[0].slice(2)],
      [card.front, card.back.replace(/\r\n/gu, "\n"), deck.name, "Basic", "plants light"]);
    assert.equal(rows[1][0], cloze.front);
    assert.equal(rows[1][3], "Cloze");
  } finally {
    dom.window.close();
  }
});

test("Anki package contains readable SQLite notes, cards, models and decks", async () => {
  const files = unzipSync(await buildApkg([card, cloze], [deck]));
  assert.equal(strFromU8(files.media), "{}");
  const SQL = await initSqlJs();
  const database = new SQL.Database(files["collection.anki2"]);
  try {
    const [[count]] = database.exec("SELECT count(*) FROM notes")[0].values;
    assert.equal(count, 2);
    const [basic, deletion] = database.exec("SELECT mid, flds, tags FROM notes ORDER BY id")[0].values;
    assert.equal(basic[1], '# Read "light" &amp; &lt;energy&gt;&#9;中文\x1fLine 1<br>Line 2<br>"quoted".');
    assert.equal(basic[2], " plants light ");
    assert.equal(deletion[1], `${cloze.front}\x1f${cloze.back}`);
    assert.notEqual(basic[0], deletion[0]);
    const [[version, modelJson, deckJson]] = database.exec("SELECT ver, models, decks FROM col")[0].values;
    assert.equal(version, 11);
    const models = JSON.parse(String(modelJson));
    assert.equal(models[String(basic[0])].name, "Basic");
    assert.equal(models[String(deletion[0])].type, 1);
    const decks = JSON.parse(String(deckJson));
    const [[deckId]] = database.exec("SELECT did FROM cards GROUP BY did HAVING count(*) = 2")[0].values;
    assert.equal(decks[String(deckId)].name, deck.name);
    assert.equal(database.exec("PRAGMA integrity_check")[0].values[0][0], "ok");
  } finally {
    database.close();
  }
});

test("Anki package has one card per cloze deletion number", async () => {
  const twoDeletions = { ...cloze, id: "two-deletions", front: "{{c1::Paris}} is in {{c2::France}}." };
  const gap = { ...cloze, id: "gap", front: "{{c1::a}} and {{c3::b}}" };
  const repeated = { ...cloze, id: "repeated", front: "{{c1::Chlorophyll::pigment}} absorbs {{c1::light}}." };
  const cards = [card, twoDeletions, gap, repeated];
  const files = unzipSync(await buildApkg(cards, [deck]));
  const SQL = await initSqlJs();
  const database = new SQL.Database(files["collection.anki2"]);
  try {
    const [[noteCount]] = database.exec("SELECT count(*) FROM notes")[0].values;
    assert.equal(noteCount, cards.length);
    const rows = database.exec(`
      SELECT notes.guid, cards.ord, cards.did, cards.due
      FROM notes JOIN cards ON cards.nid = notes.id
      ORDER BY cards.id
    `)[0].values;
    const deckId = rows[0][2];
    assert.deepEqual(rows, [
      [card.id, 0, deckId, 1],
      [twoDeletions.id, 0, deckId, 2],
      [twoDeletions.id, 1, deckId, 2],
      [gap.id, 0, deckId, 3],
      [gap.id, 2, deckId, 3],
      [repeated.id, 0, deckId, 4],
    ]);
    const [[cardCount, uniqueIds]] = database.exec("SELECT count(*), count(DISTINCT id) FROM cards")[0].values;
    assert.equal(uniqueIds, cardCount);
    const [[orphans]] = database.exec("SELECT count(*) FROM cards WHERE nid NOT IN (SELECT id FROM notes)")[0].values;
    assert.equal(orphans, 0);
    const [[config]] = database.exec("SELECT conf FROM col")[0].values;
    assert.equal(JSON.parse(String(config)).nextPos, cards.length + 1);
    assert.equal(database.exec("PRAGMA integrity_check")[0].values[0][0], "ok");
  } finally {
    database.close();
  }
});
