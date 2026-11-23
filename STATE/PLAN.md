# PLAN — Round 3 (builder work package, ~45–70 min)

Planner/orchestrator is Kiro `claude-opus-5.5` at high reasoning (not max); builder is Codex `gpt-6.2-sol` at high effort in standard/slow mode (`features.fast_mode=false`); reviewers are both Opus 5.5 (high) and Sol 6.2 (high, slow), with up to 3 consensus attempts then Opus-wins tiebreak. Owner decision — do not revert.

## Ground rules (from GOAL.md)
- Work only in `/workspace/flashcard-ext`. Never run `git commit`, `git push`, or tag. Do not edit `LOOP_LOG.md`, `driver.py`, `GOAL.md`, `STATE/REVIEW.md`, or wipe `STATE/`. Do not create `STATE/ALL_DONE`.
- No sign-ins, posting, uploads, network submissions, or new npm dependencies.
- Never invent results. `STATE/BUILD_REPORT.md` lists each command actually run with real output; anything not run is "not run".
- Demo mode stays labeled "DEMO MODE (simulated AI)" / "Simulated". No doc may claim live Gemini Nano or cloud inference ran here.

## Sandbox / e2e rule for this round (read first)
Your sandbox cannot bind loopback or launch Chromium (`listen EPERM`). **Do not run `npm run test:e2e` or `npm run screenshots` this round.** Record them in BUILD_REPORT as "not run — sandbox; driver runs e2e". (Last round a single EPERM run was counted as a failed test and forced FAIL.) Because you can't render:
- Do not change HTML/CSS/layout, and do not change any visible text in screenshot scenes (side panel preview, review, popup, welcome, library, Options cards). The only allowed visible UI addition is the mode-mismatch message in item 3, which appears only for mismatched queue entries (no screenshot shows one).
- Do not change e2e specs except if a unit-level change breaks a selector (it should not).

## Baseline (orchestrator, round 3, HEAD 2be3a56)
`npx tsc --noEmit` exit 0 · `npm test` exit 0, 109/109 · `npm run test:e2e` exit 0, `10 passed (26.5s)`. The orchestrator already regenerated `submission/screenshots/cover.png` with the new tagline below (sha256 `4f7b7ccd…c9dfc`) — do not delete or regenerate it.

## Work items, in order

### 1. Qualified privacy tagline everywhere (DoD S1.5, S1.4, Stage Two Impact) — MUST
Exact new tagline (byte-for-byte; the cover bitmap already shows it): **`Learn what you read. Sensitive-looking text stays on-device unless you approve cloud.`**
Open steps:
- Replace `Sensitive text stays on-device. Cloud when it counts.` with `Sensitive-looking text stays on-device unless you approve cloud.` in: `README.md:3`, `submission/devpost-story.md:3`, `submission/submission-checklist.md:10`, `submission/demo-video-script.md` shot 9, and `scripts/screenshots.mjs:180` (must become exactly `<p><strong>Learn what you read.</strong> Sensitive-looking text stays on-device unless you approve cloud.</p>`).
- In `submission/devpost-story.md` (privacy section near lines 28–36) and `README.md` privacy section (~line 152), add one plain sentence each stating: the sensitivity check is a local pattern heuristic (plus a Gemini Nano screen when Nano is available); a pattern-only match with Nano unavailable asks for per-capture cloud approval; Privacy mode and Only on-device always keep captures local; the Firebase project owner can turn the check off with the Remote Config `sensitivityCheck` parameter. Verify each clause against `src/ai/router.ts` (`isSensitive`, the `confirm` branch, `localOnly`) and `src/firebase/remoteConfig.ts` before writing. Do not add new claims.
Acceptance:
```
grep -rn "Cloud when it counts" README.md submission scripts src            # no output
grep -rlF "Sensitive-looking text stays on-device unless you approve cloud." README.md submission scripts | sort
# expect: README.md, scripts/screenshots.mjs, submission/demo-video-script.md, submission/devpost-story.md, submission/submission-checklist.md
grep -n "sensitivityCheck" src/firebase/remoteConfig.ts && grep -n -i "sensitivityCheck\|Remote Config" submission/devpost-story.md
node --check scripts/screenshots.mjs
```
Evidence: old → new for each line, with the supporting code line.

### 2. Demo-mode narration and a feasible shot 4 (DoD S1.4, S1.9) — MUST
File: `submission/demo-video-script.md`.
Open steps:
- **Shot 4 (0:52–1:12):** keep only one offline cycle: Options → **Inference mode** → **Only cloud**, go offline, paste short nonsensitive notes, **Generate** → **Queued** badge, reconnect with the side panel open → queue clears, cards appear in the deck. Remove the offline long-notes chunking sub-step from the shot (chunking stays described in README/story). Narration must credit Margin, e.g. "With Only cloud selected and no connection, Margin queues the capture. When I reconnect, it generates the cards and saves them to my deck." Keep the 20 s slot and 2:50 total.
- **Rename the "If you record Demo mode instead" block to a table or list giving a Demo-mode line for every shot whose live narration describes inference: shots 2, 3, 4, 5, 6, 8.** Each Demo line must say the result is simulated or describe what the live build does ("In the live build, Gemini Nano grades this answer on-device; here the grade is simulated."). Shot 4's Demo line must match the actual Demo label (queued reason starts with `Simulated — `).
- Every UI label in bold must exist in `src/`.
Acceptance:
```
grep -n -i "nano splits" submission/demo-video-script.md                    # no output
for s in "Make flashcards from selection" "Kept local" "Privacy mode" "Inference mode" "Only cloud" "Queued" "Generate" "Graded on-device" "Export .apkg" "Run live hybrid test" "Diagnostics" "Auto router"; do grep -rqF "$s" src || echo "MISSING: $s"; done   # no MISSING
python3 - <<'PY'
import re
s=open("submission/demo-video-script.md").read()
rows=re.findall(r"^\| *\d+ *\| *(\d+):(\d+)[–-](\d+):(\d+)", s, re.M)
t=[(int(a)*60+int(b), int(c)*60+int(d)) for a,b,c,d in rows]
assert all(t[i][1]==t[i+1][0] for i in range(len(t)-1)), t
assert t[-1][1] <= 180 and t[1][1] == 30, t
demo=s[s.find("Demo mode instead"):] if "Demo mode instead" in s else s
for n in ("2","3","4","5","6","8"): assert re.search(rf"(Shot|\|) *{n}\b", demo), f"no demo line for shot {n}"
print("script ok", t[-1][1], "s")
PY
```
Evidence: the new shot 4 row and the Demo-mode lines in BUILD_REPORT.

