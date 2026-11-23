# CHECKLIST

Statuses: TODO / IN-PROGRESS / VERIFIED. Updated by the orchestrator, round 4 (2026-11-23 ~14:40 KST).

Baseline run by the orchestrator this round on HEAD 260842c (outside the builder sandbox; Chromium works here):
- `npx tsc --noEmit` → exit 0. `npm test` → exit 0, `tests 116 / pass 116 / fail 0`. `npm run test:e2e` → exit 0, `10 passed (25.6s)`. No failing test at baseline.
- Cover: the orchestrator rendered `npm run screenshots` in a throwaway copy (deleted) with the round-4 tagline **"Privacy mode keeps every capture on-device."** at `scripts/screenshots.mjs:180`, checked it visually (text fits, DEMO MODE + Simulated labels visible), and copied **only** `cover.png` into `submission/screenshots/` (sha256 `1e139c12…bea450`). The other PNGs were byte-identical except `09-library.png` (not copied, UI unchanged). The builder must make the renderer line and all docs match (PLAN item 3).
- Builder sandbox cannot bind loopback / launch Chromium (`listen EPERM`). The builder does not run `npm run test:e2e` or `npm run screenshots`; the driver's e2e run is the e2e result.

## Round 3 must-fix (from STATE/REVIEW.md)

| Must-fix | Status | Plan |
|---|---|---|
| Options manual retry reads settings before the `margin-offline-queue` lock (Privacy/Demo toggle during wait ignored) — REGRESSION | TODO | PLAN item 1 |
| Side-panel `startQueueDrain` also calls `prepare()` before the lock (guarded only by `rerun`) | TODO | PLAN item 1 (same fix) |
| `prepare()` throwing in `startQueueDrain` schedules no retry (contradicts README:65) | TODO | PLAN item 2 |
| Regression tests: Privacy on, Only on-device, Demo toggle while a retry waits; disallowed inference never starts; setup-failure recovery | TODO | PLAN items 1–2 |
| Qualify tagline/consent claims (tie consent to enabled sensitivity check; pattern-only case) across README, story, script, checklist, cover | IN-PROGRESS | Cover pre-rendered; text edits PLAN item 3 |
| Rebuild ZIP, rerun suites, README/story sync | TODO | PLAN item 4 |
| Owner: anonymous repo access, GitHub license detection, native side-panel walkthrough, live shots | TODO (owner) | Agents are local-only |

## Stage One (pass/fail)

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| S1.1 | Firebase AI Logic hybrid SDK imported and called at runtime | VERIFIED (code) | `src/ai/firebaseProvider.ts`: `getAI(…useLimitedUseAppCheckTokens)`, `getGenerativeModel` with `InferenceMode`, `generateContent`, `inferenceSource`, `initializeDeviceModel`. Router reaches `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `ONLY_IN_CLOUD`, `PREFER_IN_CLOUD`. Live call not exercisable here. |
| S1.2 | App Check; no debug tokens/secrets committed | VERIFIED (code + docs) | `src/firebase/init.ts` `initializeAppCheck`; debug-token limitation documented. No token in tree. |
| S1.3 | Public repo, detectable Apache-2.0 | IN-PROGRESS (owner) | `LICENSE` Apache-2.0 at root and in ZIP; driver pushed `v03-iter03`. Anonymous visibility + GitHub license badge: owner. |
| S1.4 | Demo script ≤3 min, English, Chrome, first 30 s who/problem/hybrid | IN-PROGRESS | 2:50, shots 1–2 end 0:30, Demo voice-over table covers 2/3/4/5/6/8. Gap: shot 9 tagline must change to the new one (PLAN item 3). |
| S1.5 | Devpost story truthful and in sync | IN-PROGRESS | Tagline consent claim depends on Remote Config `sensitivityCheck`; Privacy-mode guarantee broken by retry race. PLAN items 1, 3. |
| S1.6 | Testing instructions; installable; works as described | VERIFIED (Demo quick look, e2e) / owner gap | e2e covers popup open call, sample, save, review. Native side panel in real Chrome: owner. |
| S1.7 | No production keys / secrets / PII | VERIFIED (working tree, round 3) | Key/UUID greps clean; `.invalid` email. Re-run PLAN item 4. Driver scans staged commit. |
| S1.8 | English | VERIFIED | e2e asserts `lang="en"` on five pages; docs English. |
| S1.9 | Mock/demo mode clearly labeled | VERIFIED | Banner + Simulated badges asserted in e2e; visible on new cover. |

## Stage Two (round 3 scores: both reviewers 3.5 / 4.0 / 4.0 / 4.5 = 4.00)

| Criterion | Status | Evidence / gap |
|---|---|---|
| Technological Implementation | IN-PROGRESS | 116 unit + 10 e2e pass. Retry race (privacy gate) and setup-error backoff gap → PLAN items 1–2. |
| Design | IN-PROGRESS | A11y sweep passes (contrast min 5.71 light / 6.80 dark). Options-page gap: "Manage decks" is a third grid child of `.settings-grid` (`src/ui/options.html:116`), so it wraps below the taller right column, leaving a blank area under "AI routing" (visible in `08-export.png`). Optional PLAN item 5, only if the builder can render screenshots. |
| Potential Impact | IN-PROGRESS | Case is specific; privacy wording must be qualified (PLAN item 3). |
| Quality of the Idea | VERIFIED (docs/code) | Sensitivity gate, per-request InferenceMode, on-device grading, text-fragment source anchors. |

## Engineering and packaging

| Item | Status | Evidence / gap |
|---|---|---|
| `npm test` | VERIFIED (baseline) | 116/116, orchestrator round 4 |
| `npx tsc --noEmit` | VERIFIED (baseline) | exit 0, orchestrator round 4 |
| `npm run test:e2e` | VERIFIED (baseline) | exit 0, 10 passed, orchestrator round 4; driver re-runs after build |
| Zip via `npm run package` | IN-PROGRESS | Round 3 ZIP matched `dist` (229 files). Rebuild after code change (PLAN item 4). |
| Screenshots current | VERIFIED (14:40 KST) | New cover; others unchanged. Stale if visible UI in screenshot scenes changes without a re-render. |
| README diagram/script/story in sync | IN-PROGRESS | PLAN items 2–3 |
| Secret scan | VERIFIED (working tree) | Re-run PLAN item 4 |

## Deferred
- Live Firebase / Gemini Nano verification (owner records live video).
- Production App Check attestation provider (documented limitation).
- Second platform (out of scope).
