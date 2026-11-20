import { CELL_BIOLOGY_PASSAGE, CELL_BIOLOGY_TITLE } from "../ai/demoSamples";
import { renderFront } from "../cards/cloze";
import { dedupe } from "../cards/dedupe";
import { cardTags, MAX_BACK_LENGTH, MAX_FRONT_LENGTH, validate, type Card } from "../cards/schema";
import { queueState, startQueueDrain, type QueuedJob } from "../ai/queue";
import { createRuntime, generateCards } from "../ai/runtime";
import { captureSource } from "../sources/capture";
import { PENDING_CAPTURE_PREFIX, type CaptureRequest, type SourceKind } from "../sources/request";
import { db } from "../storage/db";
import { listDecks, setDeckName } from "../storage/decks";
import { ask, cardRouteBadge, clearNotice, element, fillRoutingRules, fillTags, message, notify, queueRetryHelp, routeBadge, showDemoBanner } from "./shared";

const status = element("model-status");
const modelRow = element("model-row");
const enable = element<HTMLButtonElement>("enable-model");
const progress = element<HTMLProgressElement>("model-progress");
const source = element<HTMLSelectElement>("source");
const deck = element<HTMLSelectElement>("deck");
const generate = element<HTMLButtonElement>("generate");
const accept = element<HTMLButtonElement>("accept");
const notes = element<HTMLTextAreaElement>("notes");
const imageField = element<HTMLInputElement>("image");
const preview = element("cards");
const queue = element("queued");
const deckDialog = element<HTMLDialogElement>("deck-dialog");

const hints: Record<SourceKind, string> = {
  selection: "Highlight a passage in the current tab.",
  page: "Use the readable text on the current tab.",
  pdf: "Open a PDF in the current tab.",
  youtube: "Open a YouTube video to use its captions.",
  image: "Choose a file, paste an image, or capture the visible tab.",
  paste: "Use your own notes or copied text.",
};

let cards: Card[] = [];
let image: File | undefined;
let busy = false;
let claiming = false;
let runtime: Awaited<ReturnType<typeof createRuntime>> | undefined;
let downloading = false;
let retryQueue: (() => void) | undefined;

function showOfflineStatus() {
  modelRow.hidden = false;
  status.textContent = "Offline · on-device only";
  status.className = "badge neutral";
}

function showDownloadStatus() {
  if (!navigator.onLine) return;
  status.textContent = progress.hasAttribute("value") ? `Downloading ${Math.round(progress.value * 100)}%` : "Downloading…";
}

async function refreshStatus() {
  if (!navigator.onLine) showOfflineStatus();
  if (downloading) {
    showDownloadStatus();
    return;
  }
  const current = await createRuntime();
  if (downloading) return;
  runtime = current;
  const { nano } = await current.provider.status();
  if (downloading) return;
  const labels = { available: "On-device ready", downloadable: "Available to download", downloading: "Downloading…", unavailable: "Unavailable" };
  showDemoBanner(current.mock);
  modelRow.hidden = current.mock;
  status.textContent = labels[nano];
  element("welcome-model").textContent = current.mock ? "This build simulates the model." : labels[nano];
  fillRoutingRules(current.config);
  status.className = `badge ${nano === "available" ? "device" : "neutral"}`;
  enable.hidden = current.mock || (nano !== "downloadable" && nano !== "downloading");
  if (!navigator.onLine) showOfflineStatus();
}

enable.addEventListener("click", async () => {
  if (!runtime || downloading) return;
  downloading = true;
  enable.disabled = true;
  progress.hidden = false;
  progress.removeAttribute("value");
  showDownloadStatus();
  try {
    await runtime.provider.initializeDeviceModel((value) => {
      progress.value = value;
      showDownloadStatus();
    });
  } catch (error) {
    notify(message(error, "On-device AI could not be enabled."), true);
  } finally {
    downloading = false;
    enable.disabled = false;
    progress.hidden = true;
    void refreshStatus().catch(reportError);
  }
});

function showSourceFields() {
  element("paste-fields").hidden = source.value !== "paste";
  element("image-fields").hidden = source.value !== "image";
  element("source-hint").textContent = hints[source.value as SourceKind];
}
source.addEventListener("change", showSourceFields);

const sample = element<HTMLButtonElement>("try-sample");
const captureForm = element<HTMLFormElement>("capture-form");
const editCapture = element<HTMLButtonElement>("edit-capture");

function expandCapture(expanded: boolean) {
  captureForm.hidden = sample.hidden = !expanded;
  editCapture.hidden = expanded;
  editCapture.setAttribute("aria-expanded", String(expanded));
}

