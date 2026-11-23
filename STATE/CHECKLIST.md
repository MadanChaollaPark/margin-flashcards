# CHECKLIST

Statuses: TODO / IN-PROGRESS / VERIFIED. Updated by the orchestrator, round 2 (2026-11-23 ~07:35 KST).

Baseline run by the orchestrator this round on HEAD 8e85524 (outside the builder sandbox, Chromium works here):
- `npx tsc --noEmit` exit 0. `npm test` 109/109 pass. `npm run test:e2e` **8 passed, 2 failed** (accessibility sweep `:254`, long notes `:464`), both strict-mode locator violations.
- Diagnosis in a throwaway copy (`/tmp`, deleted): scoping the three locators (see PLAN item 1) made both tests pass: `2 passed (17.4s)`. Browser-measured contrast minima: light min 5.71:1 (muted), dark min 6.80:1 (muted); all ten categories ≥ 4.5:1 in both themes.
- Probe in the same copy: clicking **Open side panel** in `popup.html` (unmodified `side_panel`/`action` manifest keys) made the popup close, i.e. `chrome.sidePanel.open` resolved. Not yet in the committed test (PLAN item 2).
- `npm run screenshots` ran fine here and produced 12 PNGs. Orchestrator copied them into `submission/screenshots/` (07:33 KST) and visually inspected cover, hero, 01, 08, 09. 02–07 and 10 were byte-identical to the old files (UI unchanged). Builder sandbox cannot launch Chromium (`listen EPERM`, Crashpad `setsockopt` denied).

## Stage One (pass/fail)

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| S1.1 | Firebase AI Logic hybrid SDK imported and called at runtime | VERIFIED (code) | `src/ai/firebaseProvider.ts`: `getAI(..., useLimitedUseAppCheckTokens: true)`, `getGenerativeModel` with `InferenceMode`, `generateContent`, `response.inferenceSource`, `initializeDeviceModel`. Router covers all four modes (unit test). Post-build call-site check. Live call not exercisable here. |
| S1.2 | App Check integrated; no debug tokens/secrets committed | VERIFIED (code) / doc gap | `src/firebase/init.ts` `initializeAppCheck` + `CustomProvider`; production `getToken` throws, so only the debug-token path works. Gap: testing instructions/README must say live mode needs a registered debug token (PLAN item 3). Research example token replaced with `<DEBUG_TOKEN>` in round 1. |
| S1.3 | Public repo with detectable Apache-2.0 license | VERIFIED (local) | `LICENSE` Apache-2.0; driver pushed `main` + `v01-iter01` to MadanChaollaPark/margin-flashcards (LOOP_LOG 07:29:36). Public visibility/GitHub detection not checked from here (owner). |
| S1.4 | Demo script ≤3 min, English, Chrome, first 30 s = who/problem/hybrid | IN-PROGRESS | 2:50 total, 61 opening words, hybrid explained by 0:30. Gaps (Sol): shot 4 offline scanned-PDF capture is not reproducible (PDF bytes are fetched before routing); shot 9 tagline "private by default" overstates (Privacy mode defaults off); no alternate narration for simulated footage. PLAN item 3. |
| S1.5 | Devpost story truthful and in sync | IN-PROGRESS | Gaps (Sol): tagline "Private by default"; Firestore line "never source text" omits that saved card fronts/backs (which quote the passage) are uploaded, even for on-device cards. PLAN item 3. |
| S1.6 | Testing instructions; installable; works as described | IN-PROGRESS | Source build + optional release ZIP documented. Quick-look e2e passes but opens `sidepanel.html` directly; popup→side panel click not asserted (PLAN item 2). App Check debug-token-only note missing (PLAN item 3). |
| S1.7 | No production keys / secrets / PII | VERIFIED (working tree) | Round-1 `git grep` for `AIza…`/private keys clean; UUID grep clean; top-level `logs/` removed and ignored; fictional `learner@example.invalid`. Re-run in PLAN item 5. |
| S1.8 | English app and materials | VERIFIED | `lang="en"` on all pages (asserted in a11y sweep once it passes); docs English. |
| S1.9 | Mock/demo mode clearly labeled | VERIFIED | `DEMO MODE (simulated AI)` banner and `Simulated · …` badges asserted in passing e2e tests and visible in all refreshed screenshots. |

## Stage Two (scores round 1: Opus 3.5/3.5/4.0/4.0 = 3.75; Sol 3.5/3.5/4.0/4.5 = 3.88)

| Criterion | Status | Evidence / gap |
|---|---|---|
| Technological Implementation | IN-PROGRESS | 109 unit tests; e2e covers sensitive→on-device, privacy-mode PDF, offline queue drain, capture/edit/review/export, backup-restore skip, quick look, YouTube captions. Gap: long-notes chunking e2e failing on locator (fix known). Nano-unavailable fallback covered only by unit tests (no product switch; acceptable). |
| Design | IN-PROGRESS | Screenshots refreshed 07:33 KST. A11y sweep (names, Tab focus, contrast light/dark) failing on locator; fix known and verified in a copy. Minor: Options page leaves a blank gap under "AI routing" in the left column (08-export.png); not planned this round because the builder cannot render UI. |
| Potential Impact | IN-PROGRESS | Learner + privacy + Anki case is present; privacy wording must match defaults (PLAN item 3). |
| Quality of the Idea | VERIFIED (docs/code) | Sensitivity gate, per-request InferenceMode, route reasons, on-device grading, text-fragment source anchors. |

## Engineering and packaging

| Item | Status | Evidence / gap |
|---|---|---|
| `npm test` passes | VERIFIED | 109/109 (orchestrator, round 2 baseline) |
| `npx tsc --noEmit` clean | VERIFIED | exit 0 (orchestrator, round 2 baseline) |
| `npm run test:e2e` passes | TODO | 8/10 at baseline; PLAN item 1 |
| Zip refreshed via `npm run package` | IN-PROGRESS | Round 1: 229 files, root `manifest.json`, no maps/env. Re-run after this round's edits (PLAN item 5). |
| Screenshots current | VERIFIED (07:33 KST) / will go stale | Regenerated by orchestrator from current UI. If PLAN item 3 changes the cover tagline in `scripts/screenshots.mjs`, `cover.png` is stale until the next orchestrator pass regenerates it. |
| README diagram/script/story in sync | IN-PROGRESS | PLAN item 3 |
| Secret scan clean | VERIFIED (working tree) | Re-run in PLAN item 5; driver scans staged commit. |

## Deferred
- Live Firebase / Gemini Nano verification (impossible here; owner records the live video).
- Production App Check attestation provider (documented limitation; debug provider for judging).
- Second platform (out of scope per GOAL).
- Options-page column gap polish (needs a rendering environment; revisit when the orchestrator can screenshot).
