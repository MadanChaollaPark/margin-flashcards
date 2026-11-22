import { cp, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

const fixtureDir = resolve("test/fixtures");
const piiSample = "The practice account contact is learner@example.invalid. Chlorophyll absorbs light in plants.";

type Margin = {
  context: BrowserContext;
  worker: Worker;
  extension: string;
  site: string;
  errors: string[];
};

const test = base.extend<{ margin: Margin }>({
  margin: async ({}, use, testInfo) => {
    const paths: Record<string, string> = { "/article.html": "text/html", "/text.pdf": "application/pdf", "/scan.pdf": "application/pdf" };
    const server = createServer(async (request, response) => {
      const path = request.url ?? "/";
      if (!paths[path]) {
        response.writeHead(204).end();
        return;
      }
      try {
        const bytes = await readFile(resolve(fixtureDir, path.slice(1)));
        response.writeHead(200, { "Content-Type": paths[path], "Content-Length": bytes.length }).end(bytes);
      } catch {
        response.writeHead(500).end();
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server has no port.");

    const profile = await mkdtemp(resolve(tmpdir(), "margin-playwright-"));
    const tempDist = resolve(profile, "extension");
    try {
      // The synthetic context-menu message cannot grant activeTab. Use the loopback fixture host
      // except for captureVisibleTab, which accepts only activeTab or all URLs.
      await cp(resolve("dist"), tempDist, { recursive: true });
      const manifestPath = resolve(tempDist, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      expect(manifest.optional_host_permissions).toContain("<all_urls>");
      expect(manifest.host_permissions).toBeUndefined();
      const hosts = testInfo.annotations.some(({ type }) => type === "capture-visible-tab")
        ? ["<all_urls>"] : ["http://127.0.0.1/*"];
      await writeFile(manifestPath, JSON.stringify({ ...manifest, host_permissions: hosts }));
      const context = await chromium.launchPersistentContext(profile, {
        channel: "chromium",
        headless: false,
        args: ["--headless=new", `--disable-extensions-except=${tempDist}`, `--load-extension=${tempDist}`],
      });
      try {
        const errors: string[] = [];
        context.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        context.on("weberror", (error) => errors.push(error.error().message));
        const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
        const workerUrl = new URL(worker.url());
        expect(workerUrl.protocol).toBe("chrome-extension:");
        expect(workerUrl.pathname).toBe("/background.js");

        const extension = `chrome-extension://${workerUrl.host}`;
        await worker.evaluate(() => chrome.storage.local.set({ mock: true }));
        await use({ context, worker, extension, site: `http://127.0.0.1:${address.port}`, errors });
      } finally {
        await context.close();
      }
    } finally {
      await rm(profile, { recursive: true, force: true });
      await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
    }
  },
});

async function extensionPage(margin: Margin, path: string): Promise<Page> {
  const page = await margin.context.newPage();
  await page.goto(`${margin.extension}/${path}`);
  return page;
}

async function sendCapture(margin: Margin, url: string, kind: "page" | "pdf" | "selection" | "image") {
  await margin.worker.evaluate(async ({ url, kind }) => {
    const [tab] = await chrome.tabs.query({ url });
    if (tab?.id === undefined) throw new Error("Could not find the fixture tab.");
    const key = `margin.capture.${tab.windowId}.${Date.now()}.${crypto.randomUUID()}`;
    await chrome.storage.session.set({ [key]: { kind, tabId: tab.id } });
    await chrome.runtime.sendMessage({ type: "margin.capture", windowId: tab.windowId }).catch(() => {});
  }, { url, kind });
}

test("page capture reaches the panel, cards can be edited and reviewed, and both exports download", async ({ margin }) => {
  const article = await margin.context.newPage();
  const url = `${margin.site}/article.html`;
  await article.goto(url);
  await sendCapture(margin, url, "page");
  const panel = await extensionPage(margin, "sidepanel.html");
  await expect(panel.getByRole("heading", { name: "Margin", exact: true })).toBeVisible();
  await expect(panel.getByText("DEMO MODE (simulated AI)", { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Welcome to Margin" })).toBeVisible();
  await panel.getByRole("button", { name: "Dismiss" }).click();
  await panel.getByText("AI routing explained", { exact: true }).click();
  await expect(panel.getByText(/6,000 estimated tokens/u)).toBeVisible();
  await panel.getByText("AI routing explained", { exact: true }).click();
  await expect(panel.locator(".card .badge.device")).toHaveCount(3);
  await expect(panel.locator(".preview-back").first()).toHaveText(/light energy/iu);

  await panel.getByRole("button", { name: "Edit capture" }).press("Enter");
  await expect(panel.getByLabel("Source", { exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "New deck" }).click();
  await panel.getByLabel("Deck name").fill("Plant science");
  await panel.getByRole("button", { name: "Create deck" }).click();
  await expect(panel.getByRole("dialog")).toBeHidden();
  await expect(panel.locator("#deck option:checked")).toHaveText("Plant science");
  const front = "How does photosynthesis store energy?";
  const answer = "As chemical energy.";
  await panel.getByRole("button", { name: "Edit", exact: true }).first().click();
  await panel.getByLabel("Front").first().fill(front);
  await panel.getByLabel("Back").first().fill(answer);
  await expect(panel.getByLabel("Front").first()).toHaveValue(front);
  await expect(panel.getByLabel("Back").first()).toHaveValue(answer);
  await panel.locator(".card").first().getByRole("textbox", { name: "Tags" }).fill("plants energy");
  await panel.getByRole("button", { name: "Done", exact: true }).click();
  await expect(panel.locator(".tags").first()).toContainText("plants");
  const answers = await panel.locator(".card").evaluateAll((cards) => Object.fromEntries(cards.map((card) => [
    card.querySelector(".preview-front")?.textContent, card.querySelector(".preview-back")?.textContent,
  ])));
  await panel.getByRole("button", { name: /^Save \d+ cards? to/u }).click();
  await expect(panel.locator("#toast").and(panel.getByRole("status"))).toHaveText("Saved 3 cards.");

  const popup = await extensionPage(margin, "popup.html");
  await expect(popup.getByText("3 cards due")).toBeVisible();
  await expect(popup.getByRole("button", { name: "Open side panel" })).toBeVisible();
  const path = await popup.getByRole("link", { name: "Plant science" }).getAttribute("href");
  expect(path).toMatch(/^review\.html\?deck=/u);
  const review = await extensionPage(margin, path!);
  await expect(review.getByRole("heading", { name: "Plant science" })).toBeVisible();
  const firstFront = (await review.locator("#card-front").textContent())!;
  const excerpts: Record<string, string> = {
    [front]: "Photosynthesis is the conversion of light energy into",
    "What does chlorophyll do in plants?": "Chlorophyll is the pigment that absorbs light in",
    "What do stomata regulate in leaves?": "Stomata are pores that regulate gas exchange in",
  };
  await expect(review.getByRole("link", { name: "Show source" })).toHaveAttribute("href",
    `${url}#:~:text=${encodeURIComponent(excerpts[firstFront])}`);
  await review.getByLabel("Your answer").fill(answers[firstFront]);
  await review.getByLabel("Your answer").press("Enter");
  await expect(review.getByText("Simulated — Correct", { exact: true })).toBeVisible();
  await expect(review.getByText("Simulated · Graded on-device", { exact: true })).toBeVisible();
  const generationRoute = review.locator("#generation-route");
  await expect(generationRoute.getByText("Simulated · On-device", { exact: true })).toBeVisible();
  await generationRoute.locator("summary").click();
  await expect(generationRoute.getByText(/Firebase AI Logic preferred Gemini Nano/u)).toBeVisible();
  await expect(review.locator("#user-answer")).toHaveText(answers[firstFront]);
  await expect(review.getByRole("button", { name: /^Good/u })).toHaveAttribute("aria-description", "Suggested rating");
  await expect(review.getByRole("group", { name: "Rate this card" })).toBeVisible();
  const goodButton = review.getByRole("button", { name: /^Good/u });
  await expect(goodButton).toHaveAccessibleName(/^Good, \d+(\.\d+)? (minute|hour|day|month|year)s?$/u);
  await expect(goodButton).toHaveAttribute("aria-keyshortcuts", "3");
  await review.keyboard.press("3");
  await expect(review.getByText("1 of 4 complete")).toBeVisible();
  await review.keyboard.press("Space");
  await review.getByRole("button", { name: /^Easy/u }).press("Enter");
  await expect(review.getByText("2 of 4 complete")).toBeVisible();
  await popup.reload();
  await expect(popup.getByText("1 card due")).toBeVisible();

  const options = await extensionPage(margin, "options.html");
  await expect(options.getByText("100%", { exact: true })).toBeVisible();
  const diagnostics = options.getByRole("region", { name: "Diagnostics" });
  await expect(diagnostics.locator("dd")).toHaveCount(7);
  await expect(options.locator("#diagnostic-chrome")).toHaveText(/^\d+\.\d+\.\d+\.\d+ · 139\+$/u);
  await expect(diagnostics.getByText("Defaults", { exact: true })).toBeVisible();
  await expect(diagnostics.getByText("Demo", { exact: true })).toBeVisible();
  await expect(diagnostics.getByText(/^Connect a Firebase project to run a live test/u)).toBeVisible();
  await expect(diagnostics.getByRole("button", { name: "Run live hybrid test" })).toBeDisabled();
  await expect(options.getByRole("switch", { name: /Back up decks to Firestore/u })).toBeDisabled();
  await expect(options.getByRole("button", { name: "Restore from backup" })).toBeDisabled();
  const exportDeck = options.getByLabel("Deck to export");
  await exportDeck.selectOption({ label: "Plant science" });
  await exportDeck.press("Tab");
  const exportTsv = options.getByRole("button", { name: "Export TSV" });
  await expect(exportTsv).toBeFocused();
  expect(await exportTsv.evaluate((button) => getComputedStyle(button).outlineStyle)).toBe("solid");
  const [tsv] = await Promise.all([
    options.waitForEvent("download"), options.keyboard.press("Enter"),
  ]);
  expect(tsv.suggestedFilename()).toBe("Plant science.tsv");
  const content = await readFile((await tsv.path())!, "utf8");
  expect(content).toContain("#separator:tab");
  expect(content).toContain(`${front}\t${answer}\tPlant science\tBasic\tplants energy`);

  const [apkg] = await Promise.all([
    options.waitForEvent("download"), options.getByRole("button", { name: "Export .apkg" }).click(),
  ]);
  expect(apkg.suggestedFilename()).toBe("Plant science.apkg");
  const files = unzipSync(await readFile((await apkg.path())!));
  expect(strFromU8(files.media)).toBe("{}");
  expect(strFromU8(files["collection.anki2"].subarray(0, 15))).toBe("SQLite format 3");

  const deckEditor = options.locator(".deck-editor").nth(1);
  await deckEditor.getByLabel("Deck name").fill("Plant biology");
  await deckEditor.getByRole("button", { name: "Rename" }).click();
  await expect(options.getByRole("status")).toHaveText("Deck renamed.");
  await popup.reload();
  await expect(popup.getByRole("link", { name: "Plant biology" })).toBeVisible();

  const libraryPath = await popup.getByRole("link", { name: "Cards", exact: true }).getAttribute("href");
  expect(libraryPath).toBe("library.html");
  await expect(panel.getByRole("link", { name: "Cards", exact: true })).toHaveAttribute("href", libraryPath!);
  const library = await extensionPage(margin, libraryPath!);
  await library.getByLabel("Filter by deck").selectOption({ label: "Plant biology" });
  await expect(library.locator("#library-count")).toHaveText("3 cards");
  const original = library.getByRole("article", { name: firstFront, exact: true });
  const due = await original.locator("time").getAttribute("datetime");
  expect(new Date(due!).getTime()).toBeGreaterThan(Date.now());
  await expect(original.getByText(/Firebase AI Logic preferred Gemini Nano/u)).toBeVisible();
  await original.getByRole("button", { name: "Edit" }).press("Enter");
  await expect(original.getByLabel("Front", { exact: true })).toBeFocused();
  await original.getByLabel("Front", { exact: true }).fill("Edited recall question?");
  await original.getByLabel("Back", { exact: true }).fill("Edited recall answer.");
  await original.getByRole("textbox", { name: "Tags", exact: true }).fill("reviewed moved");
  await original.getByLabel("Deck", { exact: true }).selectOption({ label: "Inbox" });
  await original.getByRole("button", { name: "Save changes" }).click();
  await expect(library.locator("#library-count")).toHaveText("2 cards");
  await library.reload();
  await library.getByLabel("Filter by deck").selectOption({ label: "Inbox" });
  await library.getByRole("searchbox", { name: "Search cards" }).fill("REVIEWED recall");
  const moved = library.getByRole("article", { name: "Edited recall question?", exact: true });
  await expect(moved.getByText("Edited recall answer.", { exact: true })).toBeVisible();
  await expect(moved.locator("time")).toHaveAttribute("datetime", due!);
  await expect(moved.getByText(/Firebase AI Logic preferred Gemini Nano/u)).toBeVisible();
  library.once("dialog", (dialog) => dialog.accept());
  await moved.getByRole("button", { name: "Delete" }).click();
  await expect(library.getByRole("status")).toHaveText("Card deleted.");
  await expect(library.locator("#library-count")).toHaveText("No cards match your search or deck filter.");

  options.once("dialog", (dialog) => dialog.accept());
  await deckEditor
    .getByRole("button", { name: "Delete" }).click();
  await expect(options.getByRole("status")).toHaveText("Deck deleted.");
  await popup.reload();
  await expect(popup.getByText("0 cards due")).toBeVisible();
  expect(margin.errors).toEqual([]);
});

test("options reports invalid backup items skipped during restore", async ({ margin }) => {
  const cases = [
    { skipped: 3, expected: "Restored 1 card and 1 deck. Skipped 3 invalid backed-up items." },
    { skipped: 1, expected: "Restored 1 card and 1 deck. Skipped 1 invalid backed-up item." },
    { skipped: 0, expected: "Restored 1 card and 1 deck." },
    { skipped: undefined, expected: "Restored 1 card and 1 deck." },
  ];

  for (const { skipped, expected } of cases) {
    const options = await extensionPage(margin, "options.html");
    const restore = options.getByRole("button", { name: "Restore from backup" });
    await expect(restore).toBeDisabled();
    await options.evaluate((skipped) => {
      Object.defineProperty(chrome.runtime, "sendMessage", {
        value: async (request: { type: string }) => {
          if (request.type !== "margin.restoreBackup") throw new Error(`Unexpected message ${request.type}`);
          return { result: { cards: 1, decks: 1, skipped } };
        },
      });
    }, skipped);
    // Exercise the result handler with a stubbed response while Demo mode keeps Firestore disabled.
    await restore.dispatchEvent("click");
    await expect(options.locator("#backup-result")).toHaveText(expected);
    await options.close();
  }
});

test("sensitive text stays on-device even when options request cloud inference", async ({ margin }) => {
  const options = await extensionPage(margin, "options.html");
  await options.getByLabel("Inference mode").selectOption("only-cloud");
  await expect(options.getByRole("status")).toHaveText("Settings saved.");

  const panel = await extensionPage(margin, "sidepanel.html");
  await panel.getByLabel("Source", { exact: true }).selectOption("paste");
  await panel.getByLabel("Notes").fill(piiSample);
  await panel.getByRole("button", { name: "Generate" }).click();
  const badge = panel.locator(".card summary").first();
  await expect(badge).toHaveText("Simulated · Kept local");
  await expect(badge).toHaveAttribute("title", /sensitive content stays on-device/iu);
  await badge.click();
  await expect(panel.getByText("Simulated — Sensitive content stays on-device.").first()).toBeVisible();
  expect(margin.errors).toEqual([]);
});

test("privacy mode blocks raster-only PDF jobs and allows extracted PDF text", async ({ margin }) => {
  const options = await extensionPage(margin, "options.html");
  await options.getByLabel("Privacy mode").check();
  await expect(options.getByRole("status")).toHaveText("Settings saved.");
  await expect(options.getByLabel("Inference mode")).toBeDisabled();
  await expect(options.getByText("Firestore backup is unavailable in Privacy mode.")).toBeVisible();

  const pdf = await margin.context.newPage();
  const panel = await extensionPage(margin, "sidepanel.html");
  const scanUrl = `${margin.site}/scan.pdf`;
  await pdf.goto(scanUrl);
  await sendCapture(margin, scanUrl, "pdf");
  await expect(panel.getByRole("status")).toHaveText(/Privacy mode keeps this content on-device.*Extract the PDF text/iu);
  await expect(panel.locator(".card")).toHaveCount(0);

  const textUrl = `${margin.site}/text.pdf`;
  await pdf.goto(textUrl);
  await sendCapture(margin, textUrl, "pdf");
  await expect(panel.locator(".card summary")).toHaveAttribute("title", /privacy mode/iu);
  await expect(panel.locator(".preview-back")).toHaveText(/Chlorophyll absorbs light/iu);
  expect(margin.errors).toEqual([]);
});

test("offline generation queues cloud jobs and drains them after reconnecting", async ({ margin }) => {
  const options = await extensionPage(margin, "options.html");
  await options.getByLabel("Inference mode").selectOption("only-cloud");
  await expect(options.getByRole("status")).toHaveText("Settings saved.");
  const panel = await extensionPage(margin, "sidepanel.html");

  await margin.context.setOffline(true);
  await expect.poll(() => panel.evaluate(() => navigator.onLine)).toBe(false);
  const status = panel.locator("#model-status");
  await expect(status).toBeVisible();
  await expect(status).toHaveText("Offline · on-device only");
  await panel.getByLabel("Source", { exact: true }).selectOption("paste");
  await panel.getByLabel("Notes").fill("Dendrochronology means dating events using patterns in tree rings.");
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(panel.getByText("Queued", { exact: true })).toBeVisible();
  const statuses = panel.getByRole("status");
  await expect(statuses.and(panel.locator("#model-status"))).toHaveText("Offline · on-device only");
  await expect(statuses.and(panel.locator("#toast"))).toHaveText("Queued jobs retry when Margin is open and you're online.");

  await options.getByLabel("Privacy mode").check();
  await margin.context.setOffline(false);
  await expect(status).toBeHidden();
  await expect(panel.getByText("Queued", { exact: true })).toBeHidden();
  await options.reload();
  await expect(options.getByText("100%", { exact: true })).toBeVisible();
  const otherReview = await extensionPage(margin, "review.html");
  await expect(otherReview.getByRole("heading", { name: "What is Dendrochronology?" })).toBeVisible();
  const review = await extensionPage(margin, "review.html");
  await expect(review.getByRole("heading", { name: "What is Dendrochronology?" })).toBeVisible();
  await review.keyboard.press("Space");
  await review.keyboard.press("3");
  await expect(review.getByText("1 of 2 complete")).toBeVisible();
  await expect(review.getByRole("heading", { name: "What is Dendrochronology?" })).toBeVisible();
  await review.keyboard.press("Space");
  await review.keyboard.press("4");
  await expect(review.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(review.getByText("1 card reviewed.")).toBeVisible();
  await expect(review.locator("#summary-ratings dd")).toHaveText(["0", "0", "1", "1"]);
  await review.reload();
  await expect(review.getByRole("heading", { name: "All caught up" })).toBeVisible();
  await expect(review.getByText(/^Next review /u)).toBeVisible();

  await otherReview.keyboard.press("Space");
  await otherReview.keyboard.press("3");
  await expect(otherReview.getByText("This card was already handled in another tab.")).toBeVisible();
  await expect(otherReview.getByRole("heading", { name: "Session complete" })).toBeVisible();
  await expect(otherReview.getByText("0 cards reviewed.")).toBeVisible();
  expect(margin.errors).toEqual([]);
});

test("selection anchors the exact passage and the panel accepts screenshots, image files and clipboard images", {
  annotation: { type: "capture-visible-tab" },
}, async ({ margin }) => {
  const article = await margin.context.newPage();
  const url = `${margin.site}/article.html`;
  await article.goto(url);
  await article.locator("article p").first().evaluate((paragraph) => {
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()?.addRange(range);
  });

  const panel = await extensionPage(margin, "sidepanel.html");
  await sendCapture(margin, url, "selection");
  await expect(panel.locator(".card")).toHaveCount(1);
  await panel.getByRole("button", { name: /^Save \d+ cards? to/u }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved 1 card.");
  const review = await extensionPage(margin, "review.html");
  await expect(review.getByRole("link", { name: "Show source" })).toHaveAttribute("href",
    `${url}#:~:text=Photosynthesis%20is%20the%20conversion%20of%20light%20energy%20into%20chemical%20energy.`);

  await article.bringToFront();
  await sendCapture(margin, url, "image");
  await expect(panel.locator(".card .badge.device")).toHaveCount(2);
  await expect(panel.locator(".card summary").first()).toHaveAttribute("title", /Demo example cards for this attachment/iu);
  await panel.bringToFront();
  await panel.getByRole("button", { name: "Delete card 1" }).click();
  await panel.getByRole("button", { name: "Delete card 1" }).click();

  await panel.getByLabel("Image file").setInputFiles(resolve("assets/icon-48.png"));
  await expect(panel.getByText("icon-48.png", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Generate" }).click();
  await expect(panel.locator(".card .badge.device")).toHaveCount(2);
  await panel.getByRole("button", { name: "Edit capture" }).click();
  await panel.getByRole("button", { name: "Clear image" }).click();
  await expect(panel.locator("#chosen-image")).toBeHidden();
  await panel.evaluate(async () => {
    const blob = await (await fetch("icons/icon-48.png")).blob();
    const data = new DataTransfer();
    data.items.add(new File([blob], "clipboard.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data }));
  });
  await expect(panel.getByText("clipboard.png", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Source", { exact: true })).toHaveValue("image");
  expect(margin.errors).toEqual([]);
});
