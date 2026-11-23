# iter04 review

## Verdict: FAIL

## Tests: PASS

## Regressions: FOUND

Reviewer verdict: FAIL (agreement on attempt 2). Driver verdict: FAIL (agreement on attempt 2).

## Kiro Opus 5.5 evidence (FAIL)

The key claim to verify is the deleted-deck regression. Let me look at the queue diff and the baseline.







# Round 4 review (Opus, reconciliation attempt 2)

The round fails because of one regression I reproduced myself. If a capture's queue entry is deleted while the runtime is still being prepared, the capture is still sent to the provider. All three required suites passed in the driver's runs.

## Regression: deleted queued captures can still be dispatched

- **What changed.** In Round 3 (`260842c`), `startQueueDrain` called `prepare()` before `drainQueue` took its queue snapshot. In Round 4, `drainQueue` takes the snapshot first and only then awaits `prepare()` for each entry (`src/ai/queue.ts:49-60`). It never re-reads the entry before calling `context.process(entry.job)`. `prepare()` runs `createRuntime()`, which awaits `loadRemoteConfig`. That gives a real window for a deletion to land.
- **Deletions don't share the queue lock.** Options deletes a deck under the `margin-decks` lock (`src/ui/options.ts:144`). It removes a single queued capture with no lock at all (`src/ui/options.ts:268`). Neither waits for `margin-offline-queue`.
- **The existing guard runs too late.** `completeQueuedJob` and `updateQueuedJob` both check that the entry still exists (`src/storage/db.ts:287`, `:303`). So no cards are saved and the deleted entry doesn't come back. But both checks run after inference, so the source text has already gone to the provider. With Only cloud selected, that means the cloud.
- **My reproduction.** I wrote a temporary synthetic `node:test` file using `createMemoryDatabase`, `enqueue` and `drainQueue`. It held `prepare()` open, deleted the entry, then released `prepare()`. The process function was still called once (`process calls after deletion: 1`). I deleted the file afterwards. Reading the baseline code shows the Round 3 ordering would have made zero calls in this case.
- This matches the peer review's finding. I reached it from the code and my own run.

A second, related gap: `createRuntime()` reads settings before awaiting Remote Config (`src/ai/runtime.ts:17-20`). The Options retry also keeps that snapshot through the `confirmCloud` dialog. A Privacy, Only on-device or Demo change made in that window can still be stale when the request is sent. This is narrower than the regression. It does make the story's line "Privacy mode keeps every capture on-device" an absolute claim the code doesn't fully guarantee.

## Test evidence

| Suite | Runner | Exit | Result |
|---|---|---:|---|
| `npx tsc --noEmit` | Driver, Round 4 | 0 | No diagnostics (`STATE/logs/iter04_typecheck_tests.txt`) |
| `npm test` | Driver, Round 4 | 0 | 122 passed, 0 failed, 0 skipped, 0 cancelled (`iter04_unit_tests.txt`) |
| `npm run test:e2e` | Driver, Round 4 | 0 | Build succeeded and 10/10 loaded-extension tests passed in 29.3 s (`iter04_e2e_tests.txt`) |
| Typecheck and unit | Builder | 0 / 0 (final) | Early runs exited 1 because of a fixture mode error, which the builder fixed (`BUILD_REPORT.md`) |
| Race diagnostic | Me | 0 | The test harness passed, and the log showed the regression: 1 provider call after deletion |

The new unit tests cover settings that change while waiting for the lock, a second capture in the same pass, and the setup backoff timing. None of them deletes an entry while `prepare()` is in flight.

## Stage One

