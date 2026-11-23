import { drainQueue, MAX_ATTEMPTS, queueState } from "../ai/queue";
import { createRuntime, generateCards } from "../ai/runtime";
import type { Deck } from "../cards/schema";
import { cardStats, formatBytes } from "../cards/stats";
import { buildTsv } from "../export/tsv";
import { shouldUseMock } from "../firebase/config";
import { db } from "../storage/db";
import { listDecks, setDeckName } from "../storage/decks";
import { inferenceModes, readSettings, type ModeOverride, type Settings } from "../storage/settings";
import { refreshDiagnostics } from "./diagnostics";
import { ask, downloadFile, element, message, notify, showDemoBanner } from "./shared";

const privacy = element<HTMLInputElement>("privacy-mode");
const demo = element<HTMLInputElement>("demo-mode");
const mode = element<HTMLSelectElement>("inference-mode");
const debugToken = element<HTMLInputElement>("debug-token");
const exportDeck = element<HTMLSelectElement>("export-deck");
const tsvButton = element<HTMLButtonElement>("export-tsv");
const apkgButton = element<HTMLButtonElement>("export-apkg");
const backupToggle = element<HTMLInputElement>("firestore-backup");
const backupNow = element<HTMLButtonElement>("back-up-now");
const restoreBackup = element<HTMLButtonElement>("restore-backup");
const backupResult = element("backup-result");
let backupBusy = false;

function showActiveSettings(mock: boolean) {
  const simulated = shouldUseMock(mock);
  showDemoBanner(simulated);
  const routing = element("active-routing");
  routing.className = `badge ${privacy.checked || mode.value === "only-device" ? "private" : "neutral"}`;
  const active = privacy.checked ? "Kept local" : mode.selectedOptions[0]?.textContent;
  routing.textContent = simulated ? `Simulated · ${active}` : active ?? "";
  showBackupControls();
}

function onError(error: unknown) {
  notify(message(error, "Margin could not complete this action."), true);
}

async function saveSettings(changes: Partial<Settings>, text = "Settings saved.") {
  try {
    await chrome.storage.local.set(changes);
    showActiveSettings(demo.checked);
    if (changes.mock !== undefined) await refreshLibrary();
    notify(text);
  } catch (error) {
    onError(error);
  }
}

function showBackupControls() {
  const unavailable = privacy.checked ? "Firestore backup is unavailable in Privacy mode."
    : shouldUseMock(demo.checked) ? "Connect Firebase and use Live mode to back up decks."
    : "";
  backupToggle.disabled = backupBusy || !!unavailable;
  backupNow.disabled = restoreBackup.disabled = backupToggle.disabled || !backupToggle.checked;
  element("backup-hint").textContent = unavailable ||
    "Saves card content and review schedules to this Chrome profile’s anonymous backup. Restore adds missing items, including previously backed-up deletions.";
}

async function runBackup(restore: boolean, saveToggle = false) {
  if (backupBusy) return;
  backupBusy = true;
  showBackupControls();
  backupResult.textContent = "";
  try {
    if (saveToggle) {
      const enabled = backupToggle.checked;
      try {
        await chrome.storage.local.set({ firestoreBackup: enabled });
      } catch (error) {
        backupToggle.checked = !enabled;
        throw error;
      }
      if (!enabled) return;
    }
    backupResult.textContent = restore ? "Restoring…" : "Backing up…";
    const response = await chrome.runtime.sendMessage({ type: restore ? "margin.restoreBackup" : "margin.backup" });
    if (!response?.result) throw new Error(response?.error || "Firestore backup failed.");
    const { cards, decks, skipped } = response.result;
    const skippedMessage = restore && skipped > 0 ? ` Skipped ${skipped} invalid backed-up ${skipped === 1 ? "item" : "items"}.` : "";
    backupResult.textContent = `${restore ? "Restored" : "Backed up"} ${cards} ${cards === 1 ? "card" : "cards"} and ${decks} ${decks === 1 ? "deck" : "decks"}.${skippedMessage}`;
    if (restore) await refreshLibrary();
  } catch (error) {
    backupResult.textContent = message(error, "Firestore backup failed.");
  } finally {
    backupBusy = false;
    showBackupControls();
  }
}

