import { InferenceMode } from "firebase/ai";
import { MAX_INPUT_BUDGET, type RoutingConfig } from "../firebase/remoteConfig";
import type { ContentInput, GenerationJob, LocalAvailability } from "./provider";
import type { ModeOverride } from "../storage/settings";

export interface RoutingContext extends RoutingConfig {
  nano: LocalAvailability;
  online: boolean;
  privacyMode: boolean;
  modeOverride?: ModeOverride;
  classifiedSensitive?: boolean;
  confirmedCloud?: boolean;
}

type InferenceDecision = { mode: InferenceMode; reason: string; cloudModel: string; chunks?: string[] };
type Decision = InferenceDecision | { mode: "queue"; reason: string } | { mode: "confirm"; reason: string };

const CHARS_PER_TOKEN = 4;
const IMAGE_TOKEN_ALLOWANCE = 1_024;
const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\u3000-\u303f\uff00-\uffef]/u;

function characterCost(character: string): number {
  return CJK.test(character) || character.length > 1 ? CHARS_PER_TOKEN : 1;
}

function textCost(text: string): number {
  let cost = 0;
  for (const character of text) cost += characterCost(character);
  return cost;
}

export function estimateTokens(text: string): number {
  return Math.ceil(textCost(text) / CHARS_PER_TOKEN);
}

export function estimateInputTokens(input: ContentInput): number {
  return estimateTokens(input.text ?? "") + (input.kind === "image" ? IMAGE_TOKEN_ALLOWANCE : 0);
}

export function canRunOnDevice(input: ContentInput): boolean {
  return input.kind === "text" ||
    (input.kind === "image" && ["image/png", "image/jpeg"].includes(input.mimeType));
}

function splitOversizedSentence(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  let end = 0;
  let boundary = 0;
  let boundaryCost = 0;
  let cost = 0;
  for (const character of text) {
    const nextCost = characterCost(character);
    if (cost + nextCost > limit) {
      const split = cost - boundaryCost + nextCost <= limit && boundaryCost >= limit / 2 ? boundary : end;
      chunks.push(text.slice(start, split));
      start = split;
      cost = split === boundary ? cost - boundaryCost : 0;
      boundary = start;
      boundaryCost = 0;
    }
    end += character.length;
    cost += nextCost;
    if (/\s/u.test(character)) {
      boundary = end;
      boundaryCost = cost;
    }
  }
  if (start < end) chunks.push(text.slice(start));
  return chunks;
}

export function chunkText(text: string, budget: number): string[] {
  const limit = budget * CHARS_PER_TOKEN;
  if (!Number.isSafeInteger(limit) || limit < CHARS_PER_TOKEN) throw new RangeError("Invalid token budget.");
  if (!text || estimateTokens(text) <= budget) return text ? [text] : [];

  const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
  const units = Array.from(segmenter.segment(text)).flatMap(({ segment }) => {
    const parts = splitOversizedSentence(segment, limit);
    return parts.map((part) => ({ text: part, cost: textCost(part), wholeSentence: parts.length === 1 }));
  });
  const chunks: string[] = [];
  let start = 0;
  let cost = 0;
  for (const [index, unit] of units.entries()) {
    if (cost + unit.cost > limit) {
      chunks.push(units.slice(start, index).map((part) => part.text).join(""));
      const target = cost * 0.1;
      let overlap = 0;
      let nextStart = index;
      // Leave room for new content and keep the overlap at whole sentences.
      for (let previous = index - 1; previous > start; previous--) {
        const sentence = units[previous];
        const next = overlap + sentence.cost;
        if (!sentence.wholeSentence || next + unit.cost > limit || next > target * 2 ||
            (overlap && Math.abs(next - target) >= Math.abs(overlap - target))) break;
        overlap = next;
        nextStart = previous;
      }
      cost = overlap;
      start = nextStart;
    }
    cost += unit.cost;
  }
  chunks.push(units.slice(start).map((part) => part.text).join(""));
  return chunks;
}

const PRIVATE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b\d{3}-\d{2}-\d{4}\b/u,
  /(?<![\d-])(?:\+1[ .-]?)?(?:\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]\d{4}(?![\d-])/u,
  /\b(?:password|api[ _-]?key|access[ _-]?token)\s*[:=]\s*\S+/iu,
  /\b(?:strictly confidential|internal use only|do not distribute)\b/iu,
];

function validCardNumber(candidate: string): boolean {
  const digits = candidate.replace(/\D/gu, "");
  if (digits.length < 13 || digits.length > 19 || /^0|^(\d)\1+$/u.test(digits)) return false;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index--) {
    const digit = Number(digits[index]);
    const value = (digits.length - index) % 2 === 0 ? digit * 2 : digit;
    sum += value > 9 ? value - 9 : value;
  }
  return sum % 10 === 0;
}

