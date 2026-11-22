# iter01 review

## Verdict: FAIL

## Tests: FAIL

## Regressions: FOUND

Reviewer verdict: FAIL (agreement on attempt 1). Driver verdict: FAIL (driver's test gate failed).

## Kiro Opus 5.5 evidence (FAIL)

# Round 1 review: Margin (reviewer: Opus 5.5)








## Test results

| Suite | Who ran it | Result |
|---|---|---|
| `npx tsc --noEmit` | Driver (`STATE/logs/iter01_typecheck_tests.txt`) | EXIT=0, no diagnostics |
| `npm test` | Driver (`STATE/logs/iter01_unit_tests.txt`) | EXIT=0, 109 pass, 0 fail, 0 skipped |
| `npm run test:e2e` | Driver (`STATE/logs/iter01_e2e_tests.txt`) | **EXIT=1: 8 passed, 2 failed** |
| `npm run test:e2e` | Builder (`BUILD_REPORT.md` §7) | Exit 1. All 10 failed at the fixture with `listen EPERM 127.0.0.1` before any test body ran |

The builder could not run browsers. That means the two new or rewritten Playwright tests were first run by the driver, and both failed:

1. **`accessibility sweep covers five extension pages in light and dark`** (`test/e2e/extension.spec.ts:254`). `library.getByLabel("Back", { exact: true })` hit a strict-mode violation: it resolved to 8 textareas, because every library card keeps its hidden edit form in the DOM. The test stopped before any contrast, accessible-name or Tab-focus assertion ran. Browser-computed accessibility is therefore still unverified.
2. **`long notes generate deduplicated on-device chunks offline and route to cloud online`** (`:464`). `panel.getByText(/Split into 2 on-device chunks\./iu)` resolved to 2 elements. `src/ui/shared.ts:92-96` gives each card's route `<details>` its own `p.hint` with the same reason. The badges and routing behaved as intended (both cards were "Simulated · On-device"). The locator is not scoped to one card, and the cloud half of the test never ran.

Both failures are test-locator bugs, not product defects. Under the round rules, a failed suite still forces FAIL, and new failing e2e tests count as a regression in the test suite. The other 8 e2e tests passed, including the new quick-look and YouTube tests, which the builder had never seen pass.

## Definition of Done grades

**1. Hybrid Inference SDK called at runtime: Met (code inspection).**
- `src/ai/firebaseProvider.ts` calls `getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true })` and `getGenerativeModel(...)` with `mode`, `onDeviceParams` and `inCloudParams`.
- It calls `model.generateContent(...)` and reads `response.inferenceSource`. It also calls `initializeDeviceModel`.
- `src/ai/router.ts` produces `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD` and `ONLY_IN_CLOUD`. `PREFER_ON_DEVICE` is handled in `provider.ts` and `firebaseProvider.ts`. The unit test "decide produces all four Firebase inference modes" passes.
- No live call could run here, which the docs acknowledge.

**2. App Check: Met, with a caveat.**
- `src/firebase/init.ts` calls `initializeAppCheck` with `CustomProvider` and sets `FIREBASE_APPCHECK_DEBUG_TOKEN` from user settings at runtime.
- No token is committed. The UUID grep over `research src submission README.md scripts` returned 1, and `.env*` and `firebase.config.local.json` are absent from disk and git.
- Caveat: the production `CustomProvider.getToken` always throws, so only the debug-token path works. The code comment says so. The judge instructions should state it too.

**3. Public repo and license: Partially verified.**
- `LICENSE` is Apache-2.0 and unchanged.
- `origin` points to `MadanChaollaPark/margin-flashcards`, the branch is `main`, and HEAD descends from `508bb32`.
- I did not check that the repo is public online.

**4. Demo video script: Met.**
- Nine shots running 0:00–2:50, all in English.
- 0:00–0:30 covers the audience (students), the problem, and Firebase AI Logic hybrid inference.
- The script tells the owner to record the live path and to keep the DEMO MODE banner and a "simulated" label on any Demo footage.
- "This paragraph ran on my laptop" is only true for a live recording. The script requires a live recording, so this is acceptable.

**5. Devpost story: Met (inspection).**
- The diff aligns the story with the current labels and routes.
- The builder's `rg` checks tied the quoted route reasons to `src/ai/router.ts` and `provider.ts`. I spot-checked "exceeds the on-device token budget" and "Split into N on-device chunks" in `router.ts`.

**6. Testing instructions: Partial.**
- `submission/testing-instructions.md` covers both the source build and the optional release ZIP, plus the live setup with the App Check debug token.
- The core flow works in 8 passing e2e tests.
- The quick-look path passed in e2e. The accessibility and long-note paths are not verified this round.

**7. No secrets or PII: Met.**
- `git grep` for `AIza…` and private keys returned 1 (no matches).
- The research token was replaced with `<DEBUG_TOKEN>`.
- The 33 top-level `logs/` files are deleted in the worktree.
- The fictional example uses `learner@example.invalid`.

**8. English: Met.** `lang="en"` is asserted in tests, and all materials are English.

**9. Mock mode clearly labeled: Met.** The "DEMO MODE (simulated AI)" banner and the "Simulated · …" badges are asserted in the passing e2e tests. The docs make no claim that live inference ran here.

**Engineering and packaging: Not met.**
- e2e failed (above).
- Screenshots were not regenerated: all PNGs still have Nov 20 timestamps. `09-review-dark.png` was only renamed to `10-review-dark.png`. The framing changes to `scripts/screenshots.mjs` are untested.
- `margin-extension.zip` was produced by `npm run package` (Nov 22 23:40, 229 files, no `.map` or `.env`). The driver rebuilt `dist/` afterwards. The only source changes this round are tests, docs and scripts, so the ZIP content is probably current, but I did not diff it.

## Other checks

- **Owner decision:** The role and consensus text is intact in GOAL.md and STATE/PLAN.md. `driver.py`, `GOAL.md` and `LICENSE` have no diff.
- **Honesty of the build report:** It reports truthfully that e2e and screenshots were blocked, and it does not claim any pass it did not see. The builder's unit-count note ("7 tests" reported as 7 files) is explained correctly.
- **Accessibility:** The builder's static WCAG token table shows every pair at 4.5:1 or higher. That is a calculation from CSS tokens, not a browser measurement. The browser sweep that should confirm it crashed before measuring anything.
- **Security:** `useLimitedUseAppCheckTokens: true` is appropriate. The sensitivity gate runs before cloud-capable generation (`runtime.ts:61-63`), and unit tests cover it. Privacy mode blocks Firestore backup (unit-tested).

## Codex Sol evidence (FAIL)

The loaded-extension suite regressed from green. All six baseline cases passed again, along with the new quick-look and YouTube cases. Two new tests failed on ambiguous Playwright locators. The `src/` tree is identical to `HEAD`, and the driver evidence points to test defects. The round also has stale screenshots and submission claims that need correction. I left the worktree and `STATE/REVIEW.md` untouched.

## Test evidence

| Suite | Runner | Exit | Round 1 result |
|---|---|---:|---|
| `npx tsc --noEmit` | Driver | 0 | Clean. [Typecheck log](/workspace/flashcard-ext/STATE/logs/iter01_typecheck_tests.txt) |
| `npm test` | Driver | 0 | 109 passed, zero failed or skipped. [Unit log](/workspace/flashcard-ext/STATE/logs/iter01_unit_tests.txt) |
| `npm run test:e2e` | Driver | 1 | Build passed. Chromium ran all 10 cases, with 8 passed and 2 failed. [E2E log](/workspace/flashcard-ext/STATE/logs/iter01_e2e_tests.txt) |

- **Accessibility sweep.** The page-wide `Back` locator matched eight card editors. The test stopped before the five-page light and dark sweep. The builder’s static contrast measurements provide supporting evidence, and browser-computed contrast, accessible names, and keyboard focus remain unverified across those states. [Failing assertion](/workspace/flashcard-ext/test/e2e/extension.spec.ts:254)
- **Long notes.** Both simulated on-device badges appeared offline. The reason locator matched the explanation on both cards, so the test stopped before checking the unique fronts or reaching the online cloud phase. The online phase has the same unscoped locator pattern. [Chunking case](/workspace/flashcard-ext/test/e2e/extension.spec.ts:450)

The builder recorded typecheck and unit exits of 0 and an e2e exit of 1 from a loopback `EPERM` error. The fresh driver run supersedes that browser result because it reached the assertions. I inspected the driver logs and performed read-only artifact checks. [Build report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md:57)

## Stage One

| Item | Grade | Evidence |
|---|---|---|
| 1. Firebase AI Logic hybrid inference | **Pass for implementation** | Generation and typed review instantiate the live provider when configured. The provider calls `getAI`, `getGenerativeModel`, and `generateContent`, with `initializeDeviceModel` reachable from the enable button. The router implements all four SDK modes. Classification and grading request `ONLY_ON_DEVICE`. The packaged bundle contains the call sites. Live Firebase and Nano execution remain unverified as expected in this environment. [Provider](/workspace/flashcard-ext/src/ai/firebaseProvider.ts:29) · [Runtime](/workspace/flashcard-ext/src/ai/runtime.ts:16) · [Router](/workspace/flashcard-ext/src/ai/router.ts:148) |
| 2. App Check | **Pass for implementation** | The live Firebase initializer calls `initializeAppCheck`, and AI Logic requests limited-use tokens. The documented judge path uses a locally registered debug token. Production attestation would require a token issuer. [App Check initialization](/workspace/flashcard-ext/src/firebase/init.ts:12) · [Diagnostics](/workspace/flashcard-ext/src/ui/diagnostics.ts:86) |
| 3. Public repo and license | **Partial** | The local remote points to `MadanChaollaPark/margin-flashcards`, the cached `origin/main` matches local `main`, and Apache-2.0 is visible at the root. Public access and GitHub license detection remain unverified under the local-only constraint. [License](/workspace/flashcard-ext/LICENSE) |
| 4. English demo video materials | **Partial** | I verified 170 seconds total and 61 opening words covering the audience, problem, and hybrid inference by 0:30. The offline scanned-PDF shot needs an accessible PDF source because capture fetches its bytes before routing can queue it. The script also needs alternate narration for any simulated shot that currently says inference ran on the laptop. [Demo script](/workspace/flashcard-ext/submission/demo-video-script.md:14) · [PDF capture](/workspace/flashcard-ext/src/sources/pdf.ts:31) |
| 5. Devpost story | **Partial** | The story covers Firebase, features, and learner value. “Private by default” overstates Auto, which can use cloud inference while Privacy mode defaults off. “Never source text” is too broad for backup. Firestore omits the captured passage field and source metadata, while uploading card fronts and backs that can contain words from the passage, including on-device cards. [Story](/workspace/flashcard-ext/submission/devpost-story.md:24) · [Settings](/workspace/flashcard-ext/src/storage/settings.ts:16) · [Backup mapping](/workspace/flashcard-ext/src/firebase/sync.ts:53) · [Backup selection](/workspace/flashcard-ext/src/firebase/sync.ts:159) |
| 6. Judge testing instructions and install | **Partial** | The instructions give a source build and an optional release ZIP. The quick-look case verified sample generation, saving, review, and welcome persistence. It checks that the popup button is enabled, then navigates directly to `sidepanel.html` using a test manifest. The actual toolbar-to-side-panel interaction with the packaged manifest remains unverified. [Instructions](/workspace/flashcard-ext/submission/testing-instructions.md:3) · [Quick-look case](/workspace/flashcard-ext/test/e2e/extension.spec.ts:183) |
| 7. Keys, secrets, and PII | **Pass for reviewed material** | My scan of current repository files outside runtime logs and of the ZIP found zero credential-pattern hits. The config example uses placeholders, sensitive local filenames are ignored, and the submission example uses a fictional `.invalid` address. This scan covers the current material. |
| 8. English | **Pass** | All five extension pages declare `lang="en"`. The instructions, story, and script are in English. |
| 9. Demo labeling | **Pass** | All five pages declare a **DEMO MODE (simulated AI)** banner. Generated routes and typed grades have explicit **Simulated** labels. The passing quick-look test confirmed the banner and generated badge. [Badge rendering](/workspace/flashcard-ext/src/ui/shared.ts:100) · [Review feedback](/workspace/flashcard-ext/src/ui/review.ts:74) |

## Stage Two

- **Technological implementation · 3.5/5.** Real SDK wiring, local sensitivity checks, offline retries, and Remote Config are substantive. Passing tests cover capture, review, exports, and YouTube captions. Firestore restore e2e coverage exercises result handling with a stubbed response. The long-text browser case remains incomplete.
- **Design · 3.5/5.** Onboarding, route explanations, the editable library, and the review flow form a coherent product. The accessibility sweep stopped early. The current cover overlaps the extension views, and the export image crops out the main Demo banner. [Cover](/workspace/flashcard-ext/submission/screenshots/cover.png) · [Export screenshot](/workspace/flashcard-ext/submission/screenshots/08-export.png)
- **Potential impact · 4/5.** The reading-to-recall workflow solves a concrete problem for learners. Source-linked cards and Anki export make the output useful beyond Margin. The privacy claims need to match the settings and backup behavior.
- **Quality of the idea · 4.5/5.** Source-linked cards, local answer grading, and sensitivity-aware routing give each inference mode a distinct role in the study workflow.

## Engineering and packaging

| Item | Grade | Evidence |
|---|---|---|
| Required suites | **Fail** | Driver exits were typecheck 0, unit 0, and loaded-extension e2e 1. |
| Refreshed ZIP | **Pass** | Builder ran `npm run package` with exit 0. I verified archive integrity and byte-for-byte equality with current `dist/`. The 229-entry ZIP has `manifest.json` at its root and contains no `.env`, local Firebase config file, or source maps. |
| Refreshed screenshots | **Unmet** | Builder’s screenshot command failed twice. The images are dated Nov 20, and the renamed dark-review PNG is byte-identical to the previous file. [Screenshot report](/workspace/flashcard-ext/STATE/BUILD_REPORT.md:50) |
| README diagram, script, and story | **Partial** | The diagram matches the core routing and queue structure. The script and story have the gaps identified in Stage One. |
| Secret scan before each push | **Partial** | Current-file and ZIP scans were clean. The driver’s staged scan for the eventual commit remains pending. |

## Scores

- Kiro Opus 5.5: tech=3.5 design=3.5 impact=4.0 idea=4.0 avg=3.75
- Codex Sol: tech=3.5 design=3.5 impact=4.0 idea=4.5 avg=3.88

## Must-fix

- Fix the accessibility sweep locator at `test/e2e/extension.spec.ts:254`. Scope it to the opened card, for example `library.locator(".library-card").first().getByLabel("Back", { exact: true })`, or use the `getByRole("article", …)` pattern the page-capture test already uses. Then confirm the whole light/dark contrast, name and focus sweep passes.
- Fix the long-notes locator at `test/e2e/extension.spec.ts:464`, and the matching cloud check after it. Scope both to the first card, for example `panel.locator(".card").first().getByText(/Split into 2 on-device chunks\./iu)`, so the per-card route `<details>` duplicates don't cause a strict-mode violation. Then confirm the online cloud half passes.
- Get `npm run test:e2e` to exit 0 with all 10 tests passing in the driver run.
- Regenerate `submission/screenshots/` with `npm run screenshots` wherever Chromium can launch, so the new framing is actually rendered. Visually check the hero, side panel, export and dark-review shots against the current UI.
- Re-run `npm run package` after the final build of the round and record the file count.
- State in `submission/testing-instructions.md` (or the README Firebase section) that live mode works only with a registered App Check debug token, because the production `CustomProvider` has no token issuer.
- Scope the accessibility assertion to the opened card editor and scope both chunking reason assertions to their opened route details. Rerun the full driver suite and verify the browser accessibility measurements and both halves of the chunking case.
- Refresh and inspect the screenshot gallery in the browser environment used by the driver. Verify the hero, cover, and export framing and keep the Demo label visible wherever simulated output is shown.
- Align the privacy claims in the story, script, and graphics with Auto routing and optional Firestore backup. Make explicit that saved card text can be backed up even when generation ran on-device.
- Make the recording script reproducible. Supply an offline-accessible scanned PDF and rehearse capture, or use the covered cloud-only pasted-notes queue flow. Add simulated-shot narration wherever the live script claims a device or cloud result.
- Verify the toolbar-to-side-panel quick look with the packaged manifest. Have the owner or driver confirm public repository access, detectable Apache-2.0 licensing, and a clean staged secret scan before publication.

## Win-ready

NO
