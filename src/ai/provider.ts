import { InferenceMode, InferenceSource } from "firebase/ai";
import type { Card } from "../cards/schema";

export type MediaInput =
  | { kind: "pdf"; mimeType: "application/pdf"; data: string }
  | { kind: "image"; mimeType: string; data: string };

export type ContentInput =
  | { kind: "text"; text: string }
  | { kind: "youtube"; url: string; text?: never }
  | (MediaInput & { text?: string });

export interface GenerationJob {
  input: ContentInput;
  deckId: string;
  sensitive?: boolean;
  source?: Card["source"];
  anchorPage?: boolean;
}

export type InferenceTask =
  | { kind: "cards"; input: ContentInput; quoteSource?: boolean }
  | { kind: "grade"; question: string; expected: string; answer: string }
  | { kind: "sensitivity"; text: string };

export type LocalAvailability = "available" | "downloadable" | "downloading" | "unavailable";

export interface InferenceRequest {
  task: InferenceTask;
  mode: InferenceMode;
  reason: string;
  cloudModel: string;
  repair?: boolean;
}

export interface InferenceResult {
  text: string;
  source: InferenceSource;
  simulated?: boolean;
  reason: string;
}

export interface AIProvider {
  status(input?: ContentInput): Promise<{ nano: LocalAvailability }>;
  initializeDeviceModel(onProgress?: (progress: number) => void): Promise<void>;
  generate(request: InferenceRequest): Promise<InferenceResult>;
}

export function routeReason(mode: InferenceMode, source: InferenceSource, reason: string): string {
  if (mode === InferenceMode.PREFER_ON_DEVICE) {
    return source === InferenceSource.ON_DEVICE ? `${reason} — Firebase AI Logic preferred Gemini Nano`
      : "Gemini Nano not ready — Firebase AI Logic fell back to cloud";
  }
  if (mode === InferenceMode.PREFER_IN_CLOUD && source === InferenceSource.ON_DEVICE) {
    return "Cloud inference unavailable — Firebase AI Logic fell back to Gemini Nano";
  }
  return reason;
}
