# Round 4 build report

Built from `260842c` against `STATE/PLAN.md`. Items 1–4 are complete. Item 5 was optional and was skipped because it requires regenerating screenshots in Chromium.

## 1. Resolve settings after acquiring the queue lock

- `src/ai/queue.ts:40` acquires the shared `margin-offline-queue` Web Lock before resolving settings. It prepares a fresh context before every eligible capture. Automatic mode mismatches skip the capture. A targeted retry records the existing mismatch message and preserves attempts, state, and the retry timestamp.
- `src/ai/queue.ts:95` passes preparation into the locked drain and checks the stop and rerun guards before and after preparation. The scheduler filters delayed retries using the last resolved mode, including passes with only delayed captures.
- `src/ui/options.ts:243` builds the retry runtime in the locked callback. The existing side panel callback at `src/ui/sidepanel.ts:506` already supplies a function that builds a fresh runtime, so its call site required no edit.
- `test/unit/ai.test.ts:231` exercises the real router with a stub provider and a held lock. Privacy mode and Only on-device each produce a single local-only inference request, and a Demo mode mismatch makes no provider calls. A two-capture pass verifies that the second capture picks up changes after the first completes. Existing queue cases were retained and adapted.

## 2. Runtime setup failure recovery

`src/ai/queue.ts:118` reports setup errors through `onError` and schedules another automatic pass after 30 seconds, then at intervals capped at 60 seconds. A failed setup can leave the active mode unknown, so this backoff belongs to the controller. It preserves the attempts and state of both live and Demo captures. Generation failures still use their existing per-capture backoff. `test/unit/ai.test.ts:435` injects two setup failures, verifies the 30- and 60-second waits, and confirms the live capture completes without any external event. The Demo capture remains queued.

## 3. Privacy copy and cover

- `README.md:3`, `submission/devpost-story.md:3`, `submission/demo-video-script.md:25`, `submission/submission-checklist.md:10`, and `scripts/screenshots.mjs:180` use “Learn what you read. Privacy mode keeps every capture on-device.”
- `README.md:60`, `README.md:152`, `submission/devpost-story.md:33`, `submission/devpost-story.md:90`, and demo shot 3 explain that the pattern-match approval path applies with the default sensitivity check enabled. `README.md:65` documents the separate runtime setup backoff.
- I checked the copy against `src/ai/router.ts`, `src/ai/runtime.ts`, `src/firebase/remoteConfig.ts`, and the local research brief. The script still schedules nine continuous shots, with shots 1–2 ending at 0:30 and all footage ending at 2:50. Shot 3 retains explicit simulated narration for the Demo take.
- I opened the orchestrator’s `submission/screenshots/cover.png` and confirmed the new tagline and both simulated AI banners. The file’s SHA-256 was `1e139c12ecceacda5b48b7e88f9c0c2fbc75998f14839809bd3d83031bcea450`.

## 4. Verification and packaging

| Command | Actual outcome |
|---|---|
| `nice -n 10 npx tsc --noEmit` | Exit 0, no diagnostics. |
| `nice -n 10 npm test` | Exit 0, 7 test-file results, 7 passed and 0 failed. The default reporter in this sandbox shows file-level results. |
| `NODE_OPTIONS=--test-isolation=none nice -n 10 npm test` | Exit 0, 122 individual tests, 122 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo. |
| `nice -n 10 node --import tsx --test --test-isolation=none --test-reporter=tap test/unit/*.test.ts` | Exit 0, 122 tests, 122 passed, 0 failed. |
| `nice -n 10 npm run package` | Exit 0, rebuilt `dist/` and `margin-extension.zip`, 229 files. This workspace has no local Firebase config, so the package exercises labeled Demo mode by default. |
| `unzip -l margin-extension.zip \| head` and `unzip -l margin-extension.zip manifest.json` | Both exit 0. The manifest is at the archive root. |
| `unzip -l margin-extension.zip \| grep -E '\.map$\|\.env\|config\.local'` | Exit 1, no matches. |
| `unzip -tq margin-extension.zip` | Exit 0, no integrity errors. A separate `python3 -` ZIP check exited 0 and verified that all 229 entries match `dist/` byte-for-byte, with the manifest and license at the root. |
| `grep -n 'createRuntime' src/ui/options.ts` | Exit 0, import at line 2 and sole call at line 244 inside the locked preparation callback. |
| `grep -rn 'unless you approve cloud' README.md submission scripts src` | Exit 1, no matches. |
| `grep -n 'Privacy mode keeps every capture on-device' README.md submission/*.md scripts/screenshots.mjs` | Exit 0, all five expected paths. |
| `node --check scripts/screenshots.mjs` and the `python3 -` script timing assertions | Both exit 0. Nine contiguous shots, 0:30 after shot 2 and 2:50 total. |
| Exact `git grep -nE` credential scan from `STATE/PLAN.md:50` | Exit 0, one false positive at the plan’s own regex example. With only that line filtered, exit 1, no matches. |
| `git grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' -- src submission README.md scripts` | Exit 1, no matches. |
| `git ls-files \| grep -E '\.env\|config\.local\|service-account'` | Exit 1, no matches. |
| `git diff --check -- README.md scripts/screenshots.mjs src submission/*.md test/unit/ai.test.ts` | Exit 0. The whole-tree check exited 2 on trailing whitespace in the existing driver-managed `LOOP_LOG.md:60` change. |

The first `nice -n 10 npm test` exited 1 with 6 of 7 test files passing. `nice -n 10 node --import tsx --test --test-reporter=tap test/unit/ai.test.ts` exited 1 with one failed file result. `nice -n 10 node --import tsx --test --test-isolation=none --test-reporter=tap test/unit/ai.test.ts` isolated the cause with 31 cases passed and 1 failed. The adapted approval fixture had selected live mode for a legacy Demo capture. I corrected its mode, and both full final runs passed.

Per-case npm output:

```text
ℹ tests 122
ℹ suites 0
ℹ pass 122
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

New test names as printed by Node:

1. manual retry honors Privacy mode enabled while waiting for the queue lock
2. manual retry honors Only on-device selected while waiting for the queue lock
3. manual retry honors Demo mode enabled while waiting for the queue lock
4. automatic drain uses updated settings for the second capture in the same pass
5. automatic drain retries runtime setup with backoff without another event
6. automatic drain schedules a matching capture that is already in backoff

## Changed files

- Queue and manual retry — `src/ai/queue.ts`, `src/ui/options.ts`.
- Regression tests — `test/unit/ai.test.ts`.
- Submission materials and cover renderer — `README.md`, `submission/demo-video-script.md`, `submission/devpost-story.md`, `submission/submission-checklist.md`, `scripts/screenshots.mjs`.
- Report — `STATE/BUILD_REPORT.md`. Build output, ZIP, and test logs are gitignored.

## Pending verification

- `npm run test:e2e` and `npm run screenshots` were not run — sandbox; driver runs e2e. No screenshot scene changed in this build. The optional Options layout change was skipped because it needs a working screenshot run.
- Live Firebase and Gemini Nano, native Chrome rehearsal, and publication checks are unverified. The queue regressions use synthetic inputs and a stub provider.
- No servers started. The owner’s role decision remains intact in `GOAL.md` and `STATE/PLAN.md`.

SUMMARY: Fixed stale queue settings and automatic setup retries, aligned the privacy copy with the cover, passed 122 unit cases and typecheck, and rebuilt the 229-file ZIP. Browser e2e is pending the driver.
