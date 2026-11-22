# PLAN — Round 1 (builder work package, ~45–70 min)

Planner/orchestrator is Kiro `claude-opus-5.5` at high reasoning (not max); builder is Codex `gpt-6.2-sol` at high effort in standard/slow mode (`features.fast_mode=false`); reviewers are both Opus 5.5 (high) and Sol 6.2 (high, slow), with up to 3 consensus attempts then Opus-wins tiebreak. Owner decision — do not revert.

## Ground rules (from GOAL.md)
- Work only in `/workspace/flashcard-ext`. Do not run `git commit`, `git push`, or tag. Do not edit `LOOP_LOG.md`, `driver.py`, `GOAL.md` role lines, or wipe `STATE/`. Do not create `STATE/ALL_DONE`.
- No sign-ins, posting, uploads, or network submissions. No new npm dependencies unless unavoidable (prefer none; no axe-core download).
- Never invent results. `STATE/BUILD_REPORT.md` must list each command you actually ran with its real pass/fail counts.
- Demo mode stays labeled "DEMO MODE (simulated AI)" / "Simulated". No doc may claim a live Gemini Nano or cloud call ran in this environment.

## Baseline (orchestrator ran these this round, all green)
`npm test` 108/108 · `npx tsc --noEmit` clean · `npm run test:e2e` 6/6. Any regression from this is a FAIL; fix it before anything else.

## Work items, in order

### 1. Judge quick-look flow e2e (DoD Stage One #6 testing instructions, #9 demo labeling)
Open steps:
- Add a Playwright test in `test/e2e/extension.spec.ts` that follows `submission/testing-instructions.md` "Quick look" literally on a fresh profile: open popup → assert an **Open side panel** control exists → open `sidepanel.html` → welcome card visible → **Try a sample** → **Generate** → cards appear with a "Simulated" route label and the `DEMO MODE (simulated AI)` banner visible → save → open Review → reveal/rate one card → session advances.
- Dismissing the welcome card persists (`welcomeSeen`) across a reload.
- If any step's UI label differs from the instructions, fix the instructions (not the test) unless the UI is clearly wrong.
Acceptance: `npx playwright test -g "quick look"` passes (name the test so it contains "quick look"); full `npm run test:e2e` passes.
Evidence: test name + pass line in BUILD_REPORT.

### 2. Accessibility sweep (Stage Two Design)
Open steps:
- Add one e2e test ("accessibility sweep") that loads sidepanel, popup, review (with a seeded due card), library, options in both `colorScheme: 'light'` and `'dark'` and asserts:
  a. `<html lang="en">`;
  b. every visible `button, a[href], input, select, textarea, [role=button]` has a non-empty accessible name (use `locator.ariaSnapshot()` or an in-page check of aria-label / aria-labelledby / `<label>` / text / title / alt);
  c. WCAG contrast ≥ 4.5:1 for normal text on: demo banner, route badges (on-device, cloud, kept-local, queued, simulated), primary and secondary buttons, body text, muted/secondary text. Compute contrast in-page from `getComputedStyle` color/background (walk ancestors for an opaque background);
  d. `:focus-visible` produces a visible outline on a button (outline-style not `none` or a box-shadow present) after keyboard Tab.
- Fix any failures in `src/ui/*.html` / `src/ui/styles.css`. No visual redesign; minimal token changes only.
Acceptance: `npx playwright test -g "accessibility sweep"` passes; full e2e passes.
Evidence: list of elements/colors fixed (before→after ratio) in BUILD_REPORT.

### 3. Hybrid routing e2e gaps (Stage Two Technological Implementation)
Open steps (do a and b; c only if it needs no product test hooks):
- a. Long-text chunking: offline (`context.setOffline(true)`), demo Nano available, paste a text above the on-device budget (`maxOnDeviceTokens` default 6000 est. tokens) → badge On-device with reason matching `/on-device chunks/i`, cards deduplicated (no two identical fronts). Then online with mode Auto → same text routes Cloud with reason matching `/exceeds the on-device token budget/i`.
- b. YouTube captions: serve a fake `https://www.youtube.com/watch?v=...` page via `context.route` containing a `ytInitialPlayerResponse` with a `captionTracks` entry whose `baseUrl` is also routed to `test/fixtures/captions.xml`; choose the YouTube source in the side panel → cards generated, source link points at the video URL. If capture uses a code path that can't be intercepted, document exactly why in BUILD_REPORT and add/extend a unit test in `test/unit/sources.test.ts` instead.
- c. Nano-unavailable fallback reason: only if an existing, user-visible, demo-labeled setting can simulate it. Do not add hidden test-only switches to the product. Otherwise confirm unit coverage in `test/unit/router.test.ts` and note it.
Acceptance: `npx playwright test -g "chunk"` and `-g "YouTube"` pass (or documented unit-test substitute passes in `npm test`); full suites pass.

