# iter03 review

## Verdict: FAIL

## Tests: PASS

## Regressions: FOUND

Reviewer verdict: FAIL (agreement on attempt 2). Driver verdict: FAIL (agreement on attempt 2).

## Kiro Opus 5.5 evidence (FAIL)

# Round 3 review of Margin (reconciliation attempt 2)

The verdict is FAIL because this round's diff introduces a privacy-gate regression in the Options manual retry. The driver ran all three required suites this round, and all three exited 0. PASS would still be out of reach without the regression, because the public repo, the native Chrome walkthrough and live inference remain unverified.

I checked the peer review's two regression claims against the code myself, without relying on its diagnostics.

1. **Options retry can use outdated settings (regression, high).** I confirmed this one.
   - At HEAD `2be3a56`, the Options retry called `createRuntime()` inside the per-job callback. That callback runs only after `drainQueue` holds the `margin-offline-queue` Web Lock.
   - This round moves `const current = await createRuntime();` ahead of `drainQueue(...)` (`src/ui/options.ts:243`). Settings are now read before the lock wait.
   - If the side panel is draining other jobs while the retry waits, a change made on the same Options page is ignored. That page keeps the Privacy toggle (`options.ts:98`) enabled during "Retrying…", because only the Retry and Remove buttons are disabled.
   - So a retry that started under **Only cloud** with Privacy off still routes to the cloud after the user turns Privacy mode on. The same stale snapshot also breaks this round's Demo/live isolation if Demo mode is toggled during the wait.
   - The side panel's automatic drain has the same ordering (`prepare()` runs before the lock, `queue.ts:113`). It is protected: its storage listener now calls `retryQueue()`, which sets `rerun`, and the wrapper at `queue.ts:115` then returns `undefined` instead of processing. Options has no such guard.
2. **Automatic retry stops after a setup error (real, low severity).** I confirmed the code path.
   - At HEAD, an error thrown by `createRuntime()` was caught per job. The job recorded an attempt and got a backoff timestamp.
   - Now `prepare()` throws into the outer `catch` at `queue.ts:125`. That calls `onError`, schedules no timer, and leaves the job at attempt 0 until another event triggers a drain.
   - In practice this is hard to reach. `shouldUseMock` falls back to Demo mode when no config is present, and `loadRemoteConfig` catches its own errors. That leaves only `chrome.storage` or App Check initialization failures.
   - It still contradicts the README's retry description (README:65). I count it as secondary to finding 1.

The rest of the queue work is correct and tested:
- New captures store their Demo or live mode, and legacy entries infer it from the `Simulated — ` reason prefix.
- An automatic pass skips captures from the other mode without writing to them.
- A targeted retry of a capture from the other mode writes the exact mismatch notice and keeps its attempts.
- The retry timer ignores captures from the other mode.

## Test evidence

| Suite | Runner | Exit | Result |
|---|---|---:|---|
| `npx tsc --noEmit` | Driver | 0 | `iter03_typecheck_tests.txt`: `EXIT=0` |
| `npm test` | Driver | 0 | `iter03_unit_tests.txt`: 116 tests, 116 passed; 0 failed, cancelled, skipped or todo |
| `npm run test:e2e` | Driver | 0 | `iter03_e2e_tests.txt`: build plus `10 passed (28.8s)` against the loaded extension |
| tsc / unit / e2e on baseline `2be3a56` | Orchestrator | 0 / 0 / 0 | 109 unit and 10 e2e passed (`CHECKLIST.md:5`) |
| tsc / unit | Builder | 0 / 0 | 116 cases with `--test-isolation=none`. The first `npm test` invocation lost its output, and the report does not give its exit code. Builder did not run e2e (sandbox limit, as the plan directed). |

No failing, skipped or timed-out suite was recorded this round. I ran none of the suites myself.

My read-only checks this round:
- I unzipped `margin-extension.zip` (built 11:09) to a temp directory and compared it with `diff -rq` against `dist` (rebuilt by the driver at 11:28). All 229 files match, `manifest.json` is at the root, and there are no `.map`, `.env` or local config files. I deleted the temp directory.
- `git grep` for API-key and private-key patterns found nothing. The UUID grep over `src`, `submission`, `README.md` and `scripts` found nothing. No `.env`, `config.local` or service-account file is tracked.
- HEAD descends from `508bb32`.

## Stage One

