# iter02 review

## Verdict: FAIL

## Tests: PASS

## Regressions: NONE

Reviewer verdict: FAIL (agreement on attempt 2). Driver verdict: FAIL (agreement on attempt 2).

## Kiro Opus 5.5 evidence (FAIL)

# Round 2 review of Margin (reconciliation attempt 2)

The verdict is FAIL because the orchestrator's baseline e2e run on HEAD `8e85524` had two failing tests this round, and the brief says any failed test found this round forces FAIL. Those failures were in the accessibility sweep and the long-notes chunking test. The diff fixes both, and the fresh driver run passes all three suites, so the current build is green. PASS would be ruled out anyway, because several Definition of Done items are still unmet or can't be verified here.

I disagree with the peer review on regressions. Nothing that was correct at HEAD is broken in the diff. The application source and manifest are unchanged. The issues the peer listed are incomplete fixes or old defects:
- The Demo-mode narration was missing entirely before and is now only partly written.
- The queue mode-boundary bug already existed at HEAD.
- The stale cover is a known pending item; `submission-checklist.md` marks it "⚠ cover".

Process note for the owner: the builder sandbox can't run Playwright (`listen EPERM`). If builder runs count under the "any failed test this round" rule, every round will FAIL. The rule should probably name the driver's run as the deciding e2e result.

## Test evidence

| Suite | Who ran it | Exit | Notes |
|---|---|---:|---|
| `npx tsc --noEmit` | Driver | 0 | `STATE/logs/iter02_typecheck_tests.txt` ends with `EXIT=0`. |
| `npm test` | Driver | 0 | `iter02_unit_tests.txt`: `EXIT=0`, no todo or skipped tests, 109 cases (the same count the builder and orchestrator reported). |
| `npm run test:e2e` | Driver | 0 | `iter02_e2e_tests.txt`: `10 passed (26.3s)`, `EXIT=0`. |
| `npm run test:e2e` baseline on HEAD | Orchestrator | nonzero (exact code not recorded) | 8 passed, 2 failed, both strict-mode locator violations (`CHECKLIST.md` line 6). **This is a failed test found this round, which forces FAIL.** |
| typecheck / unit / e2e | Builder | 0 / 0 / 1 | All 10 e2e tests failed on `listen EPERM 127.0.0.1` before any test body ran (`BUILD_REPORT.md:101`). This is a sandbox problem, not a product failure. |

I ran no suites myself and relied on the driver logs above. My own checks were read-only:
- `git grep` for Firebase-style API keys and private-key blocks found nothing.
- I read the cover image and the relevant source.
- `margin-extension.zip` exists, with a timestamp of 07:37 this round.

## Diff summary

- **`test/e2e/extension.spec.ts`:** three locators are now scoped to the first card (fixing the strict-mode failures). The quick-look test now clicks **Open side panel** in the popup and waits for the popup to close.
- **README, story, script, submission checklist, `scripts/screenshots.mjs`:** the tagline changed from "Private by default, cloud when it counts" to "Sensitive text stays on-device. Cloud when it counts."
- **Demo script:** adds a Demo-mode recording note and rewrites shot 4 as an offline flow with pasted notes (it no longer uses the PDF).
- **Testing instructions:** now say live mode needs a registered App Check debug token.
- **Screenshots:** five PNGs regenerated.

## Stage One

| # | Grade | Evidence |
|---|---|---|
| 1. Hybrid SDK called at runtime | **Pass (code)** | `firebaseProvider.ts` calls `getAI` with `useLimitedUseAppCheckTokens`, then `getGenerativeModel`, `generateContent`, and reads `inferenceSource`. `router.ts` chooses `ONLY_ON_DEVICE`, `ONLY_IN_CLOUD`, queue or confirm for each capture. Live calls can't run here. |
| 2. App Check | **Pass (code)** | `src/firebase/init.ts` calls `initializeAppCheck`. The new line in the testing instructions honestly says only the debug-token path works. No token is committed. |
| 3. Public repo + license | **Partial** | `LICENSE` is Apache-2.0, and the driver pushed to `MadanChaollaPark/margin-flashcards`. Public visibility and GitHub's license detection were not checked. |
| 4. Demo video materials | **Partial** | The script runs 2:50, and the first 30 s cover the audience, the problem and hybrid inference. The new shot 4 matches the router: offline long text is chunked on-device, and offline "Only cloud" is queued. Gaps: the Demo-mode note only rewrites shot 2's narration. Shots 3, 4, 6 and 8 still say things like "Nano splits" and "Nano grades my answer" over simulated footage. Shot 4 now has two offline cycles and a settings change in 20 s with no timing check. |
| 5. Devpost story | **Partial** | The new tagline is still absolute. `router.ts:148` returns `confirm` for a pattern-only sensitive match when Nano is unavailable. After the user approves, `ctx.confirmedCloud` sends the capture to the cloud. Remote Config can also set `sensitivityCheck` to false. The pattern check is a heuristic, so "Sensitive text stays on-device" overclaims. |
| 6. Testing instructions / installable | **Partial** | The source build and ZIP steps are documented. The e2e test now covers the click from the popup to the side panel, then opens `sidepanel.html` in a tab. A walkthrough of the native panel in Chrome is not verified. |
| 7. No secrets / PII | **Pass (working tree)** | `git grep` found no key patterns. The config example uses placeholders and the script uses `learner@example.invalid`. The driver's staged scan is still to come. |
| 8. English | **Pass** | The e2e sweep asserts `lang="en"`, and all materials are in English. |
| 9. Mock mode labeled | **Partial** | Every page shows the **DEMO MODE (simulated AI)** banner, and routes and grades show **Simulated** badges, including on the cover. The script narration over Demo footage still describes live behavior (see item 4). |

