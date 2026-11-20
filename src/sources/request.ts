export type SourceKind = "selection" | "page" | "pdf" | "youtube" | "image" | "paste";

export interface CaptureRequest {
  kind: SourceKind;
  tabId?: number;
  frameId?: number;
  selectionText?: string;
  frameUrl?: string;
  imageUrl?: string;
}

export const PENDING_CAPTURE_PREFIX = "margin.capture.";
