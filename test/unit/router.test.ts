import assert from "node:assert/strict";
import { test } from "node:test";
import { InferenceMode } from "firebase/ai";
import { chunkText, decide, estimateTokens, hasSensitiveText, type RoutingContext } from "../../src/ai/router";
import type { ContentInput, GenerationJob } from "../../src/ai/provider";
import { DEFAULTS } from "../../src/firebase/remoteConfig";

const ctx: RoutingContext = { ...DEFAULTS, nano: "available", online: true, privacyMode: false };
const text = "Plants use sunlight to produce sugar.";
const long = text.repeat(2_223);
const asJob = (input: ContentInput): GenerationJob => ({ input, deckId: "notes" });
const notes = asJob({ kind: "text", text });
const longDoc = asJob({ kind: "text", text: long });
const pdf = asJob({ kind: "pdf", mimeType: "application/pdf", data: "cGRm" });
const image = (mimeType: string) => asJob({ kind: "image", mimeType, data: "aW1hZ2U=" });

function route(job = notes, overrides: Partial<RoutingContext> = {}) {
  const decision = decide(job, { ...ctx, ...overrides });
  assert.ok(decision.reason.trim());
  return decision;
}

test("Auto prefers Nano for compatible short inputs and lets Firebase fall back", () => {
  assert.equal(route().mode, InferenceMode.PREFER_ON_DEVICE);
  assert.equal(route(notes, { nano: "unavailable" }).mode, InferenceMode.PREFER_ON_DEVICE);
  for (const mimeType of ["image/png", "image/jpeg"]) {
    assert.equal(route(image(mimeType)).mode, InferenceMode.PREFER_ON_DEVICE);
    assert.equal(route(image(mimeType), { nano: "downloadable" }).mode, InferenceMode.PREFER_ON_DEVICE);
  }
  assert.equal(route(image("image/webp")).mode, InferenceMode.ONLY_IN_CLOUD);
  assert.equal(route(image("image/png"), { maxOnDeviceTokens: 1_023 }).mode, InferenceMode.ONLY_IN_CLOUD);
});

test("decide produces all four Firebase inference modes", () => {
  assert.deepEqual(
    new Set([route().mode, route(notes, { privacyMode: true }).mode, route(pdf).mode, route(longDoc).mode]),
    new Set(Object.values(InferenceMode)),
  );
});

test("routes PDF bytes to the cloud and suggests text extraction in privacy mode", () => {
  const decision = route(pdf);
  assert.equal(decision.mode, InferenceMode.ONLY_IN_CLOUD);
  assert.equal(decision.cloudModel, DEFAULTS.longDocModel);
  assert.throws(() => route(pdf, { privacyMode: true }), /extract the PDF text/i);
});

test("sends roughly 20k tokens to the long-doc model and chunks sensitive text", () => {
  assert.ok(estimateTokens(long) >= 20_000);
  const cloud = route(longDoc);
  assert.equal(cloud.mode, InferenceMode.PREFER_IN_CLOUD);
  assert.equal(cloud.cloudModel, DEFAULTS.longDocModel);

  for (const privacyMode of [false, true]) {
    const local = route({ ...longDoc, sensitive: !privacyMode }, { privacyMode });
    assert.equal(local.mode, InferenceMode.ONLY_ON_DEVICE);
    assert.ok(local.chunks && local.chunks.length > 1);
    assert.ok(local.chunks.every((chunk) => estimateTokens(chunk) <= DEFAULTS.maxOnDeviceTokens));
  }

  const unicode = "aaa🌱bbb cc";
  assert.equal(chunkText(unicode, 1).join(""), unicode);
  assert.ok(!chunkText(unicode, 1).some((chunk) => /[\uD800-\uDBFF]$/u.test(chunk)));
});

test("local chunks overlap by about ten percent at sentence boundaries", () => {
  const sentences = Array.from({ length: 23 }, (_, i) => `Sentence ${String(i).padStart(2, "0")} contains one fact. `);
  const text = sentences.join("");
  const budget = estimateTokens(sentences.slice(0, 10).join(""));
  const chunks = chunkText(text, budget);
  assert.deepEqual(chunks, [
    sentences.slice(0, 10).join(""),
    sentences.slice(9, 19).join(""),
    sentences.slice(18).join(""),
  ]);
  assert.ok(chunks.every((chunk) => estimateTokens(chunk) <= budget));
});