| # | Grade | Evidence |
|---|---|---|
| 1. Hybrid SDK called | Met in code | `firebaseProvider.ts:33` calls `getAI` with `useLimitedUseAppCheckTokens`. The provider also calls `getGenerativeModel` with `ONLY_ON_DEVICE`, `PREFER_ON_DEVICE` (falling back to `ONLY_IN_CLOUD`) and `PREFER_IN_CLOUD`, then calls `generateContent` and reads `inferenceSource` (lines 47-99). Grading uses `ONLY_ON_DEVICE` (`grade.ts:35`). Live Firebase and Nano can't run here. |
| 2. App Check | Met in code | `firebase/init.ts:20` calls `initializeAppCheck`. No debug token or local config file is tracked. |
| 3. Public repo and license | Partial | Apache-2.0 is in `LICENSE`. I could not check anonymous GitHub access or license detection locally. |
| 4. Demo script | Partial | It is in English and runs 2:50. Shots 1-2 end at 0:30 and cover the audience, problem and hybrid routing. Demo-mode narration is labeled simulated. No one has rehearsed it in native Chrome. The closing privacy claim is stronger than what the code guarantees. |
| 5. Devpost story | Partial | It covers Firebase AI Logic, the features and the value. The Privacy mode absolute claim is undercut by the regression and the stale retry window. |
| 6. Testing instructions | Partial | Source and ZIP install paths are documented, and the e2e suite exercises the loaded extension. The native side panel and the script's Only cloud reconnect step have not been checked by hand. |
| 7. No secrets or PII | Met | Credential-pattern `git grep` found nothing. No `.env`, `config.local` or service-account files are tracked. The script uses a `.invalid` address. |
| 8. English | Met | All extension pages assert `lang="en"`, and all materials are in English. |
| 9. Demo labeled | Met | The e2e suite checks the Demo banner and Simulated labels. The cover shows both. |

## Stage Two

- **Tech, 3.5.** Mode routing, the sensitivity gate, chunking, honest badges, Remote Config and the setup backoff are all real code. But the queue now sends inference for content the user has deleted, which works against the privacy routing the product is built around.
- **Design, 4.** The flow is coherent. The e2e sweep checks accessible names and keyboard use. Minimum contrast is 5.71:1 in light mode and 6.80:1 in dark mode. The Options layout gap above Manage decks was deferred (optional item 5 was skipped).
- **Impact, 4.** The case for readers who want to recall what they read and take decks to Anki is specific. It depends on the privacy controls being reliable.
- **Idea, 4.5.** Source-linked cards, on-device grading and sensitivity routing give each inference mode a distinct job.

## Engineering and packaging

- **Required suites:** pass (driver).
- **ZIP:** `margin-extension.zip` was rebuilt this round. The builder reports 229 entries, a matching `dist/`, and no source maps or local config. It will need rebuilding after the fix.
- **Screenshots:** Only the cover was refreshed, which is all this round's changes needed.
- **README and story:** Mostly in sync. The README architecture section doesn't list Options as an inference entry point (manual retry and diagnostics). The privacy wording overstates the guarantee.
- **Secret scan:** clean locally. The publication scan is left to the driver.

I left the worktree, `STATE/REVIEW.md` and the owner's role assignments untouched, and removed my temporary diagnostic file.

## Codex Sol evidence (FAIL)

## Round 4 findings

**A deleted capture can still reach the cloud provider.** Round 4 reads the queue entry before awaiting runtime setup and then processes that snapshot. Deleting a deck removes its queued captures under a different lock. The database checks whether the capture still exists before saving cards, but that check happens after inference. [Queue drain](/workspace/flashcard-ext/src/ai/queue.ts:47) · [Deck deletion](/workspace/flashcard-ext/src/ui/options.ts:141) · [Database completion](/workspace/flashcard-ext/src/storage/db.ts:287)

I paused runtime setup, deleted the deck, confirmed its capture was gone from the queue, and resumed setup. Round 3 (`260842c`) made zero provider calls. Round 4 made one `ONLY_IN_CLOUD` call to the stub provider in each path, manual retry and automatic drain. No cards were saved. The probe used synthetic text, the project router, and the in-memory database. No data was sent to Firebase. The first diagnostic launch hit a sandbox process-spawn error and exited `1`. The rerun exited `0` and confirmed the regression.

**The previous lock-wait bug is fixed, but Options still has a settings race during setup.** The fresh unit tests cover toggling Privacy, Only on-device, or Demo while waiting for the lock, and changing settings between jobs. Options now reads settings inside the lock, then awaits Remote Config and starts generation with that snapshot. A settings change saved during that await can still be missed by a manual retry. The automatic setup-failure tests also confirm retries at 30 and 60 seconds without consuming capture attempts. [Options retry](/workspace/flashcard-ext/src/ui/options.ts:235) · [Runtime setup](/workspace/flashcard-ext/src/ai/runtime.ts:16) · [Unit tests](/workspace/flashcard-ext/test/unit/ai.test.ts:231)

## Tests