### 4. Truthful submission docs (DoD Stage One #4, #5, #6, #7)
Open steps:
- `submission/testing-instructions.md`: step 1 must not assume a GitHub Release exists. Offer (i) "if a release zip is attached, download it", and (ii) the always-available path: `git clone https://github.com/MadanChaollaPark/margin-flashcards && cd margin-flashcards && npm ci && npm run build`, then Load unpacked `dist/`. State Node 24 requirement. Keep it short enough to paste into Devpost.
- `submission/demo-video-script.md`: re-time so shots 1–2 (who it's for, problem, and "Firebase AI Logic hybrid inference: Gemini Nano on-device first, Gemini in the cloud when needed and allowed") finish by **0:30**. Total stays ≤ 3:00 (sum the table). Keep the "record the live path / label any demo shot as simulated" warning. Every UI label quoted must exist in `src/ui/` (grep each one).
- `submission/submission-checklist.md`: remove stale lines ("no remote added", "push the clean `public` branch"); state the remote `MadanChaollaPark/margin-flashcards`, branch `main`, and that Devpost submission/YouTube upload remain owner tasks.
- `submission/devpost-story.md` and `README.md`: verify each concrete claim touched by this round (e.g. "tests check that each of the four inference modes is reachable", context-menu item names, route reason strings) against code with grep; fix any mismatch. Do not hard-code test counts.
Acceptance (all must print the expected result):
```
grep -n "GitHub Release" submission/testing-instructions.md   # only as an optional path, not the sole path
grep -n "npm ci" submission/testing-instructions.md            # present
grep -nE "no remote added|clean \`public\` branch" submission/submission-checklist.md  # no output
for s in "Try a sample" "Enable on-device AI" "Make flashcards from selection" "Kept local" "Run live hybrid test"; do grep -rqF "$s" src || echo "MISSING: $s"; done   # no MISSING lines
```
Evidence: the re-timed shot table's computed total and the 0:30 boundary in BUILD_REPORT.

### 5. Repo hygiene (DoD Stage One #2, #7)
Open steps:
- `research/hybrid.txt` line ~525: replace the docs example App Check debug token value with `<DEBUG_TOKEN>` (keep the surrounding text).
- Top-level `logs/` holds ~5 MB of raw build-agent logs from earlier milestones (minified bundle dumps, `/home/...` paths). Confirm they exist in git history (`git log --oneline -- logs | head -1` non-empty), then delete the working-tree files under top-level `logs/` and add `/logs/` to `.gitignore` (do **not** touch `STATE/logs/` or its ignore rule). Do not run `git rm`/`git add`; the driver stages.
Acceptance:
```
grep -rnE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" research src submission README.md   # no debug-token-shaped values
git grep -nE "AIza[0-9A-Za-z_-]{30,}|BEGIN [A-Z ]*PRIVATE KEY" -- . ':!package-lock.json'   # no output
test ! -d logs || [ -z "$(ls -A logs)" ]
```

### 6. Screenshots and package (Engineering; Stage Two Design)
Open steps:
- Run `npm run screenshots`. Open and look at every PNG in `submission/screenshots/` (use your image viewer). Each must match the current UI, show the DEMO MODE banner/"Simulated" labels where demo output is shown, and contain no clipped or overlapping text. Fix the UI or the script for any defect, then re-run. If item 2 changed colors, the screenshots must reflect it.
- Duplicate `09-` prefix (`09-library.png`, `09-review-dark.png`): rename one to `10-…` in `scripts/screenshots.mjs` and update every reference (`grep -rn "09-" README.md submission scripts`).
- Run `npm run package`; verify with `unzip -l margin-extension.zip | head` that `manifest.json` is at the archive root and that no `firebase.config.local.json`, `.env`, or `*.map` is inside.
Acceptance: `ls -la submission/screenshots` shows today's timestamps; `unzip -l margin-extension.zip | grep -E "^.* manifest.json$"` shows a root entry; `unzip -l margin-extension.zip | grep -E "\.map$|\.env|config.local"` prints nothing. README image links resolve (`grep -o "submission/screenshots/[^)]*" README.md | xargs ls`).

### 7. Final verification (required)
Run, in this order, and paste real summary lines into `STATE/BUILD_REPORT.md`:
```
npx tsc --noEmit
npm test
npm run test:e2e
npm run package
```
All must pass. Then remove any temp files you created (no stray profiles, scratch scripts, or `test-results/` changes beyond what Playwright normally leaves, which is gitignored).

## BUILD_REPORT.md must contain
For each item 1–7: done / partial / skipped, files changed, commands run with real output summary, evidence (test names, contrast ratios, timing total, zip listing excerpt), and remaining gaps. Anything not run must be marked "not run".

## Deferred (keep in checklist, not this round)
- Live Firebase / Gemini Nano verification (impossible here; owner records the video on the live path).
- Second platform (explicitly out of scope per GOAL unless honest and complete).
- Production App Check attestation provider (documented limitation; debug provider is allowed for judging).
