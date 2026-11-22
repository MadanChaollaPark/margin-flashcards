# GOAL

Maximize the chance that **Margin**, a Chrome extension, wins the [#BuildHybridAI 2026 Firebase Hybrid AI Hackathon](https://firebasehybridaihackathon.devpost.com/). Work only in `/workspace/flashcard-ext`. Push only the local `main` branch (based on the clean `public` / `origin/main` history) plus per-round tags to https://github.com/MadanChaollaPark/margin-flashcards. Never push `master`, `loop-2026-11-20`, or any history that is not descended from the clean public root `508bb32`.

Margin turns a text selection, web page, PDF, YouTube captions, an image, or pasted notes into Anki-style flashcards. Cards are generated either on-device with Gemini Nano or in Google's cloud, through Firebase AI Logic hybrid inference. Sensitive-looking text stays on the device. Users review with FSRS spaced repetition and can export to Anki.

Hackathon deadline for the Devpost submission is **Monday, Nov 30, 2026 at 2:00 PM PT** (Tuesday, Dec 1, 2026, 7:00 AM KST). This loop does **not** submit to Devpost or post a YouTube video. It makes the repo, zip, screenshots, story, script, and tests as close to a winning submission as possible.

Prizes: $10,000 Grand Prize, $7,000 1st runner-up, $4,000 2nd runner-up, and $3,000 Best Web/Chrome App. Multi-platform apps get strong consideration for the Grand Prize, but an outstanding single-platform Chrome extension can still win. Stay on Web/Chrome unless a second platform can be done honestly and well without breaking the Chrome product; do not start a throwaway Android/iOS port.

Judging:

- **Stage One** is pass/fail on requirements: the submission includes every requirement, reasonably addresses the challenge, and reasonably applies the required tools. Failure here ends the run.
- **Stage Two** scores 1–5 on four equally weighted criteria; ties are broken in criterion order. Aim for ≥4.5 average from both reviewers with no must-fix items.

## Definition of Done

### Stage One — all required, or the submission cannot be judged

1. **Firebase AI Logic Hybrid Inference SDK** is imported and **actually called at runtime** (a real call site in extension code, not only a README mention). Use official hybrid inference modes (`PREFER_ON_DEVICE`, on-device only, cloud, and related APIs) appropriately per feature.
2. **App Check** is integrated, because Firebase AI Logic requires it. Debug tokens are allowed for judges but **must never be committed**. Never commit service-account keys, `.env` files, or `firebase.config.local.json`.
3. **Public GitHub repo** (`margin-flashcards`) with a detectable **open-source license**. Apache-2.0 is already present and preferred; keep it visible.
4. **Demo video materials** are ready and honest: a script of **3 minutes or less**, in English, showing the extension working in Chrome, with the **first 30 seconds** covering who it is for, the problem, and how Firebase AI Logic hybrid inference makes it work. The loop does not record, upload, or post the YouTube video.
5. **Text description / Devpost story** covers how Firebase AI Logic is used, the features, and the value proposition, and stays in sync with the code.
6. **Testing instructions** let a judge load the unpacked extension or zip and exercise the demo flow. The project must be installable and must function as the story and script describe.
7. **No production API keys**, live Google Cloud secrets, confidential commercial data, or PII in the repository, submission form drafts, or testing instructions.
8. The app supports **English**. All submission materials are in English.
9. **Mock / demo mode is clearly labeled.** Real Firebase and Gemini Nano cannot be exercised in this environment. Never claim a live on-device or cloud inference ran here. Feature claims must match the code.

Encouraged (not Stage One-required, but they help Technological Implementation): Firebase Remote Config, Firestore, and Authentication, used for real product behavior, not as checkbox imports.

### Stage Two — raise these scores

**Technological Implementation.** Robust, well-tested hybrid routing: sensitivity / privacy gates, on-device vs cloud vs queue-when-offline, `PREFER_ON_DEVICE` fallback, chunking, honest route badges, App Check, Remote Config. Tests (unit + Playwright e2e of the **loaded extension**) cover routing, providers, capture, review, export, and backup/restore. Typecheck is clean. No regressions.

**Design.** A complete, coherent product — not a proof of concept. Polished side panel, review, library, options, onboarding, route badges, empty states, error states, accessibility (keyboard, names, contrast), performance, and up-to-date screenshots that match the UI.

**Potential Impact.** A credible, specific case for readers and learners who want to remember what they read, keep private material on-device, and take decks to Anki. The demo flow should make that case without hype.

**Quality of the Idea.** A creative, non-obvious use of hybrid inference: privacy-sensitive routing, source-linked cards, on-device grading, and a reading-to-recall loop — not a generic wrapper around a model.

### Engineering and packaging (required before calling the work done)

- `npm test` (unit), `npx tsc --noEmit`, and `npm run test:e2e` (build + Playwright against the loaded extension) all pass.
- Packaged zip is refreshed via `npm run package` (the zip itself is gitignored; keep build scripts and instructions current).
- Screenshots in `submission/screenshots/` are refreshed when the UI changes.
- README architecture diagram, demo-video script, and Devpost story stay truthful and in sync with the code.
- Secret scan is clean on every commit the driver pushes.

## Hard rules

- Local only, except `git push` of `main` and tags to https://github.com/MadanChaollaPark/margin-flashcards.
- No sign-ins, sign-ups, posting, Devpost submission, YouTube upload, emails, or messages to anyone.
- No secrets committed. No databases, downloads, `node_modules`, `dist`, zips, or saved research HTML in git.
- Never force-push. Never push `master` or any commit that is not descended from the clean public root.
- Agents must never run `git commit` or `git push` (the driver does). Agents must never send, post, or log in anywhere.
- Never invent features or test results. If a command was not run, do not claim it passed.
- Do not wipe `STATE/`. The driver resumes from it.

## Loop roles and consensus (owner decision — do not revert)

Planner/orchestrator is Kiro `claude-opus-5.5` at high reasoning (not max); builder is Codex `gpt-6.2-sol` at high effort in standard/slow mode (`features.fast_mode=false`); reviewers are both Opus 5.5 (high) and Sol 6.2 (high, slow), with up to 3 consensus attempts then Opus-wins tiebreak. Owner decision — do not revert.

Each reviewer grades against this Definition of Done and outputs `VERDICT: PASS|PARTIAL|FAIL`, a must-fix list, and numeric scores out of 5 for the four Stage Two criteria. Any failing test or regression is FAIL. Same verdict becomes the round verdict; must-fix lists are merged into `STATE/REVIEW.md`. Different verdicts trigger a re-review of each other's write-up, up to 3 attempts total. Still no agreement: Opus wins, and the driver logs `TIEBREAK: Opus wins`.

Early stop: if two consecutive rounds receive `PASS` from **both** reviewers, each reviewer averages **≥4.5/5** on the four judging criteria, and there are **no must-fix items**, the driver enters package mode (docs, screenshots, zip; no new features) and then finishes.

Files used by the loop: `STATE/PLAN.md` (orchestrator), `STATE/BUILD_REPORT.md` (builder), `STATE/REVIEW.md` (merged by the driver), `STATE/CHECKLIST.md` (orchestrator), `LOOP_LOG.md` (driver-owned; do not edit). The driver runs unit, typecheck, and Playwright e2e tests after every build.