editCapture.addEventListener("click", () => {
  expandCapture(true);
  source.focus();
});
sample.addEventListener("click", () => {
  source.value = "paste";
  notes.value = CELL_BIOLOGY_PASSAGE;
  showSourceFields();
  void dismissWelcome().catch(reportError);
  generate.focus();
});

const welcome = element("welcome");
async function dismissWelcome() {
  welcome.hidden = true;
  await chrome.storage.local.set({ welcomeSeen: true });
}
element("welcome-dismiss").addEventListener("click", () => {
  void dismissWelcome().catch(reportError);
  source.focus();
});
element("welcome-try").addEventListener("click", () => {
  source.value = "page";
  showSourceFields();
  void dismissWelcome().catch(reportError);
  element("capture-section").scrollIntoView({ block: "start" });
  expandCapture(true);
  generate.focus();
  captureForm.requestSubmit();
});


function showImage(file?: File) {
  image = file;
  element("image-name").textContent = file?.name || "Pasted image";
  element("chosen-image").hidden = !file;
}

imageField.addEventListener("change", () => showImage(imageField.files?.[0]));
element("clear-image").addEventListener("click", () => {
  imageField.value = "";
  showImage();
  imageField.focus();
});
window.addEventListener("paste", (event) => {
  const file = [...(event.clipboardData?.files ?? [])].find(({ type }) => type.startsWith("image/"));
  if (!file || busy) return;
  event.preventDefault();
  imageField.value = "";
  source.value = "image";
  expandCapture(true);
  showSourceFields();
  showImage(file);
});

async function refreshDecks(selected = deck.value) {
  const decks = await listDecks();
  deck.replaceChildren(...decks.map(({ id, name }) => new Option(name, id)));
  if (decks.some(({ id }) => id === selected)) deck.value = selected;
  updateSaveBar();
}

element("new-deck").addEventListener("click", () => {
  element<HTMLFormElement>("deck-form").reset();
  element("deck-error").hidden = true;
  deckDialog.showModal();
  element("deck-name").focus();
});
element("cancel-deck").addEventListener("click", () => deckDialog.close());
element("deck-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const added = await setDeckName(element<HTMLInputElement>("deck-name").value);
    await refreshDecks(added.id);
    deckDialog.close();
  } catch (error) {
    const hint = element("deck-error");
    hint.textContent = message(error, "Could not create this deck.");
    hint.hidden = false;
  }
});

function editField(labelText: string, value: string, onInput: (value: string) => void, max?: number) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = max === undefined ? document.createElement("input") : document.createElement("textarea");
  if (max !== undefined && input instanceof HTMLTextAreaElement) {
    input.rows = 2;
    input.maxLength = max;
    input.required = true;
  } else {
    input.placeholder = "Separate tags with spaces";
  }
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  label.append(input);
  return label;
}

function updateSaveBar() {
  if (!cards.length) expandCapture(true);
  element("save-bar").hidden = !cards.length;
  element("empty-preview").hidden = !!cards.length;
  const count = `${cards.length} ${cards.length === 1 ? "card" : "cards"}`;
  element("preview-count").textContent = cards.length ? count : "";
  accept.textContent = `Save ${count} to ${deck.selectedOptions[0]?.textContent ?? "deck"}`;
}
deck.addEventListener("change", updateSaveBar);

function sourceGroup(card: Card): HTMLElement {
  const group = document.createElement("section");
  group.className = "source-group stack";
  const heading = document.createElement("div");
  heading.className = "source-heading row";
  const title = card.source?.title || "Untitled capture";
  let url: URL | undefined;
  try {
    if (card.source?.url) url = new URL(card.source.url);
  } catch {
    // Older records can have an invalid URL.
  }
  const domain = url?.hostname;
  const mark = document.createElement("span");
  mark.className = "source-mark";
  mark.textContent = (domain || title).charAt(0).toUpperCase();
  mark.setAttribute("aria-hidden", "true");
  const copy = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = title;
  const origin = document.createElement("p");
  origin.className = "hint";
  origin.textContent = domain || (url?.protocol === "file:" ? "Local file" : title === CELL_BIOLOGY_TITLE ? "Margin sample passage" : "Local capture");
  copy.append(name, origin);
  if (title === CELL_BIOLOGY_TITLE && !url) {
    const logo = document.createElement("img");
    logo.className = "source-mark";
    logo.src = "icon.svg";
    logo.alt = "";
    heading.append(logo, copy);
  } else {
    heading.append(mark, copy);
  }
  group.append(heading);
  return group;
}

