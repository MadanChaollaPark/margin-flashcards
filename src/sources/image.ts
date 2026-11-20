import type { MediaInput } from "../ai/provider";

export function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(""));
}

export async function readImage(file: Blob): Promise<MediaInput> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file to generate cards.");
  if (["image/png", "image/jpeg"].includes(file.type)) {
    return { kind: "image", mimeType: file.type, data: encodeBase64(new Uint8Array(await file.arrayBuffer())) };
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    return readImage(await canvas.convertToBlob({ type: "image/png" }));
  } finally {
    bitmap.close();
  }
}

export async function captureImage(tab: chrome.tabs.Tab): Promise<MediaInput> {
  const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active?.id !== tab.id) throw new Error("Switch to the source tab before capturing a screenshot.");
  const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  return { kind: "image", mimeType: "image/png", data: url.slice(url.indexOf(",") + 1) };
}
