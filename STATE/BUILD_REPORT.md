# Round 3 build report

Built on `2be3a56` using the work package in `STATE/PLAN.md`. All five builder items are done. Browser end-to-end verification is pending the driver run.

## 1. Qualified privacy tagline — done

Replaced “Sensitive text stays on-device. Cloud when it counts.” with “Sensitive-looking text stays on-device unless you approve cloud.” at each of these locations.

- `README.md:3`
- `scripts/screenshots.mjs:180` (the original `<strong>Learn what you read.</strong>` lead-in is preserved)
- `submission/demo-video-script.md:24` (shot 9)
- `submission/devpost-story.md:3`
- `submission/submission-checklist.md:10`

Read `research/BRIEF.md` and checked the privacy copy against the implementation. `src/ai/router.ts:130–139` implements the local pattern heuristic. `src/ai/runtime.ts:61–67` calls the Nano sensitivity screen for eligible text. `src/ai/router.ts:151–180` permits per-capture approval for a pattern-only match with Nano unavailable and enforces local inference when Privacy mode or Only on-device applies. `src/ai/runtime.ts:53–60` asks for approval before routing again. `src/firebase/remoteConfig.ts:9,51–59` defaults `sensitivityCheck` to true and reads the activated Firebase value. The README Privacy section and Devpost sensitivity section now explain all four behaviors.

I opened `submission/screenshots/cover.png` and verified the exact tagline is legible and the two extension views display the Demo banner. The orchestrator’s prebuilt cover hash matched.

## 2. Demo narration and shot 4 — done

The script still runs 2:50. Shots 1 and 2 finish at 0:30 and introduce the audience, problem, and hybrid inference. Shot 4 contains one offline cycle, with 20 seconds allotted.

| Shot | Time | On screen | Live voice-over |
|---|---|---|---|
| 4 | 0:52–1:12 | In Options, turn Privacy mode off and set Inference mode to Only cloud. Go offline, paste short nonsensitive notes, click Generate, and expand Queued. Reconnect with the side panel open, show the queue clearing, then open Cards to show the new cards in the selected deck. | “With Only cloud selected and no connection, Margin queues the capture. When I reconnect, it generates the cards and saves them to my deck.” |

The replacement voice-over table in `submission/demo-video-script.md` gives these lines for Demo footage. The script requires the on-screen `DEMO MODE (simulated AI)` banner and `Simulated` caption.

| Shot | Demo voice-over |
|---|---|
| 2 | “In the live build, Firebase AI Logic prefers Gemini Nano for short, supported readings and can fall back to cloud Gemini when allowed. The on-device result shown here is simulated.” |
| 3 | “Margin checks for sensitive patterns locally. The card result here is simulated. In the live build, Privacy mode requires on-device inference.” |
| 4 | “Margin queues the capture while I’m offline, with the reason labeled ‘Simulated — ’. On reconnect, Margin saves the simulated cloud results to my deck.” |
| 5 | “In the live build, long public articles can go to cloud Gemini. This cloud result is simulated. The Source menu also offers YouTube and image capture.” |
| 6 | “In the live build, Gemini Nano grades my answer on-device. The grade shown here is simulated. FSRS schedules the next review.” |
| 8 | “These routing stats count simulated cards. In the live build, Remote Config supplies routing settings and App Check protects the cloud path.” |

## 3. Queue mode — done

- `src/ai/runtime.ts` records the actual provider mode when enqueuing. The existing simulated queue reason prefix is preserved.
- `src/ai/queue.ts` stores the optional mode and reads legacy entries from their reason prefix. An automatic mode mismatch skips the entry without writing to it. A targeted retry writes the exact Demo or live mismatch notice to `lastError` while preserving attempts, state, and retry time. The timer considers queued entries in the current mode.
- `src/ui/sidepanel.ts` and `src/ui/options.ts` derive the retry mode from the runtime used for generation. The side panel checks again after a routing settings change. Options surfaces the mismatch through its existing notice.
- `test/unit/ai.test.ts` includes seven new cases and adapts the two scheduler fixtures to supply a mode with their processor.

New unit cases as reported by Node:

1. automatic live drain leaves Demo captures unchanged
2. automatic Demo drain leaves live captures unchanged
3. manual retries in the other mode update only the queue error
4. a matching Demo drain saves cards and removes the queued capture
5. legacy entries infer Demo mode from the simulated reason prefix
6. offline Only cloud capture saves simulated cloud cards on reconnect in the same mode
7. automatic retries only schedule timers for captures in the current mode

The Shot 4 unit case verified a persisted Demo entry with the `Simulated — ` reason prefix, an empty queue after reconnect, and two cards in the selected deck with `in_cloud` routes and `simulated: true`.

## 4. Submission checklist and README — done

`README.md` and `submission/devpost-story.md` document retries in the same Demo or live mode. `submission/submission-checklist.md` records the cover refresh on 2026-11-23 and assigns the native Chrome side-panel walkthrough, public repo and license verification, YouTube video, and Devpost submission to the owner.

## 5. Verification and packaging — done