function previewCard(card: Card, index: number) {
  const container = document.createElement("article");
  container.className = "surface card";
  const front = document.createElement("h3");
  front.className = "preview-front";
  const back = document.createElement("p");
  back.className = "preview-back";
  const tags = document.createElement("ul");
  tags.className = "tags";
  tags.setAttribute("aria-label", "Tags");
  const summary = document.createElement("div");
  summary.className = "card-copy";
  summary.append(front, back, tags);
  const updateCopy = () => {
    front.textContent = card.type === "cloze" ? renderFront(card.front, false) : card.front;
    back.textContent = card.back;
    fillTags(tags, card.tags);
  };
  updateCopy();

  const editor = document.createElement("div");
  editor.className = "stack";
  editor.hidden = true;
  editor.append(
    editField(card.type === "cloze" ? "Front (cloze)" : "Front", card.front, (value) => { card.front = value; }, MAX_FRONT_LENGTH),
    editField("Back", card.back, (value) => { card.back = value; }, MAX_BACK_LENGTH),
    editField("Tags", (card.tags ?? []).join(" "), (value) => { card.tags = cardTags([value]); }),
  );
  const edit = document.createElement("button");
  edit.className = "quiet small";
  edit.type = "button";
  edit.textContent = "Edit";
  edit.setAttribute("aria-expanded", "false");
  editor.id = `edit-${card.id}`;
  edit.setAttribute("aria-controls", editor.id);
  edit.addEventListener("click", () => {
    const opening = editor.hidden;
    editor.hidden = !opening;
    summary.hidden = opening;
    edit.textContent = opening ? "Done" : "Edit";
    edit.setAttribute("aria-expanded", String(opening));
    if (opening) editor.querySelector("textarea")?.focus();
    else updateCopy();
  });

  const remove = document.createElement("button");
  remove.className = "quiet small";
  remove.type = "button";
  remove.textContent = "Delete";
  remove.setAttribute("aria-label", `Delete card ${index + 1}`);
  remove.addEventListener("click", () => {
    const previousButtons = [...preview.querySelectorAll(".card-actions button:last-child")];
    const position = previousButtons.indexOf(remove);
    cards = cards.filter(({ id }) => id !== card.id);
    renderCards();
    const buttons = preview.querySelectorAll<HTMLButtonElement>(".card-actions button:last-child");
    (buttons[Math.min(position, buttons.length - 1)] ?? source).focus();
  });

  const actions = document.createElement("div");
  actions.className = "row card-actions";
  actions.append(edit, remove);
  const top = document.createElement("div");
  top.className = "row card-top";
  top.append(cardRouteBadge(card.route), actions);
  container.append(top, summary, editor);
  return container;
}

function renderCards() {
  preview.replaceChildren();
  updateSaveBar();
  const groups = new Map<string, HTMLElement>();
  cards.forEach((card, index) => {
    const key = JSON.stringify([card.source?.title, card.source?.url?.split("#")[0]]);
    let group = groups.get(key);
    if (!group) {
      group = sourceGroup(card);
      groups.set(key, group);
      preview.append(group);
    }
    group.append(previewCard(card, index));
  });
}

async function refreshQueue() {
  const entries = await db.all("queue");
  queue.hidden = !entries.length;
  queue.replaceChildren(...entries.map((entry: QueuedJob) => {
    const row = document.createElement("div");
    row.className = "row card-top";
    const title = document.createElement("span");
    title.textContent = entry.job.source?.title || "Capture";
    const state = queueState(entry);
    const label = state === "failed" ? "Failed" : state === "confirm" ? "Needs approval" : "Queued";
    row.append(routeBadge(label, state === "failed" ? "failed" : "queued", entry.lastError ?? entry.reason), title);
    if (state !== "queued") {
      const options = document.createElement("a");
      options.href = "options.html#queue-heading";
      options.target = "_blank";
      options.textContent = "Manage";
      row.append(options);
    }
    return row;
  }));
}

function reportError(error: unknown) {
  notify(message(error, "Margin could not complete this action."), true);
}

function setBusy(value: boolean) {
  busy = value;
  generate.disabled = accept.disabled = deck.disabled = source.disabled = value;
  element<HTMLButtonElement>("new-deck").disabled = value;
  editCapture.disabled = sample.disabled = notes.disabled = imageField.disabled = element<HTMLButtonElement>("clear-image").disabled = value;
  preview.inert = value;
}