## Stage Two

- **Technical implementation, 3.5/5.** Routing, chunking, the offline queue, review, export and restore are tested, and typecheck is clean. I confirmed a queue defect that predates this round. `generateCards` records whether a capture was simulated only in the reason text (`runtime.ts`, the `Simulated — ` prefix). The automatic drain (`sidepanel.ts`) and the manual retry (`options.ts`) both rebuild the provider from the current settings with `createRuntime()`. As a result, a capture queued in Demo mode can go to live cloud after the user turns Demo mode off. A live capture can also be completed with simulated cards. The sensitivity gate does run again on retry, which limits the privacy exposure.
- **Design, 3.5/5.** The workflow hangs together, and the accessibility sweep passes (minimum contrast 5.71:1 light, 6.80:1 dark). `cover.png` is stale. I viewed it, and it still reads "Private by default, cloud when it counts" while every other material uses the new tagline. The gap in the Options page column noted in the checklist is still there.
- **Potential impact, 4/5.** The story makes a specific case for learners: reading becomes source-linked cards, sensitive notes stay local, and decks go to Anki. It would be stronger if the privacy wording matched the actual controls.
- **Quality of the idea, 4.5/5.** Hybrid inference does distinct jobs here: a sensitivity gate, on-device grading of typed answers, and source anchors that link back to the passage.

## Engineering and packaging

| Item | Grade | Evidence |
|---|---|---|
| tsc / unit / e2e | **Pass (driver)** | All three exited 0. The baseline failure earlier this round is recorded above. |
| Refreshed ZIP | **Pass** | `margin-extension.zip` was rebuilt at 07:37 this round. The builder reported 229 files, `manifest.json` at the root, and no source maps or env files. |
| Screenshots | **Partial** | The gallery was regenerated. The cover is stale (see Design). |
| README, script, story in sync | **Partial** | The tagline overclaims, the Demo-mode narration is incomplete, and the cover doesn't match. |
| Secret scan | **Partial** | The working tree is clean. The driver's staged scan is pending. |

## Codex Sol evidence (FAIL)

The final driver run passed all three required suites. The builder’s Playwright run exited 1 this round when the sandbox denied the fixture listener. I counted that failed suite under the round’s explicit failure rule. The final diff fixes both baseline locator failures, and I found no new product or test regression. The stale cover, remaining privacy overstatement, and unverified public repository would also prevent a pass.

## Test evidence

| Command | Runner | Exit | Result |
|---|---|---:|---|
| `npx tsc --noEmit` | Driver | 0 | Clean. [Typecheck log](/workspace/flashcard-ext/STATE/logs/iter02_typecheck_tests.txt) |
| `npm test` | Driver | 0 | 109 passed, zero failed, skipped, or cancelled. [Unit log](/workspace/flashcard-ext/STATE/logs/iter02_unit_tests.txt) |
| `npm run test:e2e` | Driver | 0 | Build succeeded. All 10 loaded-extension cases passed in 26.3 seconds, with no skips. [E2E log](/workspace/flashcard-ext/STATE/logs/iter02_e2e_tests.txt) |
| `npx tsc --noEmit` and `npm test` | Builder | 0 each | The build report records clean typecheck and 109 passing unit cases. [Build report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md:91) |
| `npm run test:e2e` | Builder | 1 | All 10 cases stopped in fixture setup at `listen EPERM 127.0.0.1`. No browser assertions ran. [Build report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md:91) |
| `npm run test:e2e` on the pre-edit baseline | Orchestrator | Unrecorded | Eight passed and two failed on ambiguous locators. Both cases passed in the final driver run. [Checklist](/workspace/flashcard-ext/STATE/CHECKLIST.md:5) |