test("privacy mode stays local and reports when Nano is unavailable", () => {
  assert.equal(route(notes, { privacyMode: true }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.throws(() => route(notes, { privacyMode: true, nano: "unavailable" }), /Gemini Nano is unavailable/i);
  assert.throws(() => route(image("image/gif"), { privacyMode: true }), /PNG or JPEG/i);
});

test("PII, explicit labels and Nano classifications pin content on-device", () => {
  for (const value of ["learner@example.invalid", "123-45-6789", "(555) 010-0123",
    "access_token = fake-example", "strictly confidential", "4111 1111 1111 1111"]) {
    assert.ok(hasSensitiveText(value), value);
    assert.equal(route(asJob({ kind: "text", text: value })).mode, InferenceMode.ONLY_ON_DEVICE);
  }
  assert.equal(route(notes, { classifiedSensitive: true }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(route(notes, { classifiedSensitive: true, sensitivityCheck: false }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(route({ ...notes, sensitive: true }, { sensitivityCheck: false }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.throws(() => route({ ...notes, sensitive: true }, { nano: "unavailable" }), /sensitive content stays on-device/i);
});

test("runs compatible jobs locally while offline and queues cloud jobs", () => {
  assert.equal(route(notes, { online: false }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(route(notes, { online: false, nano: "unavailable" }).mode, "queue");
  assert.equal(route(pdf, { online: false }).mode, "queue");
  const offline = route(longDoc, { online: false });
  assert.equal(offline.mode, InferenceMode.ONLY_ON_DEVICE);
  assert.ok(offline.chunks && offline.chunks.length > 1);
  assert.equal(route({ ...longDoc, sensitive: true }, { online: false }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.throws(() => route({ ...notes, sensitive: true }, { online: false, nano: "unavailable" }), /Nano is unavailable/i);
});

test("honors overrides while preserving privacy and sensitivity and queues offline cloud-only jobs", () => {
  assert.equal(decide(notes, { ...ctx, modeOverride: "only-cloud" }).mode, InferenceMode.ONLY_IN_CLOUD);
  assert.equal(decide(notes, { ...ctx, modeOverride: "only-cloud", online: false }).mode, "queue");
  assert.equal(decide(notes, { ...ctx, modeOverride: "prefer-cloud" }).mode, InferenceMode.PREFER_IN_CLOUD);
  assert.equal(decide(notes, { ...ctx, modeOverride: "only-device" }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(decide(longDoc, { ...ctx, modeOverride: "prefer-device" }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(decide(notes, { ...ctx, modeOverride: "only-cloud", privacyMode: true }).mode, InferenceMode.ONLY_ON_DEVICE);
  assert.equal(decide({ ...notes, sensitive: true }, { ...ctx, modeOverride: "only-cloud" }).mode, InferenceMode.ONLY_ON_DEVICE);
  const video = asJob({ kind: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  assert.equal(decide(video, ctx).mode, InferenceMode.ONLY_IN_CLOUD);
  assert.throws(() => decide(video, { ...ctx, privacyMode: true }), /paste the video's transcript/iu);
});

test("a regex-only match with Nano missing requires per-capture consent", () => {
  const job = asJob({ kind: "text", text: "Write to learner@example.invalid for workshop details." });
  const missing = { nano: "unavailable" } as const;
  assert.equal(route(job, missing).mode, "confirm");
  assert.equal(route(job, { ...missing, online: false }).mode, "confirm");
  assert.equal(route(job, { ...missing, confirmedCloud: true }).mode, InferenceMode.ONLY_IN_CLOUD);
  assert.throws(() => route(job, { ...missing, privacyMode: true, confirmedCloud: true }), /privacy mode/i);
  assert.match(route(job, { nano: "downloadable" }).reason, /Click Enable on-device AI/u);
  assert.equal(route(notes, { nano: "downloading" }).mode, InferenceMode.PREFER_ON_DEVICE);
});

test("rejects ISBNs and non-Luhn numbers without losing valid card patterns", () => {
  for (const value of ["ISBN 978-1-4028-9462-6", "ISBN-10: 1-56619-909-3", "9781402894626",
    "4111 1111 1111 1112", "123456789012345678901", "1111111111111111"]) {
    assert.equal(hasSensitiveText(value), false, value);
  }
  assert.equal(hasSensitiveText("3782 822463 10005"), true);
  assert.equal(hasSensitiveText("ISBN 9781402894626; contact learner@example.invalid"), true);
});

test("estimates CJK and mixed-script input and chunks without losing text or exceeding the budget", () => {
  assert.equal(estimateTokens("abcdefgh"), 2);
  assert.equal(estimateTokens("細胞かなカナ한글"), 8);
  assert.equal(estimateTokens("細胞 abcd"), 4);
  const mixed = "Plant cells 植物細胞 🌱 have walls ".repeat(7);
  const chunks = chunkText(mixed, 7);
  assert.equal(chunks.join(""), mixed);
  assert.ok(chunks.length > 1 && chunks.every((chunk) => estimateTokens(chunk) <= 7));
  const japanese = asJob({ kind: "text", text: "細".repeat(DEFAULTS.maxOnDeviceTokens + 1) });
  assert.equal(route(japanese).mode, InferenceMode.PREFER_IN_CLOUD);
  assert.equal(route(japanese, { online: false }).mode, InferenceMode.ONLY_ON_DEVICE);
});
