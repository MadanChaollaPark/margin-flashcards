import assert from "node:assert/strict";
import { test } from "node:test";
import { InferenceMode } from "firebase/ai";
import { deleteApp, initializeApp } from "firebase/app";
import { CELL_BIOLOGY_PASSAGE } from "../../src/ai/demoSamples";
import { FirebaseProvider } from "../../src/ai/firebaseProvider";
import { MockProvider } from "../../src/ai/mockProvider";
import { createPrompt } from "../../src/ai/prompts";
import type { AIProvider, ContentInput, GenerationJob, InferenceRequest } from "../../src/ai/provider";
import { drainQueue, enqueue } from "../../src/ai/queue";
import { generateCards } from "../../src/ai/runtime";
import { isConfigured } from "../../src/firebase/config";
import { DEFAULTS, loadRemoteConfig } from "../../src/firebase/remoteConfig";
import { createMemoryDatabase } from "../../src/storage/db";

const job: GenerationJob = {
  deckId: "bio",
  input: { kind: "text", text: "Photosynthesis is the conversion of light into chemical energy. Plants use chlorophyll." },
};
const request: InferenceRequest = {
  task: { kind: "cards", input: job.input },
  mode: InferenceMode.PREFER_ON_DEVICE,
  reason: "The text fits.",
  cloudModel: DEFAULTS.cloudModel,
};

test("uses pure Remote Config defaults and recognizes the unconfigured placeholder", async () => {
  assert.equal(isConfigured({ apiKey: "REPLACE_ME", appId: "demo", projectId: "demo" }), false);
  assert.equal(isConfigured({ apiKey: "test", appId: "demo", projectId: "demo" }), true);
  assert.deepEqual(await loadRemoteConfig(), DEFAULTS);
  assert.notEqual(await loadRemoteConfig(), DEFAULTS);
});

test("FirebaseProvider serializes cloud parts without client-side type discriminators", async (t) => {
  const app = initializeApp({ apiKey: "test", appId: "test", projectId: "demo" }, "provider-wire-test");
  t.after(() => deleteApp(app));
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    candidates: [{ content: { role: "model", parts: [{ text: "[]" }] }, finishReason: "STOP" }],
  }));
  const provider = new FirebaseProvider(app, DEFAULTS);
  const inputs: { input: ContentInput; mediaParts: object[] }[] = [
    { input: job.input, mediaParts: [] },
    {
      input: { kind: "image", mimeType: "image/png", data: "aW1hZ2U=" },
      mediaParts: [{ inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }],
    },
    {
      input: { kind: "youtube", url: "https://www.youtube.com/watch?v=example" },
      mediaParts: [{ fileData: { mimeType: "video/mp4", fileUri: "https://www.youtube.com/watch?v=example" } }],
    },
  ];
  for (const { input, mediaParts } of inputs) {
    const task = { kind: "cards", input } as const;
    const { prompt } = createPrompt(task, DEFAULTS.maxCardsPerChunk);
    await provider.generate({ ...request, task, mode: InferenceMode.ONLY_IN_CLOUD });
    const [, options] = fetch.mock.calls.at(-1)!.arguments;
    assert.equal(options?.method, "POST");
    const body = options?.body;
    assert.equal(typeof body, "string");
    assert.deepEqual(JSON.parse(body as string).contents, [{ role: "user", parts: [{ text: prompt }, ...mediaParts] }]);
  }
  assert.equal(fetch.mock.callCount(), inputs.length);
});

test("mock generation is deterministic, uses definitions, and reports simulated source", async () => {
  const mock = new MockProvider();
  const local = await mock.generate(request);
  assert.deepEqual(local, await mock.generate(request));
  assert.equal(local.source, "on_device");
  assert.match(local.reason, /^Simulated — .*Firebase AI Logic preferred Gemini Nano$/u);
  assert.equal(local.simulated, true);
  const cards = JSON.parse(local.text);
  assert.equal(cards[0].front, "What is Photosynthesis?");
  assert.match(cards[0].back, /chemical energy/);
  assert.equal(cards.length, 2);

  const cloud = await new MockProvider({ nano: "unavailable" }).generate(request);
  assert.equal(cloud.source, "in_cloud");
  assert.equal(cloud.reason, "Simulated — Gemini Nano not ready — Firebase AI Logic fell back to cloud");
  assert.equal(cloud.text, local.text);
  assert.equal((await mock.generate({ ...request, mode: InferenceMode.ONLY_IN_CLOUD })).source, "in_cloud");
});

