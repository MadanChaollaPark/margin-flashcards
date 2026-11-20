[denied] tool permission approval is not supported in non-interactive mode. Use --trust-all-tools to auto-approve.
I reviewed the code read-only and changed no files. The Firebase AI Logic calls match `ai-public.d.ts`. The highest Stage One risk is that a judge running the extension will only ever execute the mock.

**(a) Firebase AI Logic and App Check**
- These calls match the type definitions: `getAI(app, {backend: new GoogleAIBackend()})`, the `HybridParams` shape (`mode`, `onDeviceParams.createOptions/promptOptions.responseConstraint`, `inCloudParams.generationConfig.responseSchema`), the `TextPart`/`InlineDataPart` `type` fields, and the `inferenceSource` check. `Schema.integer({minimum, maximum})` only type-checks through the `[key: string]: unknown` index signature, but Gemini accepts those fields.
- In `initializeDeviceModel`, the provider makes no `await` before the SDK call, so the click's user activation is still active. The UI must already have built the runtime before the click, because `createRuntime` awaits settings and Remote Config.
- `deviceOptions` declares `languages: ["en"]` plus image input, but the prompt says "use the source's language". If image support is unavailable on a device, `availability()` reports Nano as unavailable for every task, including text-only ones.
- App Check: setting `FIREBASE_APPCHECK_DEBUG_TOKEN` before `initializeAppCheck` is correct, and debug mode skips the `CustomProvider`. With the value `true`, every install mints a new token that someone has to register in the console. Judges will need the options-page token field to be documented.
- `firebaseProvider.ts` throws if `inferenceSource` is missing, even for `ONLY_IN_CLOUD`. It should default to `IN_CLOUD` in that mode.

**(b) Router bugs**
1. When offline, long text with Nano available gets queued. It should be chunked on-device, the way the private route already does it (`router.ts`).
2. When Nano reports `downloadable`/`downloading`, the reason shown is "Gemini Nano is unavailable", which hides the fix (click Enable).
3. A regex match blocks generation outright when Nano is missing. The plan says to ask the user. The phone and card-number patterns also match ISBNs and other long numbers.
4. `classify` runs N on-device calls before the real job, including for short text that would have run locally anyway. A strict `JSON.parse` failure in `classify` aborts the whole job.
5. The chars/4 token estimate undercounts CJK text by about 3–4×. Japanese or Chinese input marked as "fits" can overflow Nano's 9,216-token context once output tokens are added.
6. `queue.ts` has no maximum attempts or backoff. A job that keeps failing retries on every `online` event forever.

**(c) Stage One risks**
- `shouldUseMock` returns true whenever the config is the placeholder. In that case `getAI`, `getGenerativeModel` and `generateContent` never run. The calls exist in the code and get bundled, but a judge loading the build only sees mock output, and the mock reports `on_device`/`in_cloud` as if they were real results.
- No secrets are committed: `config.ts` has placeholders and the debug token lives in settings. Keep it that way.

**(d) Top 8 fixes**
1. **`build.mjs`, `config.ts`**: inject the Firebase web config at build time from an env var or a git-ignored `firebase.config.local.json`, so nothing is committed. Add a post-build check that fails if `getGenerativeModel` or `generateContent` is missing from `dist/`. Show the real calls in the demo video.
2. **`mockProvider.ts`**: prefix the mock's reasons with "Simulated", and add a visible MOCK badge in the UI, so judges don't think the mock's results are real hybrid inference.
3. **`router.ts`**: when offline with Nano available, chunk long text on-device instead of queueing. Return a `"confirm"` decision for regex-only sensitivity matches when Nano is missing, instead of throwing. Give `downloadable` its own "Enable on-device AI" reason.
4. **`runtime.ts`**: for text that fits the budget with Nano available, route straight to `ONLY_ON_DEVICE` and skip `classify`. This halves latency and makes "never left the device" literally true. Make `classify` use a tolerant parse and fail closed (treat a parse failure as sensitive).
5. **`firebaseProvider.ts`**: use separate text-only and text+image `createOptions`, and declare `languages: ["en","es","ja"]`. Treat a missing `inferenceSource` as `IN_CLOUD` under `ONLY_IN_CLOUD`.
6. **`router.ts`**: make the token estimate script-aware (roughly 1 token per CJK character). Leave room in the budget for output: 6,000 input tokens plus about 1,500 output tokens against the 9,216 limit.
7. **`queue.ts`**: add `maxAttempts` (for example 3) with exponential backoff and a "failed" state the UI can show. Run the routing decision again when a job drains, in case privacy mode changed.
8. **`manifest.json`, `init.ts`**: move `<all_urls>` to `optional_host_permissions` and request it at runtime for PDF fetches, which fits the privacy pitch. Drop `offscreen` until something uses it. In `init.ts`, log the generated debug token with a clear "register in the Firebase console" hint, and pass `useLimitedUseAppCheckTokens: true` to `getAI`.