| Command | Actual result |
|---|---|
| `grep -rn 'Cloud when it counts' README.md submission scripts src` | Exit 1, no matches |
| `grep -rlF 'Sensitive-looking text stays on-device unless you approve cloud.' README.md submission scripts \| sort` | Exit 0, five paths listed under item 1 |
| `grep -n 'sensitivityCheck' src/firebase/remoteConfig.ts && grep -n -i 'sensitivityCheck\|Remote Config' submission/devpost-story.md` | Exit 0, config lines 9 and 59 and Devpost privacy line 33 |
| `node --check scripts/screenshots.mjs` | Exit 0 |
| `grep -n -i 'nano splits' submission/demo-video-script.md` | Exit 1, no matches |
| `grep -n 'queuedMode' src/ai/queue.ts src/ui/sidepanel.ts src/ui/options.ts` | Exit 0, `queue.ts` lines 25, 55, 122. The callers pass the runtime mode to the queue functions. |
| `nice -n 10 npx tsc --noEmit` | Exit 0, no diagnostics |
| `nice -n 10 npm test` | Exit 0. The default runner in this environment reported 7 test-file results, 7 passed and 0 failed. The first invocation’s output session was lost after two file results. This is the completed retry. |
| `nice -n 10 node --import tsx --test --test-reporter=tap test/unit/ai.test.ts` | Exit 0, 1 test-file result passed |
| `nice -n 10 node --import tsx test/unit/ai.test.ts` | Exit 0, 26 cases passed, 0 failed |
| `NODE_OPTIONS=--test-isolation=none nice -n 10 npm test` | Exit 0, **116 cases passed, 0 failed**, 0 skipped, 0 cancelled |
| `nice -n 10 npm run package` | Exit 0. `Packaged 229 files in /workspace/flashcard-ext/margin-extension.zip` |
| `unzip -l margin-extension.zip \| grep -E ' manifest.json$'` | Exit 0, `846  2026-11-23 11:09   manifest.json` |
| `unzip -l margin-extension.zip \| grep -E '\.map$\|\.env\|config.local'` | Exit 1, no matches |
| `git grep -nE 'AIza[0-9A-Za-z_-]{30,}\|BEGIN [A-Z ]*PRIVATE KEY' -- . ':!package-lock.json'` | Exit 1, no matches |
| `grep -rnE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' research src submission README.md scripts` | Exit 1, no matches |
| `sha256sum submission/screenshots/cover.png` | Exit 0, `4f7b7ccdbc6d4e23ddd6b2fa9004ad17a9e626723e860926597614871c5c9dfc` |
| `git diff --stat -- . ':!LOOP_LOG.md'` | Exit 0 before this report was updated. `13 files changed, 327 insertions(+), 125 deletions(-)`, including the existing orchestrator edits to the plan, checklist, and cover. |
| `unzip -tq margin-extension.zip` | Exit 0. `No errors detected in compressed data of margin-extension.zip.` |
| `git diff --check -- README.md scripts/screenshots.mjs src submission test/unit/ai.test.ts` | Exit 0. The earlier whole-tree check flagged pre-existing trailing whitespace at `LOOP_LOG.md:40`. |
| `rg -n '^Planner/orchestrator' GOAL.md STATE/PLAN.md` | Exit 0, the owner role decision appears verbatim at `GOAL.md:62` and `STATE/PLAN.md:3`. |

The per-case unit run reported:

```text
ℹ tests 116
ℹ suites 0
ℹ pass 116
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 20391.645273
```

Exact label check, exit 0 with no `MISSING` lines:

```sh
for s in "Make flashcards from selection" "Kept local" "Privacy mode" "Inference mode" "Only cloud" "Queued" "Generate" "Graded on-device" "Export .apkg" "Run live hybrid test" "Diagnostics" "Auto router"; do grep -rqF "$s" src || echo "MISSING: $s"; done
```

Exact script check, exit 0 with `script ok 170 s; 25 bold UI labels found; 6 Demo shot lines`:

```sh
python3 - <<'PY'
from pathlib import Path
import re
s=Path("submission/demo-video-script.md").read_text()
rows=re.findall(r"^\| *\d+ *\| *(\d+):(\d+)[–-](\d+):(\d+)", s, re.M)
t=[(int(a)*60+int(b), int(c)*60+int(d)) for a,b,c,d in rows]
assert t[0][0] == 0 and all(t[i][1]==t[i+1][0] for i in range(len(t)-1)), t
assert t[-1][1] == 170 and t[1][1] == 30 and t[3][1] - t[3][0] == 20, t
demo=s[s.index("## Demo mode instead"):]
assert re.findall(r"^\| *(\d+) *\|", demo, re.M) == ["2", "3", "4", "5", "6", "8"], demo
labels=set(re.findall(r"\*\*([^*]+)\*\*", s)) - {"Record the live path"}
source="\n".join(p.read_text() for p in Path("src").rglob("*") if p.suffix in [".ts", ".html"])
assert all(label in source for label in labels), sorted(label for label in labels if label not in source)
print("script ok", t[-1][1], "s;", len(labels), "bold UI labels found;", 6, "Demo shot lines")
PY
```

## Changed files

- Copy and cover renderer — `README.md`, `submission/devpost-story.md`, `submission/demo-video-script.md`, `submission/submission-checklist.md`, `scripts/screenshots.mjs`
- Retry behavior — `src/ai/queue.ts`, `src/ai/runtime.ts`, `src/ui/sidepanel.ts`, `src/ui/options.ts`
- Regression coverage and evidence — `test/unit/ai.test.ts`, `STATE/BUILD_REPORT.md`
- Generated locally — `dist/`, `margin-extension.zip`

## Pending or deferred

- `npm run test:e2e` and `npm run screenshots` were **not run — sandbox; driver runs e2e**. This round’s plan documents the loopback and Chromium restriction. The orchestrator’s 10 passing e2e tests were on the baseline. The current build’s seven new queue cases ran as unit tests. The new manual mismatch notice applies only to mismatched captures, which are absent from the screenshot scenes.
- Live Firebase and Gemini Nano verification, native Chrome side-panel walkthrough, publishing and license display checks are owner tasks. No live inference was exercised here.
- Options layout, production App Check attestation, and a second platform remain deferred per the round plan.
- No servers or builder temporary files were created.

SUMMARY: Finished Round 3 queue isolation and submission copy, passed 116 unit cases and typecheck, and rebuilt the 229-file ZIP. Browser e2e remains with the driver.
