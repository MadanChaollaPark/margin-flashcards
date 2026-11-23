# Build report — Round 2

The test and submission changes are in place. TypeScript, all 109 unit cases and the 229-file package passed verification. The Playwright run reached the fixture setup in all 10 cases and stopped there because the sandbox denied the loopback listener. Driver browser verification is pending.

## 1. Locator fixes — partial

Implemented the three requested scopes in `test/e2e/extension.spec.ts`. The accessibility assertion targets the first library card that the test opens for editing. Both long-note explanations are scoped to the first generated card, matching the badge the test clicks. These are the only changes in those two tests.

```diff
-  await expect(library.getByLabel("Back", { exact: true })).toBeVisible();
+  await expect(library.locator(".library-card").first().getByLabel("Back", { exact: true })).toBeVisible();
-  await expect(panel.getByText(/Split into 2 on-device chunks\./iu)).toBeVisible();
+  await expect(panel.locator(".card").first().getByText(/Split into 2 on-device chunks\./iu)).toBeVisible();
-  await expect(panel.getByText(/exceeds the on-device token budget/iu)).toBeVisible();
+  await expect(panel.locator(".card").first().getByText(/exceeds the on-device token budget/iu)).toBeVisible();
```

`git diff -- test/e2e/extension.spec.ts` showed these scopes and the separate quick-look hunk. The single full Playwright attempt recorded `Error: listen EPERM: operation not permitted 127.0.0.1` for these two tests before their assertions ran. The focused `npx playwright test -g "accessibility sweep|long notes"` command was not run, per the plan's single-attempt sandbox guidance.

## 2. Quick-look popup interaction — partial

In `test/e2e/extension.spec.ts:188`, the test opens the local article fixture, brings the popup forward and clicks **Open side panel** while waiting for popup closure. `src/ui/popup.ts:15–17` closes that window after `chrome.sidePanel.open` resolves. The test fixture preserves the packaged `side_panel` entry from `manifest.json:23` and changes only `host_permissions` at `test/e2e/extension.spec.ts:52`. The remaining quick-look steps use the extension page as before.

Typecheck passed. The full Playwright attempt failed at the fixture listener before this click, with the same EPERM. The focused `npx playwright test -g "quick look"` command was not run. The driver owns browser confirmation.

## 3. Submission claims and demo flow — done

Changed `README.md`, `submission/devpost-story.md`, `submission/testing-instructions.md`, `submission/demo-video-script.md`, `submission/submission-checklist.md` and `scripts/screenshots.mjs`. I checked the supplied brief and saved Firebase research locally, then used the current extension source for the behavior claims.

| Previous claim or recording direction | Updated claim or direction | Evidence |
| --- | --- | --- |
| Private by default, cloud when it counts | Sensitive text stays on-device. Cloud when it counts. | `src/storage/settings.ts:22–24` defaults Privacy mode off and chooses Auto. `src/ai/router.ts:167–179` requires local inference for flagged text, with per-capture approval available for the pattern-only case if Nano is unavailable and local inference is optional. |
| Nano for everyday generation, and private material on-device | Auto prefers Nano for short supported inputs. Privacy mode can require local inference. The README diagram describes cases when on-device inference is required or selected offline. | `src/ai/router.ts:148–189,192–209`. |
| Captured text always screened for patterns, with sensitive notes and long documents described categorically | Pattern screening depends on the sensitivity setting. Eligible text can be classified locally when Nano is ready. Auto can send long cloud-eligible text online. Privacy mode requires local inference, blocks backup and restore, and still allows the routing settings fetch in a configured live build. | `src/ai/router.ts:130–139,167–209`, `src/ai/runtime.ts:16–23,53–67,125–141`, `src/firebase/remoteConfig.ts:46–59` and `src/firebase/sync.ts:121–138`. |
| Typed answers never leave the device, with offline grading described unconditionally | Typed answers stay on-device during grading. Offline grading requires Nano to be ready. | `src/ai/grade.ts:27–40` checks availability, requests `ONLY_ON_DEVICE` and requires an on-device result. |
| Firestore stores cards and schedules, never source text | Backup is off by default and blocked in Privacy mode. Deck documents store name and creation time. Card documents store type, front, back, deck ID, creation time, optional tags and optional FSRS state. Fronts and backs can quote source wording. The captured passage and source URL are excluded as fields, along with route history and review logs. | `src/storage/settings.ts:23`, `src/firebase/sync.ts:10–13,53–63,121–138,159–165` and `src/ai/prompts.ts:58–66`. |
| Production attestation only mentioned generically in README and absent from testing instructions | README and live testing step 4 explain the registered App Check debug-token requirement and the missing production token issuer. | `src/firebase/init.ts:15–28` enables debug mode and the production provider throws. |
| Shot 4 queues a scanned PDF | Shot 4 retains offline local chunking, then uses **Only cloud** while offline to queue nonsensitive pasted notes. On reconnect with the panel open, the new cards appear in the selected deck. Shot 5 switches back to **Auto router**. | `src/ai/router.ts:159–164,182–204`, `src/ui/sidepanel.ts:505–519`, `src/storage/db.ts:287–298` and `test/e2e/extension.spec.ts:455,587`. |
| Only a general reminder to label simulated footage | The setup calls for the visible **DEMO MODE (simulated AI)** banner, a **Simulated** caption and simulated badges. Shot 2 uses the supplied conditional voice-over in a Demo-mode recording. | `src/ui/shared.ts:38,105`, `src/ui/review.ts:77–84` and `test/e2e/extension.spec.ts:199–201`. |