backupToggle.addEventListener("change", () => { void runBackup(false, true); });
backupNow.addEventListener("click", () => { void runBackup(false); });
restoreBackup.addEventListener("click", () => { void runBackup(true); });

privacy.addEventListener("change", () => {
  mode.disabled = privacy.checked;
  void saveSettings({ privacyMode: privacy.checked });
});
demo.addEventListener("change", () => {
  void saveSettings({ mock: demo.checked }).then(readSettings).then(refreshDiagnostics).catch(onError);
});
mode.addEventListener("change", () => { void saveSettings({ modeOverride: mode.value as ModeOverride }); });
element("debug-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void saveSettings({ appCheckDebugToken: debugToken.value.trim() }, "App Check token saved. Reopen Margin to apply it.");
});

function deckEditor(deck: Deck): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "deck-editor stack";
  const label = document.createElement("label");
  label.textContent = "Deck name";
  const name = document.createElement("input");
  name.value = deck.name;
  name.maxLength = 80;
  name.required = true;
  label.append(name);
  const buttons = document.createElement("div");
  buttons.className = "actions";

  const rename = document.createElement("button");
  rename.type = "submit";
  rename.className = "secondary small";
  rename.textContent = "Rename";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "quiet danger small";
  remove.textContent = "Delete";
  buttons.append(rename, remove);
  form.append(label, buttons);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    rename.disabled = remove.disabled = true;
    void setDeckName(name.value, deck).then(async () => {
      await refreshLibrary();
      notify("Deck renamed.");
    }).catch(onError).finally(() => { rename.disabled = remove.disabled = false; });
  });
  remove.addEventListener("click", () => {
    if (!confirm(`Delete “${deck.name}” and its cards, review history, and queued captures?`)) return;
    rename.disabled = remove.disabled = true;
    void navigator.locks.request("margin-decks", () => db.deleteDeck(deck.id)).then(async () => {
      await Promise.all([refreshLibrary(), refreshQueue()]);
      notify("Deck deleted.");
    }).catch(onError).finally(() => { rename.disabled = remove.disabled = false; });
  });
  return form;
}

async function refreshLibrary() {
  const previous = exportDeck.value;
  const [decks, cards] = await Promise.all([listDecks(), db.all("cards")]);
  exportDeck.replaceChildren(new Option("All decks", ""), ...decks.map(({ id, name }) => new Option(name, id)));
  if (decks.some(({ id }) => id === previous)) exportDeck.value = previous;
  element("managed-decks").replaceChildren(...decks.map(deckEditor));
  const simulated = shouldUseMock(demo.checked);
  element("stats-heading").textContent = simulated ? "Simulated on-device activity" : "On-device activity";
  const stats = cardStats(cards.filter((card) => card.route?.simulated === simulated));
  element("on-device-percent").textContent = `${stats.onDevicePercent}%`;
  element("bytes-local").textContent = formatBytes(stats.localBytes);
  element("count-device").textContent = `On-device ${stats.onDeviceCount}`;
  element("count-cloud").textContent = `Cloud ${stats.cloudCount}`;
  element("chart-device").style.flexGrow = String(stats.onDeviceCount);
  element("chart-cloud").style.flexGrow = String(stats.cloudCount);
}

async function exportCards(format: "tsv" | "apkg") {
  tsvButton.disabled = apkgButton.disabled = true;
  try {
    const id = exportDeck.value;
    const [allCards, allDecks] = await Promise.all([db.all("cards"), listDecks()]);
    const cards = allCards.filter((card) => !id || card.deckId === id);
    const decks = allDecks.filter((deck) => !id || deck.id === id);
    if (!cards.length) throw new Error("There are no saved cards to export in this selection.");
    const name = id ? decks[0]?.name ?? "Margin" : "Margin";
    const filename = `${name.replace(/[\\/:*?"<>|]/gu, "-")}.${format}`;
    if (format === "tsv") {
      downloadFile(buildTsv(cards, decks), filename, "text/tab-separated-values;charset=utf-8");
    } else {
      const { buildApkg } = await import("../export/apkg");
      const bytes = await buildApkg(cards, decks);
      downloadFile(Uint8Array.from(bytes), filename, "application/octet-stream");
    }
    notify(`Exported ${cards.length} ${cards.length === 1 ? "card" : "cards"}.`);
  } catch (error) {
    onError(error);
  } finally {
    tsvButton.disabled = apkgButton.disabled = false;
  }
}