test("demo cards resolve process references, omit ambiguous subjects, and offer a curated cloze", async () => {
  const mock = new MockProvider();
  const cards = async (text: string) => JSON.parse((await mock.generate({
    ...request, task: { kind: "cards", input: { kind: "text", text } },
  })).text);
  const generated = await cards("Glycolysis is the breakdown of glucose. The process occurs in the cytosol. This energy is stored in bonds. It is the main source of energy. Mitochondria produce ATP.");
  assert.deepEqual(generated.map((card: { front: string }) => card.front), [
    "What is Glycolysis?", "Where does Glycolysis happen?", "Mitochondria produce {{c1::ATP}}.",
  ]);
  const sample = await cards(CELL_BIOLOGY_PASSAGE);
  assert.equal(sample.length, 8);
  assert.ok(sample.some((card: { type: string }) => card.type === "cloze"));
});

test("mock supports initializing, unavailable local inference, and offline inference", async () => {
  const mock = new MockProvider({ nano: "downloadable" });
  const pinned = { ...request, mode: InferenceMode.ONLY_ON_DEVICE };
  await assert.rejects(mock.generate(pinned), /unavailable/);
  const milestones: number[] = [];
  await mock.initializeDeviceModel((value) => milestones.push(value));
  assert.deepEqual(milestones, [1]);
  assert.equal((await mock.status()).nano, "available");
  assert.equal((await mock.generate(pinned)).source, "on_device");

  const offline = new MockProvider({ online: false });
  assert.equal((await offline.generate(request)).source, "on_device");
  await assert.rejects(offline.generate({ ...request, mode: InferenceMode.ONLY_IN_CLOUD }), /offline/);
});

test("mock grading and sensitivity return structured results", async () => {
  const mock = new MockProvider();
  const grade = await mock.generate({
    ...request,
    task: { kind: "grade", question: "What does the plant use?", expected: "sunlight and water", answer: "sunlight and water" },
  });
  assert.deepEqual(JSON.parse(grade.text), { verdict: "correct", missing: [], suggestedRating: 3 });
  const classification = await mock.generate({
    ...request, mode: InferenceMode.ONLY_ON_DEVICE, task: { kind: "sensitivity", text: "This is a confidential memo." },
  });
  assert.equal(classification.source, "on_device");
  assert.deepEqual(JSON.parse(classification.text), { sensitive: true });
});

test("demo grading accepts concise synonyms and reports only missing concepts", async () => {
  const mock = new MockProvider();
  const grade = async (answer: string) => JSON.parse((await mock.generate({
    ...request,
    task: { kind: "grade", question: "What is made during glycolysis?", expected: "A molecule called ATP stores usable energy.", answer },
  })).text);
  assert.deepEqual(await grade("ATP energy"), { verdict: "partial", missing: ["molecule", "stores"], suggestedRating: 2 });
  assert.deepEqual(await grade("The molecule adenosine triphosphate stores power."), { verdict: "correct", missing: [], suggestedRating: 3 });
  assert.equal((await grade("the and a")).verdict, "incorrect");
});