| # | Grade | Evidence |
|---|---|---|
| 1. Hybrid SDK called at runtime | **Met (code)** | `createRuntime` builds `FirebaseProvider` when the build is configured and not in Demo mode (`runtime.ts:16–23`). The router reaches `ONLY_ON_DEVICE`, `ONLY_IN_CLOUD`, `PREFER_*`, queue and confirm. Live Firebase or Nano could not run here. |
| 2. App Check | **Met (code)** | `initializeAppCheck` runs in `src/firebase/init.ts:20`. The code honestly states the debug-token limitation. No token is committed. |
| 3. Public repo + license | **Partial** | Apache-2.0 `LICENSE` is at the root, and `origin` points to `MadanChaollaPark/margin-flashcards`. Anonymous visibility and GitHub's license detection are unverified (the brief is local-only). |
| 4. Demo script | **Partial** | Nine contiguous shots total 2:50, and shots 1–2 end at 0:30 covering the audience, the problem and hybrid inference. Shot 4 is now one offline cycle that credits Margin. The Demo voice-over table covers shots 2, 3, 4, 5, 6 and 8, and each line marks the result as simulated. The exact Only cloud reconnect is unit-tested only; the e2e queue case switches to Privacy mode first. |
| 5. Devpost story | **Partial** | The qualified tagline and the sensitivity sentence match `router.ts`: the pattern heuristic, the `confirm` branch when Nano is unavailable, `localOnly`, and Remote Config `sensitivityCheck`. The finding 1 race contradicts "Privacy mode … always keep[s] captures local" for a manual retry. |
| 6. Testing instructions / installable | **Partial** | Source and ZIP steps are present, and the ZIP matches the tested `dist`. The e2e quick look covers the popup's side-panel open call, sample generation, save and review. A native side-panel walkthrough in Chrome is unverified. |
| 7. No secrets / PII | **Met (reviewed material)** | Scans above are clean. The script uses `learner@example.invalid`. The driver's staged scan is still pending. |
| 8. English | **Met** | e2e asserts `lang="en"` on five pages, and all materials are in English. |
| 9. Demo labeling | **Met** | The banner and Simulated badges are asserted in e2e. I viewed `cover.png`: it shows the new tagline and the DEMO MODE and Simulated labels on both embedded views. |

## Stage Two

- **Tech 3.5.** Routing, chunking, the queue, export and restore are covered, typecheck is clean, and Remote Config and Firestore backup with anonymous Auth are used for real behavior. The Options retry race weakens the privacy gate, which is this product's main guarantee.
- **Design 4.** The workflow is coherent and the cover is current. The accessibility sweep passes, with minimum contrast 5.71:1 in light mode and 6.80:1 in dark mode. The gap in the Options page left column is still deferred.
- **Impact 4.** The case for learners is specific: reading becomes source-linked cards, sensitive notes stay local, and decks export to Anki. The tagline is now honest.
- **Idea 4.5.** Hybrid inference has distinct jobs: the sensitivity gate, on-device grading and source-linked recall.

## Engineering and packaging

- **Suites:** pass (driver, exit 0 each).
- **ZIP:** refreshed and matches `dist`.
- **Screenshots:** current. Only the cover text changed, and it was re-rendered.
- **README, script and story sync:** partial (finding 1 against the Privacy claim; README:65 retry claim against finding 2).
- **Secret scan:** the working tree is clean; the driver's staged scan is pending.

I made no changes. Tracked files, `STATE/REVIEW.md` and the owner's role assignments are as I found them.

## Codex Sol evidence (FAIL)

## Round 3 finding

**A manual queue retry can route to cloud after the user enables Privacy mode.** The Options handler now reads settings before `drainQueue` acquires the shared Web Lock. A retry can wait behind another drain, then execute using the earlier settings even though Privacy mode is already saved. Round 2 read the settings inside the locked callback. [Options retry](/workspace/flashcard-ext/src/ui/options.ts:235) · [Queue lock](/workspace/flashcard-ext/src/ai/queue.ts:82)

I reproduced this with the actual Options handler, queue code, and router. I paused lock acquisition, enabled Privacy mode, and released the lock. Round 2 selected `only_on_device`. Round 3 selected `only_in_cloud` with the stored Privacy setting already enabled. The diagnostic exited `0` after confirming both outcomes. It used synthetic data and a stubbed Firebase call boundary. The regression forces the round verdict to fail.

## Test evidence

