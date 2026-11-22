import type { MediaInput } from "../ai/provider";

// 14 MB of raw media becomes about 18.7 MB in base64, leaving room for the prompt under the 20 MB request cap.
export const MAX_INLINE_MEDIA_BYTES = 14_000_000;

export function assertInlineMediaSize(byteLength: number, message: string): void {
  if (byteLength > MAX_INLINE_MEDIA_BYTES) throw new Error(message);
}

export function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(""));
}

export function sniffImageType(bytes: Uint8Array): string | undefined {
  const header = String.fromCharCode(...bytes.subarray(0, 12));
  if (header.startsWith("\x89PNG\r\n\x1a\n")) return "image/png";
  if (header.startsWith("\xff\xd8\xff")) return "image/jpeg";
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "image/gif";
  if (header.startsWith("RIFF") && header.startsWith("WEBP", 8)) return "image/webp";
}

export async function readImage(file: Blob): Promise<MediaInput> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file to generate cards.");
  if (["image/png", "image/jpeg"].includes(file.type)) {
    assertInlineMediaSize(file.size, "This image is too large to send (max 14 MB). Use a smaller or compressed image.");
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
  const data = url.slice(url.indexOf(",") + 1);
  const byteLength = Math.floor(data.replace(/=+$/u, "").length * 3 / 4);
  assertInlineMediaSize(byteLength, "The screenshot is too large to send (max 14 MB). Try capturing a smaller browser window.");
  return { kind: "image", mimeType: "image/png", data };
}
