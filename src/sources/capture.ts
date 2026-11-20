import type { GenerationJob } from "../ai/provider";
import { captureImage, readImage } from "./image";
import { extractPage } from "./page";
import { pdfInput } from "./pdf";
import type { CaptureRequest } from "./request";
import { readSelection, textFragmentUrl } from "./selection";
import { fetchTranscript, readCaptionTracks, youtubeVideoUrl } from "./youtube";

type RequestAccess = (origin: string, purpose: string) => Promise<boolean>;

async function obtainAccess(url: string, purpose: string, requestAccess: RequestAccess): Promise<boolean> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  const origin = `${parsed.protocol}//${parsed.hostname}/*`;
  return !await chrome.permissions.contains({ origins: [origin] }) && await requestAccess(origin, purpose);
}

export async function captureSource(
  request: CaptureRequest, deckId: string, notes: string, image: File | undefined, requestAccess: RequestAccess,
): Promise<GenerationJob> {
  const { kind, tabId, frameId, selectionText } = request;
  if (kind === "paste") {
    if (!notes.trim()) throw new Error("Paste some notes to generate flashcards.");
    return { deckId, input: { kind: "text", text: notes.trim() }, source: { title: "Pasted notes" } };
  }
  if (kind === "image" && image) {
    return { deckId, input: await readImage(image), source: { title: image.name || "Pasted image" } };
  }

  const tab = tabId === undefined
    ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
    : await chrome.tabs.get(tabId);
  if (tab?.id === undefined || !tab.url) throw new Error("Open the source tab and click Margin in the Chrome toolbar to give it access, then try again.");
  const source = { url: tab.url, title: tab.title };
  const captureUrl = request.frameUrl ?? tab.url;
  const target = { tabId: tab.id, ...(frameId !== undefined && { frameIds: [frameId] }) };
  async function withSiteAccess<T>(
    capture: () => Promise<T>, purpose: string, canRequest = (_error: unknown) => true,
  ): Promise<T> {
    try {
      return await capture();
    } catch (error) {
      if (!canRequest(error) || !await obtainAccess(captureUrl, purpose, requestAccess)) throw error;
      return capture();
    }
  }


  switch (kind) {
    case "selection": {
      const [result] = await chrome.scripting.executeScript({ target, func: readSelection }).catch((error: unknown) => {
        if (!selectionText) throw error;
        return [];
      });
      const text = selectionText || result?.result?.text;
      if (!text) throw new Error("Highlight text in the source tab, then generate again.");
      return {
        deckId, input: { kind: "text", text },
        source: { url: textFragmentUrl(result?.result?.url ?? request.frameUrl ?? tab.url, text), title: result?.result?.title || tab.title },
      };
    }
    case "page": {
      const [result] = await withSiteAccess(() => chrome.scripting.executeScript({ target, func: extractPage }), "read this page");
      if (!result?.result) throw new Error("This page has no readable text. Try selecting a passage or pasting notes.");
      const pageUrl = new URL(captureUrl);
      pageUrl.hash = pageUrl.hash.split(":~:")[0];
      source.url = pageUrl.href;
      return { deckId, source, anchorPage: true, input: { kind: "text", text: result.result } };
    }
    case "pdf":
      return { deckId, source, input: await withSiteAccess(() => pdfInput(captureUrl), "download this PDF", (error) => error instanceof TypeError) };
    case "youtube": {
      const url = youtubeVideoUrl(tab.url);
      if (!url) throw new Error("Open a YouTube video before generating from captions.");
      const [result] = await withSiteAccess(() => chrome.scripting.executeScript({ target, world: "MAIN", func: readCaptionTracks }), "read this video page");
      const text = await fetchTranscript(result?.result ?? []);
      return { deckId, source, input: text ? { kind: "text", text } : { kind: "youtube", url } };
    }
    case "image": {
      if (request.imageUrl && /^https?:/u.test(request.imageUrl)) {
        try {
          const response = await fetch(request.imageUrl, { credentials: "include" });
          if (response.ok) return { deckId, source, input: await readImage(await response.blob()) };
        } catch {
          // Capture the visible tab when the image resource is inaccessible.
        }
      }
      return { deckId, source, input: await captureImage(tab) };
    }
  }
}
