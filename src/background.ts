import { PENDING_CAPTURE_PREFIX, type CaptureRequest } from "./sources/request";
import { syncBackup } from "./firebase/sync";

chrome.storage.onChanged.addListener((changes, area) => {
  const token = changes.appCheckDebugToken;
  // App Check reads the debug token once per JavaScript context.
  if (area === "local" && token && token.oldValue !== token.newValue) chrome.runtime.reload();
});

chrome.runtime.onMessage.addListener((request, _sender, respond) => {
  const automatic = request?.type === "margin.backupChanged";
  if (!automatic && request?.type !== "margin.backup" && request?.type !== "margin.restoreBackup") return;
  void syncBackup(request.type === "margin.restoreBackup" ? "restore" : "write", automatic)
    .then((result) => respond({ result }))
    .catch((error: unknown) => {
      if (automatic) console.warn("Margin could not update the Firestore backup.", error);
      respond({ error: error instanceof Error ? error.message : "Firestore backup failed." });
    });
  return true;
});

const menus = [
  { id: "margin-selection", title: "Make flashcards from selection", contexts: ["selection"] },
  { id: "margin-page", title: "Make flashcards from this page", contexts: ["page"] },
  { id: "margin-image", title: "Make flashcards from image", contexts: ["image"] },
] satisfies chrome.contextMenus.CreateProperties[];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const menu of menus) chrome.contextMenus.create(menu);
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined || !menus.some(({ id }) => id === info.menuItemId)) return;
  const kind = String(info.menuItemId).slice("margin-".length) as CaptureRequest["kind"];
  const request: CaptureRequest = {
    kind, tabId: tab.id, frameId: info.frameId, frameUrl: info.frameUrl,
    selectionText: info.selectionText, imageUrl: info.srcUrl,
  };
  const key = `${PENDING_CAPTURE_PREFIX}${tab.windowId}.${Date.now()}.${crypto.randomUUID()}`;
  const open = chrome.sidePanel.open({ windowId: tab.windowId });
  const store = chrome.storage.session.set({ [key]: request });
  void Promise.all([open, store])
    .then(() => chrome.runtime.sendMessage({ type: "margin.capture", windowId: tab.windowId }).catch(() => {}))
    .catch((error: unknown) => console.error("Margin could not open the side panel.", error));
});