I inspected the fresh driver logs without rerunning the suites. The three locator edits scope assertions to the card whose editor or route details the test opens. The quick-look test now clicks **Open side panel** and waits for `chrome.sidePanel.open` to resolve, then exercises the side-panel workflow in a directly opened extension page. The fixture adds host permissions and preserves the packaged side-panel entry. [Test changes](/workspace/flashcard-ext/test/e2e/extension.spec.ts:183) · [Popup handler](/workspace/flashcard-ext/src/ui/popup.ts:15)

## Stage One

| Item | Grade | Evidence |
|---|---|---|
| 1. Firebase AI Logic hybrid inference | **Met in code** | The configured live runtime instantiates `FirebaseProvider`. It calls `getAI`, `getGenerativeModel`, `generateContent`, and, on user action, `initializeDeviceModel`. The router reaches all four SDK modes. Classification and typed grading request `ONLY_ON_DEVICE` and require an on-device result. Live Firebase and Nano execution remain unverified in this environment. [Runtime](/workspace/flashcard-ext/src/ai/runtime.ts:16) · [Provider](/workspace/flashcard-ext/src/ai/firebaseProvider.ts:29) · [Router](/workspace/flashcard-ext/src/ai/router.ts:148) · [Grading](/workspace/flashcard-ext/src/ai/grade.ts:27) |
| 2. App Check | **Met in code** | Live initialization calls `initializeAppCheck`. AI Logic requests limited-use tokens. The judge instructions explain the registered debug-token path and the missing production token issuer. [App Check initialization](/workspace/flashcard-ext/src/firebase/init.ts:12) · [Provider](/workspace/flashcard-ext/src/ai/firebaseProvider.ts:33) · [Judge instructions](/workspace/flashcard-ext/submission/testing-instructions.md:15) |
| 3. Public repository and detectable license | **Partial** | Local `main` descends from the clean public root, `origin` points to `MadanChaollaPark/margin-flashcards`, and the root license is Apache-2.0. Public access and GitHub’s license display remain unverified under the local-only brief. [License](/workspace/flashcard-ext/LICENSE) · [Submission checklist](/workspace/flashcard-ext/submission/submission-checklist.md) |
| 4. English Chrome demo materials | **Partial** | I verified nine contiguous shots totaling 2:50. The first 30 seconds cover students, the cost of making cards, and Firebase AI Logic hybrid inference. The revised offline queue sequence is feasible from code. The script offers a simulated recording, but only replaces shot 2’s narration. Shots 4 and 6 still describe Nano as doing the work shown, and shot 4 credits Nano with chunking that Margin performs before inference. [Demo script](/workspace/flashcard-ext/submission/demo-video-script.md:14) · [Chunking](/workspace/flashcard-ext/src/ai/router.ts:159) |
| 5. Devpost story | **Partial** | The story explains the Firebase integration, features, and learner value. Its backup description correctly says card fronts and backs can quote the source. The headline still promises “Sensitive text stays on-device” without qualifying the cloud-approval exception that the body and router describe. The rendered cover still says “Private by default,” although Privacy mode defaults off. [Story](/workspace/flashcard-ext/submission/devpost-story.md:3) · [Router](/workspace/flashcard-ext/src/ai/router.ts:167) · [Settings](/workspace/flashcard-ext/src/storage/settings.ts:16) · [Cover](/workspace/flashcard-ext/submission/screenshots/cover.png) |
| 6. Install and judge testing instructions | **Met for the Demo quick look** | The instructions cover source build and ZIP installation. The driver verified sample generation, saving, review, and the popup’s side-panel open call. The queue case verifies saving on reconnect after switching to Privacy mode. It leaves the recording script’s reconnect with **Only cloud** still selected unverified in-browser. [Instructions](/workspace/flashcard-ext/submission/testing-instructions.md:3) · [Quick look](/workspace/flashcard-ext/test/e2e/extension.spec.ts:183) · [Queue case](/workspace/flashcard-ext/test/e2e/extension.spec.ts:587) |
| 7. No production keys, secrets, confidential data, or PII | **Met in reviewed material** | Credential-pattern and forbidden-filename checks found no matches in the reviewed public history or current tracked material. ZIP credential checks and the source and submission UUID scan were clean. The example address uses `.invalid` and the Firebase config contains placeholders. [Example config](/workspace/flashcard-ext/firebase.config.example.json) · [Ignore rules](/workspace/flashcard-ext/.gitignore) |
| 8. English | **Met** | The browser sweep asserted `lang="en"` on all five extension pages. The story, script, and judge instructions are in English. [Accessibility sweep](/workspace/flashcard-ext/test/e2e/extension.spec.ts:262) |
| 9. Mock and demo labeling | **Met in the extension and gallery** | The browser suite verifies the **DEMO MODE (simulated AI)** banner and simulated route and grading badges. The cover’s embedded views carry the Demo label. No live inference result is claimed for this review. The alternative recording narration still needs the edits under item 4. [Badge rendering](/workspace/flashcard-ext/src/ui/shared.ts:100) · [Review badge](/workspace/flashcard-ext/src/ui/review.ts:74) · [Cover](/workspace/flashcard-ext/submission/screenshots/cover.png) |

