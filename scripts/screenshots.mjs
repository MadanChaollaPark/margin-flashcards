import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { CELL_BIOLOGY_CARDS, CELL_BIOLOGY_PASSAGE, CELL_BIOLOGY_TITLE } from "../src/ai/demoSamples.ts";
import { nextSchedule } from "../src/srs/fsrs.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "submission/screenshots");
const profile = await mkdtemp(join(tmpdir(), "margin-shots-"));
const dist = join(root, "dist");

const cellBiology = [
  ...CELL_BIOLOGY_CARDS.map(({ front, back, tags, type }) => [front, back, tags.join(" "), type]),
  ["What can cross a phospholipid bilayer without a transport protein?", "Small nonpolar molecules such as oxygen and carbon dioxide.", "membranes transport"],
  ["Which way does water move during osmosis?", "Across a selectively permeable membrane toward the side with higher effective solute concentration.", "transport"],
  ["Where are ribosomal subunits assembled?", "In the nucleolus.", "organelles"],
  ["Which cytoskeletal filaments form the mitotic spindle?", "Microtubules.", "cell-division"],
  ["During which phase is nuclear DNA replicated?", "S phase of interphase.", "cell-division"],
  ["What separates during anaphase of mitosis?", "Sister chromatids separate and move toward opposite spindle poles.", "cell-division"],
  ["How does a plant cell divide its cytoplasm?", "Vesicles form a cell plate that grows outward and becomes a new dividing wall.", "cell-division"],
];

const spanishVerbs = [
  ["What is the first-person singular present of tener?", "tengo", "present irregular"],
  ["What is the preterite nosotros form of hablar?", "hablamos", "preterite"],
  ["How do you say “she used to read” in Spanish?", "Ella leía.", "imperfect"],
  ["What is the gerund of dormir?", "durmiendo", "gerund irregular"],
  ["How do you say “I went to the library” in Spanish?", "Fui a la biblioteca.", "preterite irregular"],
  ["Which verb expresses a temporary location?", "estar", "present"],
];