### 3. Queue entries remember Demo vs Live (Stage Two Tech; DoD S1.9 honesty) — MUST
Defect: `enqueue` stores no mode; `runtime.ts` only prefixes the reason with `Simulated — `. Auto drain (`src/ui/sidepanel.ts` `startQueueDrain` callback ~line 505) and manual retry (`src/ui/options.ts` retry handler) rebuild the runtime from current settings, so a Demo-queued capture can be sent to live cloud and a live capture can be completed with simulated cards.
Open steps:
- `src/ai/queue.ts`: add `mode?: "demo" | "live"` to `QueuedJob`; `enqueue(job, reason, database, mode)` stores it. Export `queuedMode(entry)` returning `entry.mode ?? (entry.reason.startsWith("Simulated — ") ? "demo" : "live")` for legacy entries.
- `src/ai/runtime.ts` `generateCards`: pass `provider instanceof MockProvider ? "demo" : "live"` to `enqueue`. Keep the existing reason text unchanged (screenshots show it).
- `drainQueue`: accept an optional current mode (e.g. `{ mode?: "demo" | "live" }` options object or a new trailing param — keep existing call sites/tests compiling). Entries whose `queuedMode` differs from the current mode are **skipped without changing attempts, state, or nextAttemptAt**. When `onlyId` targets a mismatched entry, set `lastError` to `Queued in Demo mode. Turn Demo mode on to retry, or remove it.` (or the Live equivalent `Queued in live mode. Turn Demo mode off to retry, or remove it.`) and leave state/attempts unchanged.
- Callers: side panel auto drain and Options retry compute current mode from `createRuntime().mock` **before** draining and pass it. Options retry then shows the existing `remaining.lastError` notice (no new markup). `startQueueDrain`'s next-timer computation must ignore mismatched entries so it doesn't spin.
- Unit tests in `test/unit/ai.test.ts` (use the existing in-memory database pattern at lines 163–220):
  a. Demo-queued entry + live current mode: auto drain calls `process` 0 times; entry unchanged.
  b. Live-queued entry + demo current mode: same.
  c. Manual (`onlyId`) mismatch sets the exact `lastError` and keeps `attempts`.
  d. Matching mode drains and saves cards (existing behavior).
  e. Legacy entry without `mode` whose reason starts with `Simulated — ` is treated as demo.
  f. Script path: a job queued offline with `modeOverride: "only-cloud"` (MockProvider) drains online with `only-cloud` still set and saves cards with a cloud route (covers shot 4's "reconnect with Only cloud still selected").
Acceptance:
```
npx tsc --noEmit                                  # exit 0
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"    # tests ≥ 115, fail 0
grep -n "queuedMode" src/ai/queue.ts src/ui/sidepanel.ts src/ui/options.ts
```
Evidence: diff summary, new test names, real counts.

### 4. Submission checklist / README sync — SHOULD
- `submission/submission-checklist.md`: tagline row (new string), note `cover.png` regenerated 2026-11-23 with the new tagline, owner-only tasks stay owner tasks (public repo + license display, native side-panel check in Chrome, YouTube, Devpost).
- README: if it describes the offline queue, add one clause: queued captures remember whether they were made in Demo or live mode and only retry in that mode. Same one clause in `devpost-story.md` where the queue is described. Nothing else.

### 5. Final verification (required)
Run in order; paste real summary lines into `STATE/BUILD_REPORT.md`:
```
npx tsc --noEmit
npm test
npm run package                                   # record file count
unzip -l margin-extension.zip | grep -E " manifest.json$"
unzip -l margin-extension.zip | grep -E "\.map$|\.env|config.local"     # no output
git grep -nE "AIza[0-9A-Za-z_-]{30,}|BEGIN [A-Z ]*PRIVATE KEY" -- . ':!package-lock.json'   # no output
grep -rnE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" research src submission README.md scripts   # no output
sha256sum submission/screenshots/cover.png        # must still start 4f7b7ccd
git diff --stat -- . ':!LOOP_LOG.md'
```
`npm run test:e2e` and `npm run screenshots`: **not run** (sandbox); the driver runs e2e. Remove any temp files you created.

## BUILD_REPORT.md must contain
For items 1–5: done / partial / skipped, files changed, real command output, evidence, remaining gaps. State that e2e was not run by the builder and why.

## Deferred (kept in STATE/CHECKLIST.md)
- Options-page left-column gap under "AI routing" (needs rendering; orchestrator can verify a CSS fix later).
- Owner: public repo + GitHub license detection, native side panel in Chrome, live Firebase / Gemini Nano video.
- Production App Check attestation provider; second platform.