## Engineering and packaging

| Item | Grade | Evidence |
|---|---|---|
| Required suites | **Final driver run met. Round failure recorded.** | All required driver exits were 0. The builder’s full browser suite exited 1 at fixture setup. |
| Refreshed ZIP | **Met** | The builder ran `npm run package`, exit 0. I verified archive integrity and all 229 entries byte-for-byte against the driver-built `dist/`. `manifest.json` is at the archive root. The ignored ZIP contains no source maps, `.env`, or local Firebase config. [Build report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md:91) |
| Current screenshots | **Partial** | The orchestrator refreshed the gallery. The hero, generated cards, export, and library shots show Demo labeling. I opened the current cover PNG and confirmed that it still displays the old tagline, even though the renderer source has changed. [Cover](/workspace/flashcard-ext/submission/screenshots/cover.png) · [Cover renderer](/workspace/flashcard-ext/scripts/screenshots.mjs:177) |
| Architecture diagram, script, and story | **Partial** | The diagram reflects local checks, hybrid inference, cloud, the retry queue, and review. The script and story have the remaining copy and verification gaps above. [Architecture](/workspace/flashcard-ext/README.md:32) |
| Secret scan per push | **Partial** | The local checks were clean. The driver’s staged scan is wired before commit and push. The round’s publication scan remains to be run. [Driver scan](/workspace/flashcard-ext/driver.py:450) · [Publication gate](/workspace/flashcard-ext/driver.py:531) |

## Stage Two

- **Technology, 4/5.** The mode selection, sensitivity gate, queue rerouting, chunking, source checks, and Remote Config have substantive coverage. Loaded-extension tests cover capture, review, export, and restore result handling. Live Firebase paths and actual Firestore restore remain unverified here.
- **Design, 4/5.** Onboarding, capture, review, and export form a coherent flow. The five-page accessibility sweep passed its name and keyboard checks. The lowest measured text contrast was 5.71:1 in light mode and 6.80:1 in dark mode. The cover copy is stale. [Accessibility results](/workspace/flashcard-ext/STATE/logs/iter02_e2e_tests.txt)
- **Impact, 4/5.** The story gives learners a concrete way to turn readings into scheduled recall and take decks to Anki. A qualified privacy claim would help readers understand when to use Privacy mode.
- **Idea, 4.5/5.** Source-linked cards, local answer grading, and sensitivity checks give hybrid inference distinct roles in the reading-to-recall workflow.

The review was read-only. The owner’s role and consensus decision remains intact in `GOAL.md` and `STATE/PLAN.md`. I left `STATE/REVIEW.md` and driver-owned files untouched.

## Scores

- Kiro Opus 5.5: tech=3.5 design=3.5 impact=4.0 idea=4.5 avg=3.88
- Codex Sol: tech=4.0 design=4.0 impact=4.0 idea=4.5 avg=4.12

## Must-fix

- Regenerate `submission/screenshots/cover.png` with `npm run screenshots` and inspect it, so it matches the final tagline.
- Rewrite the tagline everywhere it appears (README, Devpost story, script shot 9, submission checklist, cover renderer). The new wording should reflect that the pattern check is a heuristic, that cloud runs only with per-capture approval, and that Privacy mode forces on-device. For example: "Sensitive text stays on-device unless you approve cloud."
- Write Demo-mode narration for every simulated shot (3, 4, 6 and 8, not only shot 2), and time shot 4's two offline cycles against its 20 s slot.
- Record Demo or Live on each queued capture. On automatic drain and manual retry, skip or ask about entries whose mode doesn't match the current settings. Add tests for switching in both directions.
- Have the owner confirm the repo is public, that GitHub detects the license, and that the side panel works in Chrome with the packaged extension. The driver keeps the staged secret scan.
- Process: have the driver's e2e run decide the round result, and record the exact exit code of the orchestrator's baseline run. Otherwise the builder sandbox's `EPERM` failure will force FAIL every round.
- Run the next round’s full Playwright verification in the environment that can bind the loopback fixture and launch Chromium. Record a clean run for all three required suites.
- Replace the blanket privacy tagline with wording that reflects the per-capture approval exception. Apply it across the README, Devpost story, script, checklist, and renderer, then regenerate and inspect `cover.png`.
- Finish the simulated narration for shots 4 and 6. Credit Margin with chunking, and rehearse or verify the documented reconnect sequence with **Only cloud** still selected.
- Have the owner verify anonymous access to `margin-flashcards` and GitHub’s Apache-2.0 display. Record the result and retain the driver’s staged secret scan before publication.

## Win-ready

NO
