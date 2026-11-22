import { InferenceMode, InferenceSource } from "firebase/ai";
import { dedupe } from "../cards/dedupe";
import { parseCardResponse } from "../cards/parse";
import type { Card, Route } from "../cards/schema";
import { shouldUseMock } from "../firebase/config";
import { initializeFirebase } from "../firebase/init";
import { loadRemoteConfig, MAX_INPUT_BUDGET, type RoutingConfig } from "../firebase/remoteConfig";
import { normalizeAnchorText, pageFragmentUrl } from "../sources/selection";
import { readSettings, type ModeOverride } from "../storage/settings";
import { FirebaseProvider } from "./firebaseProvider";
import { MAX_DEMO_CARDS, MockProvider } from "./mockProvider";
import type { AIProvider, GenerationJob, InferenceRequest } from "./provider";
import { enqueue, type QueuedJob } from "./queue";
import { chunkText, decide, estimateInputTokens, isSensitive, type RoutingContext } from "./router";

export async function createRuntime() {
  const settings = await readSettings();
  const mock = shouldUseMock(settings.mock);
  const app = mock ? undefined : initializeFirebase(settings);
  // Reuse the settings snapshot for one job so its privacy decisions stay consistent.
  const config = await loadRemoteConfig(app);
  const provider = app ? new FirebaseProvider(app, config) : new MockProvider(config);
  return { mock, provider, config, privacyMode: settings.privacyMode, modeOverride: settings.modeOverride };
}

export interface GenerationContext {
  config: RoutingConfig;
  privacyMode: boolean;
  online: boolean;
  modeOverride?: ModeOverride;
}

type GeneratedCard = Card & { route: Route };
type GenerationOutcome =
  | { cards: GeneratedCard[]; queued?: never; confirm?: never }
  | { cards?: never; queued: QueuedJob; confirm?: never }
  | { cards?: never; queued?: never; confirm: string };

export async function generateCards(
  job: GenerationJob,
  provider: AIProvider,
  { config, privacyMode, online, modeOverride }: GenerationContext,
  { queueIfOffline = true, confirmCloud, onStage }: {
    queueIfOffline?: boolean;
    confirmCloud?: (reason: string) => Promise<boolean>;
    onStage?: (stage: string) => void;
  } = {},
): Promise<GenerationOutcome | undefined> {
  const ctx: RoutingContext = {
    ...config, privacyMode, online, modeOverride, nano: (await provider.status(job.input)).nano,
  };
  let decision = decide(job, ctx);
  if (decision.mode === "confirm") {
    if (job.cloudApproved !== true) {
      if (!confirmCloud) return { confirm: decision.reason };
      if (!await confirmCloud(decision.reason)) return;
    }
    ctx.confirmedCloud = true;
    decision = decide(job, ctx);
  }
  if (decision.mode !== "queue" && decision.mode !== "confirm" && decision.mode !== InferenceMode.ONLY_ON_DEVICE &&
      ctx.sensitivityCheck && !!job.input.text?.trim() && !ctx.confirmedCloud &&
      !isSensitive(job, ctx) && (await provider.status()).nano === "available") {
    onStage?.("Checking privacy on-device…");
    ctx.classifiedSensitive = await classify(job.input.text ?? "", provider, config);
    decision = decide(job, ctx);
  }
  if (decision.mode === "confirm") return { confirm: decision.reason };
  if (decision.mode === "queue") {
    if (!queueIfOffline) return;
    const reason = provider instanceof MockProvider ? `Simulated — ${decision.reason}` : decision.reason;
    const queuedJob = ctx.confirmedCloud ? { ...job, cloudApproved: true } : job;
    return { queued: await enqueue(queuedJob, reason) };
  }

  onStage?.(decision.mode === InferenceMode.ONLY_ON_DEVICE ? "Generating on-device…" : "Generating…");
  const inputs = decision.chunks?.map((text) => ({ kind: "text" as const, text })) ?? [job.input];
  const pageUrl = job.anchorPage ? job.source?.url : undefined;
  const pageText = pageUrl ? normalizeAnchorText(job.input.text ?? "").toLowerCase() : "";
  const sentences = pageUrl && inputs.length > 1 ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : undefined;
  const cards: GeneratedCard[] = [];
  for (const input of inputs) {
    const started = performance.now();
    const request: InferenceRequest = {
      task: { kind: "cards", input, ...(pageUrl && { quoteSource: true }) },
      mode: decision.mode,
      reason: decision.reason,
      cloudModel: decision.cloudModel,
    };
    const { drafts, result } = await cardResponse(provider, request, config.maxCardsPerChunk);
    const route = {
      source: result.source, reason: result.reason, tokensEst: estimateInputTokens(input),
      ms: Math.round(performance.now() - started),
      runId: crypto.randomUUID(),
      simulated: result.simulated ?? false,
      localBytes: result.source === InferenceSource.ON_DEVICE
        ? new TextEncoder().encode(input.text ?? "").length + (input.kind === "image" ? Math.floor(input.data.replace(/=+$/u, "").length * 3 / 4) : 0)
        : 0,
    };
    const chunk = pageUrl ? normalizeAnchorText(input.text ?? "") : "";
    const firstSentence = sentences?.segment(input.text ?? "")[Symbol.iterator]().next().value?.segment;
    const chunkUrl = pageUrl && firstSentence ? pageFragmentUrl(pageUrl, pageText, chunk, firstSentence) : undefined;
    for (const { sourceQuote, ...draft } of drafts) {
      const url = pageUrl && sourceQuote ? pageFragmentUrl(pageUrl, pageText, chunk, sourceQuote) : undefined;
      const source = pageUrl ? { ...job.source, url: url ?? chunkUrl ?? pageUrl } : job.source;
      cards.push({ ...draft, id: crypto.randomUUID(), deckId: job.deckId, createdAt: Date.now(), source, route });
    }
  }
  const unique = dedupe(cards);
  return { cards: provider instanceof MockProvider ? unique.slice(0, MAX_DEMO_CARDS) : unique };
}

async function cardResponse(provider: AIProvider, request: InferenceRequest, limit: number) {
  for (const repair of [false, true]) {
    const result = await provider.generate({ ...request, repair });
    if (request.mode === InferenceMode.ONLY_ON_DEVICE && result.source !== InferenceSource.ON_DEVICE) {
      throw new Error("The provider returned a cloud result for an on-device request.");
    }
    const drafts = parseCardResponse(result.text, limit, request.task.kind === "cards" && request.task.quoteSource);
    if (drafts) return { drafts, result };
  }
  throw new Error("The model did not return valid flashcards.");
}

async function classify(text: string, provider: AIProvider, config: RoutingConfig): Promise<boolean> {
  for (const chunk of chunkText(text, Math.min(config.maxOnDeviceTokens, MAX_INPUT_BUDGET))) {
    if (!chunk.trim()) continue;
    try {
      const result = await provider.generate({
        task: { kind: "sensitivity", text: chunk },
        mode: InferenceMode.ONLY_ON_DEVICE,
        reason: "Check for sensitive content on-device before allowing cloud inference.",
        cloudModel: config.cloudModel,
      });
      if (result.source !== InferenceSource.ON_DEVICE) return true;
      const json = result.text.match(/\{[\s\S]*\}/u)?.[0];
      if (!json || !/^\{\s*"sensitive"\s*:\s*false\s*,?\s*\}$/u.test(json)) return true;
    } catch {
      return true;
    }
  }
  return false;
}