Document acceptance commands and output follow.

```text
grep -rn -i "private by default" README.md submission scripts src
[no matches, exit 1]

grep -n "debug token" submission/testing-instructions.md
[line 15 includes the registered debug-token requirement and production token-issuer limitation]

grep -n -i "scan.pdf\|scanned PDF" submission/demo-video-script.md
[no matches]

grep -n "Only cloud" submission/demo-video-script.md && grep -rqF "Only cloud" src && echo label-ok
[line 21, label-ok]

for s in "Try a sample" "Enable on-device AI" "Make flashcards from selection" "Kept local" "Run live hybrid test" "Only cloud" "Queued"; do grep -rqF "$s" src || echo "MISSING: $s"; done
[no missing labels]
```

The timeline check printed `script ok 170 s`. The first two shots still end at 0:30 and cover the student audience, problem and Firebase AI Logic hybrid inference.

```sh
python3 - <<'PY'
import re
rows = re.findall(r"^\| *\d+ *\| *(\d+):(\d+)[–-](\d+):(\d+)", open("submission/demo-video-script.md").read(), re.M)
t = [(int(a)*60+int(b), int(c)*60+int(d)) for a,b,c,d in rows]
assert all(t[i][1]==t[i+1][0] for i in range(len(t)-1)), t
assert t[-1][1] <= 180 and t[1][1] == 30, t
print("script ok", t[-1][1], "s")
PY
```

The source label check printed `All 27 script UI labels exist in src.`

```sh
python3 - <<'PY'
from pathlib import Path
import re
script = Path("submission/demo-video-script.md").read_text()
src = "\n".join(p.read_text() for p in Path("src").rglob("*") if p.suffix in {".ts", ".html"})
labels = set(re.findall(r"\*\*(.+?)\*\*", script)) - {"Record the live path", "If you record Demo mode instead"}
labels |= set(re.findall(r"show “([^”]+)”", script))
missing = sorted(label for label in labels if label not in src)
assert not missing, missing
print(f"All {len(labels)} script UI labels exist in src.")
PY
```

## 4. Checklist sync — done

`submission/submission-checklist.md` records the updated tagline, the 2026-11-23 screenshot refresh and owner verification of the public license display. The public-repo check, YouTube upload and Devpost submission remain owner tasks. I opened `submission/screenshots/cover.png` and confirmed that it still shows the previous tagline. **`cover.png` is stale and the orchestrator needs to regenerate it next round.** The screenshot render command was not run. The renderer's cover text changed, and the open-round plan defers the bitmap refresh to the orchestrator.

## 5. Final verification — partial

The four planned commands ran in order under Node 24.22.1 and npm 11.21.1 with `nice -n 10`.

| Command | Actual outcome |
| --- | --- |
| `nice -n 10 npx tsc --noEmit` | Exit 0 with no output. |
| `nice -n 10 npm test` | Exit 0. The runner reported `tests 7`, `pass 7`, `fail 0` for the seven files. |
| `nice -n 10 npm run test:e2e` | Exit 1. Build passed. Playwright reported `10 failed`, all 10 with `Error: listen EPERM: operation not permitted 127.0.0.1`. Zero browser test bodies ran. One attempt. |
| `nice -n 10 npm run package` | Exit 0. `Packaged 229 files in /workspace/flashcard-ext/margin-extension.zip`. |

To verify the case count independently after the file-level summary, I ran the following. The seven files passed 19, 10, 3, 15, 12, 32 and 18 cases respectively, for **109 passed and zero failed**. The sources suite logged `Warning: Indexing all PDF objects` and passed all 32 cases.

```sh
set -o pipefail
for file in test/unit/*.test.ts; do
  printf '%s\n' "$file"
  nice -n 10 node --import tsx "$file" | grep -E '^[#ℹ] (tests|pass|fail)[ :]' || exit 1
done
```

```text
unzip -l margin-extension.zip | grep -E " manifest.json$"
      846  2026-11-23 07:37   manifest.json

unzip -l margin-extension.zip | grep -E "\.map$|\.env|config.local"
[no matches, exit 1]

git grep -nE "AIza[0-9A-Za-z_-]{30,}|BEGIN [A-Z ]*PRIVATE KEY" -- . ':!package-lock.json'
[no matches, exit 1]

grep -rnE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" research src submission README.md scripts
[no matches, exit 1]

git diff --stat -- . ':!LOOP_LOG.md'
[before this report, 14 files changed, 144 insertions(+), 125 deletions(-), including pre-existing planner and screenshot changes]

git diff --check -- . ':!LOOP_LOG.md'
[exit 0]

node --check scripts/screenshots.mjs
[exit 0]

sha256sum margin-extension.zip
728831dfb7d312b6a3e8f2147a7ba3c23753a0acb939f2ea82d13a8471f03b80  margin-extension.zip
```

The initial unscoped `git diff --check` found trailing whitespace in the existing driver-owned `LOOP_LOG.md:20` change. The scoped check above excludes that file. `GOAL.md`, `STATE/PLAN.md` and `driver.py` were left untouched. Work changed seven tracked files plus this report and refreshed the ignored package. No ad hoc temporary files or running fixture servers remain.

Driver browser verification, the orchestrator's cover update, and owner live Firebase or Gemini Nano verification remain pending. No live inference or submission was performed.

SUMMARY: Round 2 test and submission edits are in place, with 109 unit cases passing and the 229-file package rebuilt. Playwright hit the sandbox listener restriction, and the cover still needs regeneration.