export function hasSensitiveText(text: string): boolean {
  const withoutIsbn = text.replace(/\bISBN(?:-1[03])?\s*:?\s*(?:97[89](?:[ -]?\d){10}|(?:\d[ -]?){9}[\dX])(?!\d)/giu, "");
  if (PRIVATE_PATTERNS.some((pattern) => pattern.test(withoutIsbn))) return true;
  return [...withoutIsbn.matchAll(/\b\d(?:[ -]?\d){12,}(?!\w)/gu)].some(([candidate]) =>
    !/^97[89](?:[ -]?\d){10}$/u.test(candidate) && validCardNumber(candidate));
}

export function isSensitive(job: GenerationJob, ctx: RoutingContext): boolean {
  return job.sensitive === true || ctx.classifiedSensitive === true ||
    (ctx.sensitivityCheck && !ctx.confirmedCloud && hasSensitiveText(job.input.text ?? ""));
}

export function nanoHint(nano: LocalAvailability): string {
  if (nano === "downloadable") return "Gemini Nano is ready to download. Click Enable on-device AI.";
  if (nano === "downloading") return "Gemini Nano is downloading. Click Enable on-device AI to check progress.";
  return "Gemini Nano is unavailable in this browser or for this input.";
}

export function decide(job: GenerationJob, ctx: RoutingContext): Decision {
  const { input } = job;
  const available = ctx.nano === "available";
  const sensitive = isSensitive(job, ctx);
  const localOnly = ctx.privacyMode || ctx.modeOverride === "only-device";
  const supported = canRunOnDevice(input);
  const budget = Math.min(ctx.maxOnDeviceTokens, MAX_INPUT_BUDGET);
  const overBudget = estimateInputTokens(input) > budget;
  const needsCloud = input.kind === "pdf" ? "PDFs without enough extractable text require cloud inference."
    : input.kind === "youtube" ? "YouTube videos without accessible captions require cloud inference."
    : "This image format requires cloud inference.";
  const local = (reason: string): InferenceDecision => {
    const chunks = overBudget && input.kind === "text" ? chunkText(input.text, budget) : undefined;
    return {
      mode: InferenceMode.ONLY_ON_DEVICE, cloudModel: ctx.cloudModel, chunks,
      reason: chunks ? `${reason} Split into ${chunks.length} on-device chunks.` : reason,
    };
  };

  if (sensitive && !localOnly && !available && !job.sensitive && !ctx.classifiedSensitive) {
    return { mode: "confirm", reason: `This capture may contain sensitive information. ${nanoHint(ctx.nano)}` };
  }

  if (localOnly || sensitive) {
    const reason = ctx.privacyMode ? "Privacy mode keeps this content on-device."
      : sensitive ? "Sensitive content stays on-device." : "Your settings require on-device inference.";
    if (input.kind === "pdf") throw new Error(`${reason} Extract the PDF text and try again with the text.`);
    if (input.kind === "youtube") throw new Error(`${reason} Paste the video's transcript to generate cards from it.`);
    if (!supported) throw new Error(`${reason} Convert the image to PNG or JPEG and try again.`);
    if (!available) throw new Error(`${reason} ${nanoHint(ctx.nano)}`);
    if (overBudget && input.kind !== "text") throw new Error(`${reason} Remove some accompanying text or use a smaller image.`);
    return local(reason);
  }

  const onlyCloud = ctx.modeOverride === "only-cloud";
  if (!ctx.online) {
    if (!onlyCloud && available && supported && (!overBudget || input.kind === "text")) {
      return local("Offline. Gemini Nano can process this on-device.");
    }
    const why = onlyCloud ? "Your settings require cloud inference." : !supported ? needsCloud : overBudget
      ? "This input exceeds the on-device token budget." : nanoHint(ctx.nano);
    return { mode: "queue", reason: `Offline. ${why} Queued until a connection is available.` };
  }

  const cloudModel = input.kind === "pdf" || input.kind === "youtube" || overBudget ? ctx.longDocModel : ctx.cloudModel;
  const cloud = (reason: string): InferenceDecision => ({ mode: InferenceMode.ONLY_IN_CLOUD, reason, cloudModel });
  if (ctx.confirmedCloud && !available) return cloud("You approved cloud inference for this capture.");
  if (!supported) return cloud(needsCloud);
  if (onlyCloud) return cloud("Your settings require cloud inference.");
  if (overBudget) {
    if (ctx.modeOverride === "prefer-device" && available && input.kind === "text") {
      return local("Your settings prefer on-device inference.");
    }
    return {
      mode: input.kind === "text" ? InferenceMode.PREFER_IN_CLOUD : InferenceMode.ONLY_IN_CLOUD,
      reason: "This input exceeds the on-device token budget.", cloudModel,
    };
  }
  if (ctx.modeOverride === "prefer-cloud") {
    return { mode: InferenceMode.PREFER_IN_CLOUD, reason: "Your settings prefer cloud inference.", cloudModel };
  }
  return { mode: InferenceMode.PREFER_ON_DEVICE, reason: "Fits on-device budget", cloudModel };
}