| Suite | Runner | Exit | Result |
|---|---|---:|---|
| `npx tsc --noEmit` | Driver, Round 3 | 0 | Clean. [Driver log](/workspace/flashcard-ext/STATE/logs/iter03_typecheck_tests.txt) |
| `npm test` | Driver, Round 3 | 0 | 116 passed, zero failed, skipped, or cancelled. [Driver log](/workspace/flashcard-ext/STATE/logs/iter03_unit_tests.txt) |
| `npm run test:e2e` | Driver, Round 3 | 0 | Build succeeded and all 10 loaded-extension tests passed in 28.8 s. [Driver log](/workspace/flashcard-ext/STATE/logs/iter03_e2e_tests.txt) |

The orchestrator recorded baseline exits of `0 / 0 / 0` with 109 unit cases and 10 browser cases. The builder recorded successful typecheck and unit exits of `0 / 0`. The builder delegated browser execution to the driver because of the sandbox restriction. One early builder unit invocation lost its output session, and the completed retry exited `0`. I used the completed driver runs for the suite grades. [Checklist](/workspace/flashcard-ext/STATE/CHECKLIST.md) · [Build report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md)

## Stage One

| Item | Grade | Evidence |
|---|---|---|
| 1. Firebase AI Logic hybrid SDK | **Verified in code** | The live provider calls `getAI`, constructs the model with SDK inference modes, calls `generateContent`, and reads `inferenceSource`. Model setup calls `initializeDeviceModel`. The provider unit test exercises SDK request serialization with intercepted `fetch`. Live Firebase and Nano execution remain unverified here. [Provider](/workspace/flashcard-ext/src/ai/firebaseProvider.ts:29) · [Provider test](/workspace/flashcard-ext/test/unit/ai.test.ts:35) |
| 2. App Check | **Verified in code and setup instructions** | `initializeAppCheck` is wired into Firebase initialization and the AI client requests limited-use tokens. The instructions disclose the registered debug-token requirement and the production token issuer gap. [Initialization](/workspace/flashcard-ext/src/firebase/init.ts:12) · [Testing instructions](/workspace/flashcard-ext/submission/testing-instructions.md:10) |
| 3. Public repository and license | **Partial** | The local `origin/main` points to `margin-flashcards`. Apache-2.0 is at the root and in the ZIP. Anonymous GitHub access and GitHub’s detected license display remain unverified. [License](/workspace/flashcard-ext/LICENSE) · [Submission checklist](/workspace/flashcard-ext/submission/submission-checklist.md) |
| 4. Demo video materials | **Partial** | The nine English Chrome shots run continuously to 2:50. The audience, problem, and Firebase hybrid routing are covered by 0:30. Demo alternatives cover shots 2, 3, 4, 5, 6, and 8. The closing privacy claim needs the enabled-sensitivity-check qualification, and live shot timing remains unrehearsed in this review. [Script](/workspace/flashcard-ext/submission/demo-video-script.md:1) |
| 5. Devpost story | **Partial** | It explains Firebase AI Logic, the product features, and the learner workflow. The headline promises consent before cloud processing for sensitive-looking text, but the same story describes a Remote Config setting that can disable the heuristic. With that setting off, a pattern-only match can route to cloud without a prompt. The retry regression also contradicts the Privacy mode guarantee. [Story](/workspace/flashcard-ext/submission/devpost-story.md:3) · [Router](/workspace/flashcard-ext/src/ai/router.ts:137) · [Remote Config](/workspace/flashcard-ext/src/firebase/remoteConfig.ts:55) |
| 6. Judge installation and testing | **Partial** | Source and ZIP instructions are present. Chromium closed the popup after `chrome.sidePanel.open` resolved, then tested the sample and review through the extension page. The native Chrome side-panel walkthrough remains open. The exact simulated **Only cloud** reconnect sequence passed at unit level. [Testing instructions](/workspace/flashcard-ext/submission/testing-instructions.md:3) · [Browser test](/workspace/flashcard-ext/test/e2e/extension.spec.ts:183) |
| 7. Secrets and PII | **Verified within local scan scope** | The driver’s credential and forbidden-path patterns produced zero hits in the tracked tree and the four commits in local `origin/main`. Source, docs, and research had no UUID-shaped debug tokens. The script uses a reserved `.invalid` address, and the archive bundles an empty Firebase config. |
| 8. English | **Verified** | All five extension pages declare `lang="en"`. The script, story, checklist, and judge instructions are in English. [Accessibility test](/workspace/flashcard-ext/test/e2e/extension.spec.ts:223) |
| 9. Demo labeling | **Verified** | The extension banner, simulated card and grading badges, and refreshed cover identify simulated results. The script calls for a visible banner, a simulated caption, and alternate narration. The driver’s browser run used Demo mode. [Cover](/workspace/flashcard-ext/submission/screenshots/cover.png) · [Demo narration](/workspace/flashcard-ext/submission/demo-video-script.md:28) |

