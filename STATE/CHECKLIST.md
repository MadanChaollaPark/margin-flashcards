# CHECKLIST

Statuses: TODO / IN-PROGRESS / VERIFIED. Updated by the orchestrator, round 3 (2026-11-23 ~09:30 KST).

Baseline run by the orchestrator this round on HEAD 2be3a56 (outside the builder sandbox; Chromium works here):
- `npx tsc --noEmit` → exit 0. `npm test` → exit 0, `tests 109 / pass 109 / fail 0`. `npm run test:e2e` → **exit 0, `10 passed (26.5s)`**. No failing test at baseline this round.
- Cover: orchestrator rendered `npm run screenshots` in a throwaway copy (`/tmp`, deleted) with the round-3 tagline **"Sensitive-looking text stays on-device unless you approve cloud."** in `scripts/screenshots.mjs:180`, inspected `cover.png` visually (text fits, no overlap, Demo labels visible on embedded views), and copied **only** `cover.png` into `submission/screenshots/` (sha256 `4f7b7ccd…c9dfc`). The other 11 PNGs were byte-identical except `09-library.png` (not copied; UI unchanged). The builder must make the renderer line match (PLAN item 1) or the cover goes stale again.
- Builder sandbox cannot bind loopback / launch Chromium (`listen EPERM`). This round the builder does **not** run `npm run test:e2e`; the driver's run is the e2e result (PLAN ground rules).

## Stage One (pass/fail)

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| S1.1 | Firebase AI Logic hybrid SDK imported and called at runtime | VERIFIED (code) | `src/ai/firebaseProvider.ts`: `getAI(…useLimitedUseAppCheckTokens)`, `getGenerativeModel` with `InferenceMode`, `generateContent`, `inferenceSource`, `initializeDeviceModel`. `router.ts` reaches `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `ONLY_IN_CLOUD`, `PREFER_IN_CLOUD`. Live call not exercisable here. |
| S1.2 | App Check; no debug tokens/secrets committed | VERIFIED (code + docs) | `src/firebase/init.ts` `initializeAppCheck`; debug-token-only limitation stated in README:97 and testing instructions. No token in tree. |
| S1.3 | Public repo, detectable Apache-2.0 | IN-PROGRESS (owner) | `LICENSE` Apache-2.0; driver pushed `v02-iter02`. Anonymous visibility + GitHub license badge must be checked by the owner (agents are local-only). |
| S1.4 | Demo script ≤3 min, English, Chrome, first 30 s who/problem/hybrid | IN-PROGRESS | 2:50, first 30 s OK. Gaps: Demo-mode narration only for shot 2 (shots 3, 4, 6, 8 still narrate live behavior); shot 4 credits "Nano" with chunking (Margin's router does it) and packs two offline cycles into 20 s; tagline in shot 9. PLAN item 2. |
| S1.5 | Devpost story truthful and in sync | IN-PROGRESS | Tagline absolute; must reflect heuristic pattern check, per-capture approval, Privacy mode forcing on-device, Remote Config `sensitivityCheck` switch. PLAN item 1. |
| S1.6 | Testing instructions; installable; works as described | VERIFIED (Demo quick look, driver e2e) / owner gap | Quick-look e2e clicks popup **Open side panel** and waits for popup close. Native side-panel walkthrough in real Chrome: owner. Script's "reconnect with Only cloud still selected" path: unit test added in PLAN item 3. |
| S1.7 | No production keys / secrets / PII | VERIFIED (working tree, round 2) | `git grep` key patterns clean; UUID grep clean; `.invalid` email. Re-run PLAN item 5. Driver scans staged commit. |
| S1.8 | English | VERIFIED | e2e asserts `lang="en"` on five pages; docs English. |
| S1.9 | Mock/demo mode clearly labeled | VERIFIED (UI) / IN-PROGRESS (script) | Banner + `Simulated` badges asserted in e2e and visible in screenshots and cover. Script narration gap → PLAN item 2. |

## Stage Two (round 2 scores: Opus 3.5/3.5/4.0/4.5 = 3.88; Sol 4.0/4.0/4.0/4.5 = 4.12)

| Criterion | Status | Evidence / gap |
|---|---|---|
| Technological Implementation | IN-PROGRESS | 109 unit + 10 e2e pass. Confirmed defect: queued jobs don't record Demo vs Live (only a `Simulated — ` reason prefix, `runtime.ts`); auto drain (`sidepanel.ts:505`) and manual retry (`options.ts` retry handler) rebuild the runtime from current settings, so a Demo-queued capture can go to live cloud and vice versa. PLAN item 3. |
| Design | IN-PROGRESS | A11y sweep passes (contrast min 5.71 light / 6.80 dark). Cover regenerated this round (above). Options-page left-column gap under "AI routing" (08-export.png) remains; deferred (builder can't render). |
| Potential Impact | IN-PROGRESS | Case is specific; privacy wording must be qualified (PLAN item 1). |
| Quality of the Idea | VERIFIED (docs/code) | Sensitivity gate, per-request InferenceMode, on-device grading, text-fragment source anchors. |

## Engineering and packaging

| Item | Status | Evidence / gap |
|---|---|---|
| `npm test` | VERIFIED | 109/109, orchestrator baseline round 3 |
| `npx tsc --noEmit` | VERIFIED | exit 0, orchestrator baseline round 3 |
| `npm run test:e2e` | VERIFIED (baseline) | exit 0, 10 passed, orchestrator round 3; driver re-runs after build |
| Zip via `npm run package` | IN-PROGRESS | Round 2: 229 files, root manifest, no maps/env. Rebuild after this round's code change (PLAN item 5). |
| Screenshots current | VERIFIED (09:30 KST) | Cover regenerated with round-3 tagline; others unchanged from 07:33 KST. Stale if the builder changes visible UI in screenshot scenes (PLAN forbids) or uses a different tagline string. |
| README diagram/script/story in sync | IN-PROGRESS | PLAN items 1–2 |
| Secret scan | VERIFIED (working tree) | Re-run PLAN item 5 |

## Process (owner / driver; agents cannot change)
- Round 2 must-fix: "driver's e2e run decides the round". This round the builder will not run e2e, and the orchestrator baseline exit code is recorded above (0).
- Owner: confirm repo public + GitHub license detection; walk the packaged extension's native side panel in Chrome; record live video.

## Deferred
- Live Firebase / Gemini Nano verification (owner records live video).
- Production App Check attestation provider (documented limitation).
- Options-page column gap (needs rendering; orchestrator can screenshot-check a CSS fix in a later round).
- Second platform (out of scope).
