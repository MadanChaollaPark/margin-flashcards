# PLAN — Round 4 (builder work package, ~45–70 min)

Planner/orchestrator is Kiro `claude-opus-5.5` at high reasoning (not max); builder is Codex `gpt-6.2-sol` at high effort in standard/slow mode (`features.fast_mode=false`); reviewers are both Opus 5.5 (high) and Sol 6.2 (high, slow), with up to 3 consensus attempts then Opus-wins tiebreak. Owner decision — do not revert.

Baseline (orchestrator, HEAD 260842c): tsc exit 0; `npm test` 116/116; `npm run test:e2e` 10 passed. Round 3 FAILED on one regression: the queue reads settings before acquiring the shared queue lock. Fixing that is the top priority.

## Ground rules
- Work only in `/workspace/flashcard-ext`. Never run `git commit`, `git push`, or tag. Never sign in, post, or submit anything. Do not edit `GOAL.md` role lines, `driver.py`, `LOOP_LOG.md`, or wipe `STATE/`.
- Your sandbox cannot launch Chromium (`listen EPERM`). **Do not run `npm run test:e2e` or `npm run screenshots`.** Write "not run — sandbox; driver runs e2e" in BUILD_REPORT. Do not change e2e specs unless a source change forces it (the driver's e2e run decides the round; an e2e failure = FAIL).
- Do not change visible UI that appears in screenshot scenes (except optional item 5 rules). `submission/screenshots/cover.png` was already re-rendered by the orchestrator with the round-4 tagline (sha256 `1e139c12…bea450`); do not touch any PNG.
- Never invent results. Record exact commands and exit codes, with `tests N / pass N / fail 0` lines.
- Mock/Demo mode stays clearly labeled.

## 1. Resolve settings inside the queue lock (Stage Two Tech; fixes the regression; S1.5 truthfulness)
DoD: "Robust, well-tested hybrid routing: sensitivity / privacy gates … queue-when-offline"; "No regressions".

Open steps:
1. Change `drainQueue` in `src/ai/queue.ts` so the runtime/settings are resolved **after** `navigator.locks.request("margin-offline-queue", …)` grants the lock, and **re-resolved before each entry** is processed (settings can change between jobs in one pass). Suggested shape: replace the `process` + `mode` parameters with a `prepare: () => Promise<{ process: ProcessJob; mode: QueueMode }>` that `drain` calls inside the locked callback, once per entry. Keep the existing mode-mismatch behavior (automatic pass skips without writing; targeted `onlyId` retry writes the exact existing mismatch notice and keeps attempts/state/nextAttemptAt).
2. `startQueueDrain`: pass its `prepare` through to `drainQueue` instead of calling it before the lock. Keep the `stopped || rerun` guard. The timer computation after the pass needs the mode; use the mode from the last `prepare()` result (or call `prepare()` again).
3. `src/ui/options.ts` retry handler (~line 243): delete `const current = await createRuntime();` before `drainQueue`; build the runtime inside the `prepare` callback so `privacyMode`, `modeOverride`, and `mock` are read after the lock is acquired.
4. `src/ui/sidepanel.ts` (~line 506): adapt to the new signature only; behavior unchanged otherwise.
5. Unit tests in `test/unit/ai.test.ts` (use a fake `navigator.locks` that holds the lock until the test releases it, or a deferred `prepare`; synthetic data; stub the provider so you can assert on calls):
   - "manual retry honors Privacy mode enabled while waiting for the queue lock": settings start Privacy off + Only cloud; hold lock; start targeted retry; save Privacy on; release lock; assert route is `only_on_device` (or the job errors/stays queued) and the cloud provider call **never starts**.
   - Same for switching the override to **Only on-device** while waiting.
   - Same for toggling **Demo mode** while waiting: the targeted retry writes the mode-mismatch notice and calls no provider.
   - Multi-job pass: settings change after job 1 completes; job 2 uses the new settings.
   - All existing queue tests still pass (adapt fixtures to the new signature, do not delete cases).

Acceptance: `npx tsc --noEmit` exit 0; `npm test` exit 0 with ≥ 120 tests and 0 fail; `grep -n "createRuntime" src/ui/options.ts` shows no call outside the `prepare`/locked callback in the retry handler.
Evidence: diff summary with file:line; new test names as printed by Node; `tests/pass/fail` lines.

## 2. Setup failure in automatic drain schedules a backoff retry (Tech; README:65 truth)
Open steps: in `startQueueDrain`, when `prepare()` (now inside `drainQueue`) throws, do not leave jobs stuck. Preferred: treat a `prepare` failure for an entry like a processing failure for that entry (increment attempts, set `nextAttemptAt` with the existing 30 s/60 s backoff, `lastError` = message), so the existing timer logic reschedules. Still call `onError`. Add a unit test: inject one `prepare` failure then success, use a fake clock or a short injected backoff, and assert the job completes without any external event (no `online`/storage/message trigger). Keep README:65 wording accurate; edit it only if behavior differs.
Acceptance: test passes in `npm test`; README:65 matches code.

## 3. Truthful privacy tagline and claims (S1.4, S1.5, Impact)
New tagline (exact; already on the rendered cover): **"Learn what you read. Privacy mode keeps every capture on-device."**
Open steps:
1. Set `scripts/screenshots.mjs:180` to exactly `<p><strong>Learn what you read.</strong> Privacy mode keeps every capture on-device.</p>` (so the renderer matches the committed cover).
2. Replace the old tagline "Sensitive-looking text stays on-device unless you approve cloud." in `README.md:3`, `submission/devpost-story.md:3`, `submission/demo-video-script.md:24` (shot 9 voice-over and on-screen text), `submission/submission-checklist.md`.
3. Wherever the story/README/script says sensitive-looking text needs approval before cloud, tie it to "when the sensitivity check is enabled (default; Remote Config `sensitivityCheck`)". Specifically README:60 and README:152, story:33 and story:90, script shot 3 voice-over. Keep "Privacy mode and Only on-device always keep captures local" (true after item 1).
4. Verify: `grep -rn "unless you approve cloud" README.md submission scripts src` → no hits.
Acceptance: grep above empty; `grep -n "Privacy mode keeps every capture on-device" README.md submission/*.md scripts/screenshots.mjs` hits README, story, script, checklist, renderer. Script still totals ≤ 3:00 with shots 1–2 ending at 0:30.

## 4. Package, scans, report (Engineering)
Commands (record exit codes):
- `npx tsc --noEmit`
- `npm test`
- `npm run package` → then `unzip -l margin-extension.zip | head` (manifest at root) and `unzip -l margin-extension.zip | grep -E '\.map$|\.env|config\.local'` → empty.
- `git grep -nE 'AIza[0-9A-Za-z_-]{35}|-----BEGIN (RSA |EC )?PRIVATE KEY|"private_key"'` → empty; `git grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' -- src submission README.md scripts` → empty; `git ls-files | grep -E '\.env|config\.local|service-account'` → empty.
- Write `STATE/BUILD_REPORT.md`: per item done/not done, file:line, test names, exact exit codes, "e2e and screenshots not run — sandbox; driver runs e2e".

## 5. OPTIONAL (only if items 1–4 are done and time remains): Options-page layout gap (Design)
`src/ui/options.html:116` puts "Manage decks" as a third child of `.settings-grid`, so it wraps below the taller right column and leaves a blank area under "AI routing" (see `submission/screenshots/08-export.png`). Fix: move the Manage decks `<section>` inside the first `.settings-column` div (after the AI routing section). Do **not** do this unless you can confirm `npm run screenshots` works in your sandbox (one quick try; on EPERM, skip the item and note it in BUILD_REPORT for the next round). If it works, rerun it and visually check `05-options-privacy-stats.png` and `08-export.png`, and confirm the e2e selectors for decks don't depend on DOM position.

## Out of scope this round
New features, new providers, second platform, e2e spec rewrites, any PNG other than via item 5.