## Stage Two

- **Technological implementation, 3.5/5.** The four SDK modes, sensitivity gate, chunking, actual-source badges, and Remote Config are substantive. Queue tests cover cross-mode isolation and legacy entries. The manual retry race exposes a gap in the privacy gate, and the browser restore test covers result handling with a stubbed backup response.
- **Design, 4.0/5.** Capture, preview, library, review, and export form a coherent workflow. The five-page accessibility sweep passed, including accessible names and keyboard checks. Its minimum measured text contrast was 5.71:1 in light mode and 6.80:1 in dark mode. [Driver browser run](/workspace/flashcard-ext/STATE/logs/iter03_e2e_tests.txt)
- **Potential impact, 4.0/5.** The student workflow makes a concrete case for turning assigned reading into scheduled recall and exporting to Anki. Its privacy value depends on honoring the active settings and describing the limits of sensitivity detection.
- **Quality of the idea, 4.5/5.** Source-linked cards bring readers back to the passage, while on-device answer grading and sensitivity-based routing give hybrid inference distinct roles in the review loop.

## Engineering and packaging

| Item | Grade | Evidence |
|---|---|---|
| Required test suites | **Verified** | All three fresh driver suites exited `0`. The separate queue diagnostic found the regression above. |
| Refreshed ZIP | **Verified** | The builder recorded `npm run package` exit `0`. I verified archive integrity, the root manifest, 229 entries, and a byte-for-byte match with the current `dist/`. The archive contains no source maps, `.env` files, or local config file. [Build report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md) |
| Screenshots | **Verified for this round’s visible changes** | I inspected the refreshed cover and confirmed the new tagline and visible Demo labels. The gallery’s existing scenes are unaffected by the new mismatch notice. The cover will need another refresh when the tagline is corrected. [Cover](/workspace/flashcard-ext/submission/screenshots/cover.png) |
| README architecture, script, and story | **Partial** | The architecture diagram matches the main inference, queue, library, and review paths. The privacy and consent wording still needs the corrections above. |
| Publication secret scan | **Verified locally, pending for Round 3 publication** | The local scan was clean. The driver runs the staged scan at publication. [Driver scan](/workspace/flashcard-ext/driver.py:450) |

This was a read-only review. The worktree, `STATE/REVIEW.md`, and the owner’s role decision were left intact.

## Scores

- Kiro Opus 5.5: tech=3.5 design=4.0 impact=4.0 idea=4.5 avg=4.00
- Codex Sol: tech=3.5 design=4.0 impact=4.0 idea=4.5 avg=4.00

## Must-fix

- In the Options retry, read settings and build the runtime inside the `drainQueue` callback, after the lock is acquired (or check the Demo/live mode and Privacy setting again right before each `process` call). Add a unit test that holds `margin-offline-queue`, turns Privacy mode on while a manual retry waits, and asserts the retry does not route to the cloud.
- In `startQueueDrain`, when `prepare()` throws, schedule a backoff retry (or route the error into the per-job attempt and backoff handling). Add a test that injects one setup failure and checks recovery without another event.
- After the queue fix, rebuild the ZIP with `npm run package`, rerun tsc, unit and e2e, and keep the README retry text and the story's Privacy-mode claim in sync.
- Owner: verify anonymous repo access and GitHub's Apache-2.0 detection, and rehearse the shot 4 Only cloud reconnect in the packaged extension's native Chrome side panel.
- Resolve the provider mode and privacy settings after the shared queue lock is acquired, before processing each queued capture. Add regression coverage for toggling Privacy mode, Only on-device, and Demo mode while a retry waits, and verify that a disallowed inference call never starts.
- Qualify the tagline and privacy claims across the README, story, script, checklist, and cover. Tie the consent claim to the enabled sensitivity check and the pattern-only case, then refresh the cover from the corrected renderer.
- Have the owner verify anonymous GitHub access and Apache-2.0 detection, load the ZIP in Chrome, and rehearse the native side-panel flow and timed live shots. Record the actual outcomes and leave the publication scan to the driver.

## Win-ready

NO