tsvButton.addEventListener("click", () => { void exportCards("tsv"); });
apkgButton.addEventListener("click", () => { void exportCards("apkg"); });

async function refreshQueue() {
  const [queue, decks] = await Promise.all([db.all("queue"), db.all("decks")]);
  const list = element("queue-list");
  if (!queue.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No captures waiting to retry.";
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(...queue.sort((a, b) => a.createdAt - b.createdAt).map((entry) => {
    const job = document.createElement("article");
    job.className = "queue-item stack";
    const title = document.createElement("h3");
    title.textContent = entry.job.source?.title || "Untitled capture";
    const badge = document.createElement("span");
    const state = queueState(entry);
    badge.className = `badge ${state === "failed" ? "failed" : "queued"}`;
    badge.textContent = state === "failed" ? "Failed" : state === "confirm" ? "Needs approval" : "Queued";
    const deck = decks.find(({ id }) => id === entry.job.deckId);
    const reason = document.createElement("p");
    reason.className = "hint";
    const attempts = entry.attempts ? `${Math.min(entry.attempts, MAX_ATTEMPTS)} of ${MAX_ATTEMPTS} attempts` : undefined;
    reason.textContent = [deck?.name, attempts, entry.lastError ?? entry.reason].filter(Boolean).join(" · ");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "secondary small";
    const retryLabel = state === "confirm" ? "Review capture" : "Retry";
    retry.textContent = retryLabel;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet danger small";
    remove.textContent = "Remove";
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(retry, remove);

    retry.addEventListener("click", async () => {
      if (!navigator.onLine) {
        notify("Reconnect to retry this capture.", true);
        return;
      }
      retry.disabled = remove.disabled = true;
      retry.textContent = "Retrying…";
      try {
        const current = await createRuntime();
        await drainQueue(async (pending) => {
          const result = await generateCards(pending, current.provider, { ...current, online: navigator.onLine }, {
            queueIfOffline: false, confirmCloud: (reason) => ask("cloud-dialog", reason),
          });
          return result?.cards;
        }, () => navigator.onLine, db, entry.id, Date.now, current.mock ? "demo" : "live");
        void chrome.runtime.sendMessage({ type: "margin.queueChanged" }).catch(() => {});
        const remaining = await db.get("queue", entry.id);
        if (remaining) notify(remaining.lastError ?? "This capture is still queued.", true);
        else notify("Queued capture processed.");
        await Promise.all([refreshLibrary(), refreshQueue()]);
      } catch (error) {
        onError(error);
      } finally {
        retry.disabled = remove.disabled = false;
        retry.textContent = retryLabel;
      }
    });
    remove.addEventListener("click", () => {
      void db.delete("queue", entry.id).then(() => {
        void chrome.runtime.sendMessage({ type: "margin.queueChanged" }).catch(() => {});
        return refreshQueue();
      }).catch(onError);
    });
    job.append(title, badge, reason, actions);
    return job;
  }));
}

async function start() {
  const settings = await readSettings();
  privacy.checked = settings.privacyMode;
  demo.checked = settings.mock;
  mode.replaceChildren(...inferenceModes.map(([value, label]) => new Option(label, value)));
  mode.value = settings.modeOverride;
  mode.disabled = settings.privacyMode;
  debugToken.value = settings.appCheckDebugToken ?? "";
  backupToggle.checked = settings.firestoreBackup;
  showActiveSettings(settings.mock);
  await Promise.all([refreshLibrary(), refreshQueue(), refreshDiagnostics(settings)]);
}

void start().catch(onError);