| Suite | Runner | Exit | Result |
|---|---|---:|---|
| `npx tsc --noEmit` | Round 4 driver | 0 | Clean. [Log](/workspace/flashcard-ext/STATE/logs/iter04_typecheck_tests.txt) |
| `npm test` | Round 4 driver | 0 | 122 passed, zero failed, skipped, or cancelled. [Log](/workspace/flashcard-ext/STATE/logs/iter04_unit_tests.txt) |
| `npm run test:e2e` | Round 4 driver | 0 | Build succeeded. All 10 loaded-extension tests passed in 29.3 seconds. [Log](/workspace/flashcard-ext/STATE/logs/iter04_e2e_tests.txt) |

I used the fresh driver logs for the required-suite grades. The orchestrator’s baseline suite exits were `0 / 0 / 0`. The builder’s final typecheck and unit exits were `0 / 0` after correcting an earlier failing fixture. The driver ran browser tests for the completed build. [Checklist](/workspace/flashcard-ext/STATE/CHECKLIST.md) · [Build report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md)

## Stage One

| Item | Grade | Evidence |
|---|---|---|
| 1. Firebase AI Logic hybrid inference | **Verified in code** | The configured runtime constructs `FirebaseProvider`. It calls `getAI`, `getGenerativeModel`, `generateContent`, and `initializeDeviceModel`. Routing uses all four SDK modes and labels results by inference source. Live Firebase and Nano execution remain unverified here. [Runtime](/workspace/flashcard-ext/src/ai/runtime.ts:16) · [Provider](/workspace/flashcard-ext/src/ai/firebaseProvider.ts:29) · [Router](/workspace/flashcard-ext/src/ai/router.ts:148) |
| 2. App Check | **Verified in code** | Firebase initialization calls `initializeAppCheck`, and AI Logic requests limited-use tokens. The judge instructions disclose the registered debug token requirement and the missing production token issuer. [Initialization](/workspace/flashcard-ext/src/firebase/init.ts:12) · [Testing instructions](/workspace/flashcard-ext/submission/testing-instructions.md:10) |
| 3. Public repo and detectable license | **Partial** | `origin` points to `margin-flashcards`, and Apache-2.0 is at the root and in the ZIP. Anonymous access and GitHub’s license detection remain unverified in this local review. [License](/workspace/flashcard-ext/LICENSE) · [Submission checklist](/workspace/flashcard-ext/submission/submission-checklist.md:15) |
| 4. Honest demo video materials | **Partial** | I verified nine contiguous English Chrome shots totaling 2:50. The audience, problem, and hybrid inference are covered by 0:30. Alternate Demo narration identifies simulated results. Shot 3 describes the unavailable-Nano approval path while showing a Nano-ready local result. The live shots still need rehearsal. [Script](/workspace/flashcard-ext/submission/demo-video-script.md:15) |
| 5. Devpost story | **Partial** | The story explains the learner workflow, the hybrid modes, and the default sensitivity check. Its unconditional Privacy and Only on-device claim exceeds what the manual retry currently guarantees if settings change during setup. [Story](/workspace/flashcard-ext/submission/devpost-story.md:32) · [Runtime setup](/workspace/flashcard-ext/src/ai/runtime.ts:16) |
| 6. Judge installation and testing | **Partial** | Source and ZIP instructions are present. Playwright loads the extension, verifies the popup’s side-panel open call, then exercises sample generation, save, and review through `sidepanel.html`. The native Chrome walkthrough and live Only cloud reconnect remain unverified. The matching simulated reconnect passed at unit level. [Instructions](/workspace/flashcard-ext/submission/testing-instructions.md:3) · [Browser test](/workspace/flashcard-ext/test/e2e/extension.spec.ts:183) |
| 7. Secrets and PII | **Verified within local scan scope** | There were zero credential or forbidden-path matches across 105 tracked files, the four post-root commits in local `origin/main`, and 28 bundled scripts. The ZIP embeds an empty Firebase config. The script’s example address uses `.invalid`. |
| 8. English | **Verified** | The app and submission materials are in English. The accessibility suite checks the language on five extension pages. [Browser test](/workspace/flashcard-ext/test/e2e/extension.spec.ts:223) |
| 9. Demo labeling | **Verified** | The browser run, script, and refreshed cover identify simulated inference. The browser assertions cover the Demo banner and simulated route badges. [Browser test](/workspace/flashcard-ext/test/e2e/extension.spec.ts:193) · [Cover](/workspace/flashcard-ext/submission/screenshots/cover.png) |