test("the optional on-device sensitivity gate precedes any cloud-capable generation", async () => {
  const mock = new MockProvider();
  const calls: InferenceRequest[] = [];
  const steps: string[] = [];
  const provider: AIProvider = {
    status: () => mock.status(),
    initializeDeviceModel: () => mock.initializeDeviceModel(),
    generate: (req) => { calls.push(req); steps.push(req.task.kind); return mock.generate(req); },
  };
  const privateJob: GenerationJob = {
    ...job, input: { kind: "text", text: "This is a confidential memo for the legal team. Chlorophyll absorbs light in plants." },
  };
  const context = { config: DEFAULTS, online: true, privacyMode: false, modeOverride: "only-cloud" } as const;
  const result = await generateCards(privateJob, provider, context, { onStage: (stage) => steps.push(stage) });
  assert.deepEqual(calls.map(({ task, mode }) => [task.kind, mode]), [
    ["sensitivity", InferenceMode.ONLY_ON_DEVICE], ["cards", InferenceMode.ONLY_ON_DEVICE],
  ]);
  assert.equal(result?.cards?.[0].route.source, "on_device");
  assert.match(result?.cards?.[0].route.reason ?? "", /sensitive/i);
  assert.deepEqual(steps.splice(0), ["Checking privacy on-device…", "sensitivity", "Generating on-device…", "cards"]);
  await generateCards(job, provider, context, { onStage: (stage) => steps.push(stage) });
  assert.deepEqual(steps, ["Checking privacy on-device…", "sensitivity", "Generating…", "cards"]);
});

test("the offline queue retains failures and atomically saves cards on retry", async () => {
  const database = createMemoryDatabase();
  const entry = await enqueue(job, "Offline.", database);
  let runs = 0;
  await drainQueue(async () => { runs++; return []; }, () => false, database);
  assert.equal(runs, 0);

  await drainQueue(async () => { throw new Error("Try again."); }, () => true, database);
  assert.equal((await database.get("queue", entry.id))?.lastError, "Try again.");
  assert.equal((await database.get("queue", entry.id))?.attempts, 1);

  await drainQueue(async (queued) => {
    const result = await generateCards(queued, new MockProvider(), { config: DEFAULTS, online: true, privacyMode: false });
    return result?.cards;
  }, () => true, database, undefined, () => Date.now() + 30_000);

  assert.equal(await database.get("queue", entry.id), undefined);
  assert.equal((await database.all("cards")).length, 2);
});

test("a malformed model response gets one repair attempt in the same inference mode", async () => {
  const mock = new MockProvider();
  const calls: InferenceRequest[] = [];
  const provider: AIProvider = {
    status: () => mock.status(),
    initializeDeviceModel: () => mock.initializeDeviceModel(),
    async generate(req) {
      calls.push(req);
      const output = await mock.generate(req);
      return req.repair ? output : { ...output, text: "Unparseable result." };
    },
  };
  const result = await generateCards(job, provider, { config: DEFAULTS, online: true, privacyMode: true });
  assert.deepEqual(calls.map(({ mode, repair }) => [mode, repair]), [
    [InferenceMode.ONLY_ON_DEVICE, false], [InferenceMode.ONLY_ON_DEVICE, true],
  ]);
  assert.equal(result?.cards?.length, 2);
});

test("queue backs off exponentially and stops after three attempts", async () => {
  const database = createMemoryDatabase();
  const entry = await enqueue(job, "Offline.", database);
  let time = 1_000;
  let attempts = 0;
  const run = () => drainQueue(async () => {
    attempts++;
    throw new Error("Service unavailable.");
  }, () => true, database, undefined, () => time);
  await run();
  assert.equal((await database.get("queue", entry.id))?.nextAttemptAt, time + 30_000);
  time += 29_999;
  await run();
  assert.equal(attempts, 1);
  time++;
  await run();
  assert.equal((await database.get("queue", entry.id))?.nextAttemptAt, time + 60_000);
  time += 60_000;
  await run();
  time += 300_000;
  await run();
  assert.equal(attempts, 3);
  assert.equal((await database.get("queue", entry.id))?.state, "failed");
});

test("short Auto text checks sensitivity before hybrid generation, and malformed classification stays local", async () => {
  const mock = new MockProvider();
  const calls: InferenceRequest[] = [];
  let classification = 'Output: ```json\n{"sensitive": false,}\n```';
  const provider: AIProvider = {
    status: () => mock.status(),
    initializeDeviceModel: () => mock.initializeDeviceModel(),
    async generate(req) {
      calls.push(req);
      const output = await mock.generate(req);
      return req.task.kind === "sensitivity" ? { ...output, text: classification } : output;
    },
  };
  const context = { config: DEFAULTS, online: true, privacyMode: false };
  const auto = await generateCards(job, provider, context);
  assert.equal(auto?.cards?.[0]?.route.source, "on_device");
  assert.deepEqual(calls.splice(0).map(({ task, mode }) => [task.kind, mode]), [
    ["sensitivity", InferenceMode.ONLY_ON_DEVICE], ["cards", InferenceMode.PREFER_ON_DEVICE],
  ]);
  const cloud = await generateCards(job, provider, { ...context, modeOverride: "only-cloud" });
  assert.equal(cloud?.cards?.[0]?.route.source, "in_cloud");
  classification = "Unknown response.";
  const local = await generateCards(job, provider, { ...context, modeOverride: "only-cloud" });
  assert.equal(local?.cards?.[0]?.route.source, "on_device");
});