async function runCapture(request: CaptureRequest) {
  if (busy) return;
  const moveFocus = captureForm.contains(document.activeElement);
  setBusy(true);
  generate.textContent = "Generating…";
  clearNotice();
  try {
    await refreshDecks();
    const selectedDeck = deck.value;
    const job = await captureSource(request, selectedDeck, notes.value, request.tabId === undefined ? image : undefined,
      (origin, purpose) => ask("host-dialog", `Margin needs site access to ${purpose} at ${origin.slice(0, -2)}.`,
        () => chrome.permissions.request({ origins: [origin] })));
    if (request.kind === "paste" && job.input.text === CELL_BIOLOGY_PASSAGE) {
      job.source = { title: CELL_BIOLOGY_TITLE };
    }
    const current = await createRuntime();
    const result = await generateCards(job, current.provider, { ...current, online: navigator.onLine }, {
      confirmCloud: (reason) => ask("cloud-dialog", reason),
      onStage: (stage) => { generate.textContent = stage; },
    });
    if (!result) {
      notify("Kept on this device. Nothing was sent.");
      return;
    }
    if (result.queued) {
      await refreshQueue();
      if (navigator.onLine) retryQueue?.();
      notify(queueRetryHelp);
      return;
    }
    const saved = (await db.all("cards")).filter(({ deckId }) => deckId === selectedDeck);
    const fresh = dedupe(result?.cards ?? [], [...saved, ...cards]);
    cards.push(...fresh);
    renderCards();
    if (fresh.length) {
      expandCapture(false);
      if (moveFocus) element("preview-heading").focus({ preventScroll: true });
    }
    if (!result?.cards?.length) notify("No cards found. Try a longer passage with complete facts.");
    else if (!fresh.length) notify("These cards are already in this deck or preview.");
  } catch (error) {
    reportError(error);
  } finally {
    setBusy(false);
    generate.textContent = "Generate";
    if (moveFocus && !captureForm.hidden && document.activeElement === document.body) generate.focus();
  }
}

captureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runCapture({ kind: source.value as SourceKind });
  void claimPending().catch(reportError);
});

accept.addEventListener("click", async () => {
  if (busy) return;
  const moveFocus = document.activeElement === accept;
  setBusy(true);
  try {
    const edited = cards.map((card, index) => {
      const valid = validate(card);
      if (!valid) throw new Error(`Card ${index + 1} needs a front and back. Cloze cards also need a {{c1::…}} deletion.`);
      return { ...card, ...valid };
    });
    const saved = await db.saveCards(deck.value, edited);
    const skipped = edited.length - saved;
    cards = [];
    renderCards();
    notify(`Saved ${saved} ${saved === 1 ? "card" : "cards"}.${skipped ? ` Skipped ${skipped} ${skipped === 1 ? "duplicate" : "duplicates"}.` : ""}`);
  } catch (error) {
    reportError(error);
  } finally {
    setBusy(false);
    if (moveFocus && document.activeElement === document.body) (cards.length ? accept : source).focus();
    void claimPending().catch(reportError);
  }
});

async function claimPending() {
  if (claiming || busy) return;
  claiming = true;
  try {
    const { id } = await chrome.windows.getCurrent();
    const prefix = `${PENDING_CAPTURE_PREFIX}${id}.`;
    await navigator.locks.request(prefix, async () => {
      while (!busy) {
        const pending = await chrome.storage.session.get();
        if (busy) return;
        const key = Object.keys(pending).filter((entry) => entry.startsWith(prefix)).sort()[0];
        if (!key) return;
        const request = pending[key] as CaptureRequest;
        source.value = request.kind;
        showSourceFields();
        await runCapture(request);
        await chrome.storage.session.remove(key);
      }
    });
  } finally {
    claiming = false;
  }
}

async function start() {
  const { welcomeSeen } = await chrome.storage.local.get("welcomeSeen");
  welcome.hidden = welcomeSeen === true;
  await refreshDecks();
  showSourceFields();
  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg.type === "margin.capture") void claimPending().catch(reportError);
    if (msg.type === "margin.queueChanged") retryQueue?.();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.mock || changes.privacyMode || changes.modeOverride || changes.appCheckDebugToken)) {
      void refreshStatus().catch(reportError);
    }
    if (area === "session" && Object.keys(changes).some((key) => key.startsWith(PENDING_CAPTURE_PREFIX))) {
      void claimPending().catch(reportError);
    }
  });
  window.addEventListener("focus", () => {
    if (!busy) void refreshDecks().catch(reportError);
    void refreshQueue().catch(reportError);
  });
  const queueDrain = startQueueDrain(async (job) => {
    const current = await createRuntime();
    const result = await generateCards(job, current.provider, { ...current, online: navigator.onLine }, { queueIfOffline: false });
    return result?.confirm ? { confirm: result.confirm } : result?.cards;
  }, reportError, () => { void refreshQueue().catch(reportError); });
  retryQueue = queueDrain.drain;
  window.addEventListener("offline", () => {
    showOfflineStatus();
    void refreshQueue().catch(reportError);
  });
  window.addEventListener("online", () => {
    void refreshStatus().catch(reportError);
    void refreshQueue().catch(reportError);
    retryQueue?.();
  });
  window.addEventListener("pagehide", queueDrain.stop, { once: true });
  await Promise.all([refreshStatus(), refreshQueue(), claimPending()]);
}

void start().catch(reportError);