## Stage Two

- **Technology, 3.5/5.** Hybrid routing, chunking, source badges, Remote Config, and local grading are implemented and tested. Anonymous Auth and Firestore support optional backup. The restore browser case uses a stub response. The stale queue entry can reach inference after deletion.
- **Design, 4/5.** Capture, editing, review, and export form a coherent workflow. The five-page sweep passed accessible-name and keyboard checks. Minimum measured contrast was 5.71:1 in light mode and 6.80:1 in dark mode. The Options layout gap remains visible. [Browser log](/workspace/flashcard-ext/STATE/logs/iter04_e2e_tests.txt) · [Options screenshot](/workspace/flashcard-ext/submission/screenshots/08-export.png)
- **Impact, 4/5.** The student workflow connects assigned reading to scheduled recall and Anki export. Reliable control over pending cloud work matters for the sensitive-notes use case.
- **Idea, 4.5/5.** Source-linked cards, local answer grading, and per-capture sensitivity decisions give hybrid inference distinct roles in the study workflow.

## Engineering and packaging

| Item | Grade | Evidence |
|---|---|---|
| Required suites | **Verified** | All three fresh driver runs exited `0`. The separate probe reproduced a regression outside their coverage. |
| Refreshed ZIP | **Verified** | Builder recorded `npm run package` exit `0`. I checked archive integrity and matched all 229 files byte-for-byte with current `dist/`. The root contains the manifest and license. No source maps or local config files were present. |
| Screenshots | **Verified for Round 4 changes** | I inspected the refreshed cover and confirmed the tagline and Demo labels. The queue changes leave the existing gallery scenes visually unchanged. |
| Architecture, script, and story | **Partial** | The diagram captures the main flow. The README’s inference-location summary omits Options retry and Diagnostics. The manual retry settings gap and live-shot rehearsal remain open. [README](/workspace/flashcard-ext/README.md:31) · [Diagnostics](/workspace/flashcard-ext/src/ui/diagnostics.ts:113) |
| Publication secret scan | **Verified locally, pending publication** | The local scan was clean. The driver owns the staged scan for the Round 4 commit. [Driver](/workspace/flashcard-ext/driver.py:450) |

I left the worktree and `STATE/REVIEW.md` unchanged.

## Scores

- Kiro Opus 5.5: tech=3.5 design=4.0 impact=4.0 idea=4.5 avg=4.00
- Codex Sol: tech=3.5 design=4.0 impact=4.0 idea=4.5 avg=4.00

## Must-fix

- In `drainQueue`, re-read each entry with `database.get("queue", id)` after `prepare()` resolves and immediately before `context.process`, and skip it if it's gone. Alternatively, run Options deck deletion and single-capture removal under the `margin-offline-queue` lock. Add unit tests that delete the deck, and separately a single capture, while `prepare()` is held open, and assert zero provider calls.
- Make manual retry recheck Privacy, Only on-device and Demo settings right before dispatch. Do this after Remote Config loads and after the cloud approval dialog. Add tests for a settings change during preparation and during approval.
- Make the privacy claim in the README, story, script and cover match the verified behavior. Add Options retry and diagnostics to the README architecture section. Separate Nano's `responseConstraint` from the cloud's `responseSchema` in the structured-output description.
- After the fixes, rerun the three suites and `npm run package`. The owner still needs to check anonymous GitHub access and Apache-2.0 detection, and rehearse the packaged extension in Chrome's native side panel, including the Only cloud reconnect step.
- Re-read the queue entry after asynchronous setup and before inference. Skip deleted captures and covers for both manual retry and automatic drain with tests that delete the deck during setup and assert zero provider calls.
- Revalidate Privacy, Only on-device, and Demo settings after asynchronous setup in Options before starting inference. Add coverage for a change saved during setup as well as during lock acquisition.
- Align the README with the Options inference entry points and make shot 3 narration match the visible route. Rebuild the ZIP and rerun the required suites after the queue fixes.
- Owner: verify anonymous GitHub access and Apache-2.0 detection, then rehearse the packaged native Chrome flow and the configured live shots, including Only cloud reconnect. Record the routes and timing observed.

## Win-ready

NO