test("short Auto generation records the provider's actual cloud fallback", async () => {
  const provider = new MockProvider({ nano: "unavailable" });
  const result = await generateCards(job, provider, { config: DEFAULTS, online: true, privacyMode: false });
  assert.equal(result?.cards?.[0]?.route.source, "in_cloud");
  assert.match(result?.cards?.[0]?.route.reason ?? "", /Firebase AI Logic fell back to cloud/u);
});

test("generation deduplicates overlapping chunks and preserves card and chunk source anchors", async () => {
  const sentences = Array.from({ length: 14 }, (_, i) => `Sentence ${String(i).padStart(2, "0")} contains one fact. `);
  const source = { url: "https://example.test/article", title: "Article" };
  const inputs: string[] = [];
  const provider: AIProvider = {
    async status() { return { nano: "available" }; },
    async initializeDeviceModel() {},
    async generate({ task, reason }) {
      assert.equal(task.kind, "cards");
      assert.equal(task.quoteSource, true);
      const text = task.input.text!;
      inputs.push(text);
      const shared = { front: "What fact is repeated?", back: "One fact.", sourceQuote: sentences[9].trim() };
      const rows = inputs.length === 1
        ? [shared, { front: "Which sentence comes first?", back: "Sentence 00.", sourceQuote: sentences[0].trim() }]
        : [shared, { front: "Which sentence ends the page?", back: "Sentence 13.", sourceQuote: "A quote that was invented." }];
      return { text: JSON.stringify(rows), source: "on_device", reason };
    },
  };
  const result = await generateCards({
    ...job, input: { kind: "text", text: sentences.join("") }, anchorPage: true, source,
  }, provider, { config: { ...DEFAULTS, maxOnDeviceTokens: 80 }, online: true, privacyMode: true });
  assert.equal(inputs.length, 2);
  assert.ok(inputs[0].endsWith(sentences[9]));
  assert.ok(inputs[1].startsWith(sentences[9]));
  assert.equal(result?.cards?.length, 3);
  assert.equal(result.cards[0].source?.url, `${source.url}#:~:text=Sentence%2009%20contains%20one%20fact.`);
  assert.equal(result.cards[1].source?.url, `${source.url}#:~:text=Sentence%2000%20contains%20one%20fact.`);
  assert.equal(result.cards[2].source?.url, result.cards[0].source?.url);
  assert.ok(result.cards.every((card) => !("sourceQuote" in card)));

  const singleChunk = await generateCards({
    ...job, input: { kind: "text", text: sentences[13] }, anchorPage: true, source,
  }, provider, { config: DEFAULTS, online: true, privacyMode: true });
  assert.equal(singleChunk?.cards?.length, 2);
  assert.ok(singleChunk.cards.every((card) => card.source?.url === source.url));
});

test("with Nano missing, generation waits for consent before making any model call", async () => {
  const mock = new MockProvider({ nano: "unavailable" });
  const flagged: GenerationJob = { ...job, input: { kind: "text", text: "The workshop contact is learner@example.invalid. Chlorophyll absorbs light in plants." } };
  const context = { config: DEFAULTS, privacyMode: false, online: true };
  assert.ok((await generateCards(flagged, mock, context))?.confirm);
  assert.equal(await generateCards(flagged, mock, context, { confirmCloud: async () => false }), undefined);
  const approved = await generateCards(flagged, mock, context, { confirmCloud: async () => true });
  assert.equal(approved?.cards?.[0]?.route.source, "in_cloud");
  assert.match(approved?.cards?.[0]?.route.reason ?? "", /approved cloud inference/u);
});