const articleTitle = "From membranes to ATP";
const paragraphs = CELL_BIOLOGY_PASSAGE.split("\n\n");
const atpExcerpt = paragraphs[2].split(". ")[0] + ".";
const article = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${articleTitle}</title>
<style>
  *{box-sizing:border-box} body{margin:0;color:#242541;background:#f9f8f5;font:17px/1.64 system-ui,sans-serif}
  header{padding:18px 56px;border-bottom:1px solid #dedeea;color:#4241a2;font-weight:750;letter-spacing:.06em}
  main{padding:32px 56px} h1{font:600 67px/.99 Georgia,serif;letter-spacing:-.045em;margin:0;max-width:650px}
  .section{color:#4241a2;font:750 13px system-ui;letter-spacing:.12em;text-transform:uppercase;margin:0 0 13px}
  .intro{font:23px/1.45 Georgia,serif;max-width:640px;color:#50516a;margin:17px 0 22px}
  h2{font:600 26px Georgia,serif;margin:22px 0 7px} p{margin:0 0 12px}
  .excerpt{border-left:4px solid #5b5bf7;background:#eeedff;padding:14px 20px;margin:22px 0}
</style>
<header>Cell Biology</header>
<main>
  <p class="section">Cell structure and metabolism</p>
  <h1>${articleTitle}</h1>
  <p class="intro">How cells control what crosses their membranes and turn nutrients into usable energy.</p>
  <p class="excerpt">${atpExcerpt}</p>
  <h2>A selectively permeable barrier</h2>
  <p>${paragraphs[0]}</p>
  <h2>How transport works</h2>
  <p>${paragraphs[1]}</p>
  <h2>How cells make ATP</h2>
  <p>${paragraphs[2]}</p>
  <p>${paragraphs[3]}</p>
</main></html>`;

function library() {
  const now = Date.now();
  const day = 86_400_000;
  const decks = [
    { id: "biology", name: "Cell Biology", createdAt: now - 10 * day },
    { id: "spanish", name: "Spanish Verbs", createdAt: now - 9 * day },
  ];
  const cards = [];
  const reviews = [];
  for (const [deck, rows] of [[decks[0], cellBiology], [decks[1], spanishVerbs]]) {
    rows.forEach(([front, back, tags, type = "basic"], index) => {
      const local = index % 5 !== 4 && index !== 7;
      const sensitive = deck.id === "biology" && index === 5;
      const reason = sensitive ? "Sensitive content stays on-device."
        : local ? "Fits on-device budget — Firebase AI Logic preferred Gemini Nano"
        : "This input exceeds the on-device token budget.";
      const card = {
        id: `${deck.id}-${String(index).padStart(2, "0")}`,
        deckId: deck.id, type, front, back, tags: tags.split(" "),
        createdAt: deck.createdAt + index * 60_000,
        ...(deck.id === "biology" && {
          source: index < CELL_BIOLOGY_CARDS.length ? { title: CELL_BIOLOGY_TITLE } : { title: "Cell Biology study notes" },
        }),
        route: {
          source: local ? "on_device" : "in_cloud", reason: `Simulated — ${reason}`, simulated: true,
          tokensEst: local ? 640 + index * 28 : 7_100 + index * 51,
          ms: local ? 480 + index * 37 : 1_240 + index * 61,
          runId: `${deck.id}-${index}`, localBytes: local ? 2_410 + index * 103 : 0,
        },
      };
      if (index > 0 && index % 2 === 1) {
        for (const [reviewIndex, reviewedAt] of [now - 6 * day, now - 2 * day].entries()) {
          card.schedule = nextSchedule(card, 3, new Date(reviewedAt));
          reviews.push({ id: `${card.id}-${reviewIndex}`, cardId: card.id, reviewedAt, rating: 3 });
        }
      }
      cards.push(card);
    });
  }
  // Keep the example queued during the capture so the badge appears beside the generated cards.
  const queue = [{
    id: "membrane-reading", createdAt: now - 30_000, attempts: 1, state: "queued",
    nextAttemptAt: now + 3_600_000,
    reason: "Simulated — Offline. Queued until a connection is available.",
    job: {
      deckId: "biology", source: { title: "Membrane transport handout" },
      input: { kind: "pdf", mimeType: "application/pdf", data: "JVBERi0=" },
    },
  }];
  return { cards, decks, reviews, queue };
}

async function seed(page, records) {
  await page.evaluate(async (records) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("margin", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        for (const store of Object.keys(records)) request.result.createObjectStore(store, { keyPath: "id" });
      };
    });
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(Object.keys(records), "readwrite");
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
        for (const [key, rows] of Object.entries(records)) {
          const store = transaction.objectStore(key);
          store.clear();
          for (const row of rows) store.put(row);
        }
      });
    } finally {
      database.close();
    }
  }, records);
}

const shot = (page, name, options = {}) => page.screenshot({
  ...options, path: join(output, `${name}.png`), animations: "disabled",
});

async function renderCover(page) {
  const [logo, panel, review] = await Promise.all([
    readFile(join(root, "assets/icon.svg"), "base64"),
    readFile(join(output, "01-sidepanel-generated.png"), "base64"),
    readFile(join(output, "04-review-graded.png"), "base64"),
  ]);
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Margin · Cover</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; width: 1500px; height: 1000px; overflow: hidden;
        background: linear-gradient(110deg, #201859b8, #073a465e), linear-gradient(110deg, #5b5bf7, #14b8a6);
        color: white; font-family: system-ui, sans-serif;
      }
      main { position: absolute; top: 50%; left: 88px; transform: translateY(-50%); }
      .logo { display: block; width: 106px; height: 106px; filter: drop-shadow(0 9px 18px #18174755); }
      h1 { margin: 18px 0 26px; font-size: 138px; line-height: 1; letter-spacing: -.065em; }
      p { margin: 0; max-width: 475px; font-size: 42px; line-height: 1.18; letter-spacing: -.027em; }
      strong { display: block; margin-bottom: 8px; font-weight: 680; }
      ul { display: flex; gap: 9px; margin: 38px 0 0; padding: 0; list-style: none; }
      li { padding: 10px 15px; border-radius: 100px; font-size: 20px; font-weight: 700; }
      .device { background: #d8f8ee; color: #116052; }
      .cloud { background: #e7efff; color: #2857a0; }
      .private { background: #f0e8ff; color: #683ba2; }
      .screenshot {
        display: block; position: absolute; border: 1px solid #ffffff90; border-radius: 18px;
        box-shadow: 0 35px 64px #14224e66, 0 8px 20px #14224e44;
      }
      .panel { left: 726px; top: 130px; width: 270px; transform: rotate(-4deg); }
      .review { left: 1036px; top: 425px; width: 420px; transform: rotate(4deg); }
    </style>
    <main>
      <img class="logo" alt="" src="data:image/svg+xml;base64,${logo}">
      <h1>Margin</h1>
      <p><strong>Learn what you read.</strong> Private by default, cloud when it counts.</p>
      <ul><li class="device">On-device · Gemini Nano</li><li class="cloud">Cloud · Gemini</li><li class="private">Kept local</li></ul>
    </main>
    <img class="screenshot panel" alt="Margin side panel with generated flashcards" src="data:image/png;base64,${panel}">
    <img class="screenshot review" alt="Margin review with on-device answer feedback" src="data:image/png;base64,${review}">
  </html>`);
  await page.locator("img").evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  await shot(page, "cover", { scale: "css" });
}

try {
  await mkdir(output, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, colorScheme: "light", deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  try {
    const [existing] = context.serviceWorkers();
    const worker = existing ?? await context.waitForEvent("serviceworker");
    const origin = `chrome-extension://${new URL(worker.url()).host}`;
    await worker.evaluate(() => chrome.storage.local.set({ mock: true }));
    async function pageAt(path, width, height) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height });
      await page.goto(`${origin}/${path}`);
      await expect(page.getByText("DEMO MODE (simulated AI)", { exact: true })).toBeVisible();
      return page;
    }

    const panel = await pageAt("sidepanel.html", 420, 900);
    await expect(panel.getByRole("heading", { name: "Welcome to Margin" })).toBeVisible();
    await shot(panel, "07-welcome");
    const records = library();
    await seed(panel, { decks: records.decks });
    await panel.reload();
    await panel.getByRole("button", { name: "Try a sample" }).click();
    await panel.getByLabel("Save to deck").selectOption("biology");
    await panel.getByRole("button", { name: "Generate" }).click();
    await expect(panel.locator(".card")).toHaveCount(CELL_BIOLOGY_CARDS.length);
    await panel.setViewportSize({ width: 420, height: 930 });
    await shot(panel, "01-sidepanel-generated");

    const heroHeight = 765;
    const hero = await context.newPage();
    await hero.setViewportSize({ width: 1280, height: heroHeight });
    const articlePage = await context.newPage();
    await articlePage.setViewportSize({ width: 860, height: heroHeight });
    await articlePage.setContent(article);
    await panel.setViewportSize({ width: 420, height: heroHeight });
    const [reading, extension] = await Promise.all([articlePage.screenshot(), panel.screenshot()]);
    await hero.setContent(`<!doctype html><meta charset="utf-8"><title>Margin · Cell biology</title>
      <style>*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:860px 420px}
      img{display:block;width:100%;height:${heroHeight}px}section{box-shadow:-1px 0 0 #cdd7cd,-14px 0 28px #1e382018}</style>
      <img alt="Cell membrane article" src="data:image/png;base64,${reading.toString("base64")}">
      <section><img alt="Margin side panel with flashcards" src="data:image/png;base64,${extension.toString("base64")}"></section>`);
    await hero.locator("img").evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
    await shot(hero, "00-hero", { scale: "css" });

    await seed(panel, records);
    await panel.setViewportSize({ width: 420, height: 900 });
    await panel.reload();
    await panel.getByLabel("Save to deck").selectOption("biology");
    await panel.getByLabel("Source", { exact: true }).selectOption("paste");
    await panel.getByLabel("Notes").fill("Lab notes are internal use only. Membrane channels regulate ion flow across the lipid bilayer.");
    await panel.getByRole("button", { name: "Generate" }).click();
    const badge = panel.locator(".card summary.private").first();
    await badge.click();
    await expect(panel.getByText("Simulated — Sensitive content stays on-device.").first()).toBeVisible();
    await worker.evaluate(() => chrome.storage.local.set({ modeOverride: "only-cloud" }));
    await panel.getByRole("button", { name: "Edit capture" }).click();
    await panel.getByLabel("Notes").fill("Aquaporins are proteins that let water cross a cell membrane.");
    await panel.getByRole("button", { name: "Generate" }).click();
    await expect(panel.locator(".card summary.cloud")).toBeVisible();
    await panel.locator(".card summary.private").click();
    await shot(panel, "02-route-reasons");
    await worker.evaluate(() => chrome.storage.local.set({ modeOverride: "auto" }));

    const review = await pageAt("review.html?deck=biology", 880, 720);
    await expect(review.getByRole("heading", { name: cellBiology[0][0], exact: true })).toBeVisible();
    await shot(review, "03-review-question");
    await review.getByLabel("Your answer").fill("ATP energy");
    await review.getByRole("button", { name: "Check", exact: true }).click();
    await expect(review.getByText("Simulated — Partly correct", { exact: true })).toBeVisible();
    await shot(review, "04-review-graded");
    await renderCover(hero);
    await review.emulateMedia({ colorScheme: "dark" });
    await review.reload();
    await review.getByLabel("Your answer").fill("Glucose");
    await review.getByRole("button", { name: "Check", exact: true }).click();
    await expect(review.getByText("Simulated — Incorrect", { exact: true })).toBeVisible();
    await shot(review, "10-review-dark");

    const options = await pageAt("options.html", 980, 880);
    await expect(options.getByText("Simulated on-device activity")).toBeVisible();
    await expect(options.getByText(/6,000 estimated tokens/u)).toBeVisible();
    await options.getByRole("switch", { name: "Privacy mode" }).check();
    await expect(options.getByText("Simulated · Kept local", { exact: true })).toBeVisible();
    await expect(options.getByRole("heading", { name: "Diagnostics" })).toBeInViewport();
    await expect(options.locator("#diagnostic-nano")).not.toHaveText("Checking…");
    await options.locator("#toast").evaluate((toast) => { toast.textContent = ""; });
    await shot(options, "05-options-privacy-stats");

    const popup = await pageAt("popup.html", 352, 400);
    await expect(popup.getByRole("link", { name: "Spanish Verbs" })).toBeVisible();
    await shot(popup, "06-popup");

    await options.getByLabel("Deck to export").selectOption("biology");
    const [download] = await Promise.all([
      options.waitForEvent("download"),
      options.getByRole("button", { name: "Export .apkg" }).click(),
    ]);
    if (download.suggestedFilename() !== "Cell Biology.apkg") throw new Error("Unexpected export name.");
    await expect(options.getByText("Exported 15 cards.", { exact: true })).toBeVisible();
    await options.evaluate(() => window.scrollTo(0, 0));
    await expect(options.getByText("DEMO MODE (simulated AI)", { exact: true })).toBeInViewport();
    await shot(options, "08-export", { fullPage: true });

    const cards = await pageAt("library.html", 980, 880);
    await cards.getByLabel("Filter by deck").selectOption("biology");
    await expect(cards.locator("#library-count")).toHaveText("15 cards");
    await shot(cards, "09-library");
    console.log(`Saved twelve PNGs to ${output}`);
  } finally {
    await context.close();
  }
} finally {
  await rm(profile, { recursive: true, force: true });
}
