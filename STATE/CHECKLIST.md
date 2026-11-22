# CHECKLIST

Statuses: TODO / IN-PROGRESS / VERIFIED. Updated by the orchestrator, round 1 (2026-11-22 KST).
Baseline run by the orchestrator this round on commit 7cfe86a + working tree: `npm test` 108/108 pass, `npx tsc --noEmit` clean, `npm run test:e2e` 6/6 pass (8.5 s).

## Stage One (pass/fail)

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| S1.1 | Firebase AI Logic hybrid SDK imported and called at runtime | VERIFIED (code) | `src/ai/firebaseProvider.ts`: `getAI`, `getGenerativeModel` with `InferenceMode.{PREFER_ON_DEVICE,ONLY_ON_DEVICE,ONLY_IN_CLOUD,...}`, `generateContent`, reads `response.inferenceSource`; build has a post-build call-site check. Live call not exercisable here (demo mode). |
| S1.2 | App Check integrated; no debug tokens/secrets committed | VERIFIED (code) / gap | `src/firebase/init.ts` `initializeAppCheck` + debug token. `.gitignore` covers `.env*`, `firebase.config.local.json`, keys. Gap: tracked `research/hybrid.txt:525` contains the Firebase docs' example debug token `123a4567-…` (not real, but looks like one to scanners). Plan item 5. |
| S1.3 | Public repo with detectable Apache-2.0 license | VERIFIED (local) | `LICENSE` Apache-2.0 at root; `package.json` license field; remote `origin` = MadanChaollaPark/margin-flashcards. GitHub detection not checked from here. |
| S1.4 | Demo-video script ≤3 min, English, Chrome, first 30 s = who/problem/hybrid | IN-PROGRESS | `submission/demo-video-script.md` targets 2:50. Gap: the Firebase AI Logic hybrid explanation lands at ~0:25–0:32, so it straddles the 30 s mark; tighten so it is complete by 0:30. Plan item 4. |
| S1.5 | Devpost story truthful and in sync with code | IN-PROGRESS | `submission/devpost-story.md` broadly matches code. Must be re-checked after this round's changes (claim "tests check that each of the four inference modes is reachable" to be confirmed against `test/unit/router.test.ts`). |
| S1.6 | Testing instructions accurate; install from zip / Load unpacked works | IN-PROGRESS | `submission/testing-instructions.md` step 1 says "Download margin-extension.zip from the repo's latest GitHub Release"; no release is created by this loop, so judges may find none. The quick-look flow (popup → Open side panel → Try a sample → Generate → Review) has no e2e test that follows it literally. Plan items 1 and 4. |
| S1.7 | No production keys / secrets / PII | IN-PROGRESS | Working-tree `git grep` for `AIza…`/private keys: clean. Tracked `logs/` (5 MB raw agent logs with `/home/...` paths) and `research/hybrid.txt` example token are hygiene gaps. `submission/submission-checklist.md` is stale ("no remote added", "push the clean public branch"). Plan items 4 and 5. |
| S1.8 | English app and materials | VERIFIED | All `src/ui/*.html` have `lang="en"`; all docs are English. |
| S1.9 | Mock/demo mode clearly labeled; no live-run claims | VERIFIED (code) | `DEMO MODE (simulated AI)` banner on all 5 pages; README "Demo mode" section; script says label any demo shot as simulated. Re-confirm via the new onboarding e2e (plan item 1). |

## Stage Two (score 1–5)

| Criterion | Status | Evidence / gap |
|---|---|---|
| Technological Implementation | IN-PROGRESS | Router + provider unit tests (108 unit), e2e covers sensitive→on-device, privacy-mode PDF, offline queue drain, capture/edit/review/export, backup restore skip. Gaps: no e2e for YouTube captions capture, long-text chunking badge, or Nano-unavailable fallback reason. Plan item 3. |
| Design | IN-PROGRESS | Side panel, review, library, options, popup, welcome card exist; screenshots dated 2026-11-20, before commit 7cfe86a touched `review.html`/`review.ts`/`options.ts`. Gaps: no automated accessibility check (accessible names, contrast light/dark); screenshots may be stale. Plan items 2 and 6. |
| Potential Impact | IN-PROGRESS | Story/README make the learner + privacy + Anki case. Keep claims grounded; no change planned beyond doc truth fixes. |
| Quality of the Idea | VERIFIED (docs/code) | Sensitivity gate, per-request InferenceMode, route reasons, on-device grading, text-fragment source anchors are in code and docs. |

## Engineering and packaging

| Item | Status | Evidence / gap |
|---|---|---|
| `npm test` passes | VERIFIED | 108/108, orchestrator run round 1 |
| `npx tsc --noEmit` clean | VERIFIED | no output, orchestrator run round 1 |
| `npm run test:e2e` passes | VERIFIED | 6/6, orchestrator run round 1 |
| Zip refreshed via `npm run package` | TODO | `margin-extension.zip` dated 2026-11-20 13:57, older than current source. Plan item 6. |
| Screenshots current | TODO | Plan item 6. |
| README diagram/script/story in sync | IN-PROGRESS | Re-check after plan items 1–5. |
| Secret scan clean | VERIFIED (working tree) | Driver `SECRET_RE` patterns; orchestrator `git grep` clean apart from the docs example token noted in S1.2. |
