# Round 1 build report

The builder completed the submission docs, repository cleanup, unit verification and extension packaging. The Playwright test bodies and screenshot rendering are blocked by socket restrictions in this workspace. The owner role assignments, driver and prior state were preserved.

## 1. Judge quick look · Partial

- Changed `test/e2e/extension.spec.ts` and aligned `submission/testing-instructions.md` with the first-launch flow. **judge quick look generates simulated cards and starts a fresh review** starts with a fresh profile in Demo mode, checks the popup and welcome, uses the sample, saves the simulated cards, follows **Review**, reveals an answer and rates it. It checks `welcomeSeen` and reload persistence. The existing page-capture test also checks persistence after clicking **Dismiss**.
- `nice -n 10 npm run build` passed. `nice -n 10 npx playwright test -g 'quick look'` ran twice and reported **0 passed, 1 failed** each time. The loopback fixture failed with `Error: listen EPERM: operation not permitted 127.0.0.1` before either run reached the test body. No quick-look pass line is available.

## 2. Accessibility sweep · Partial

- Changed `test/e2e/extension.spec.ts`. **accessibility sweep covers five extension pages in light and dark** checks English document language, accessible names of visible controls, keyboard Tab focus on a button, and computed contrast against an opaque ancestor background. It exercises all requested badge colors and the separate simulated grading badge. It generates and saves sample cards to seed a due review.
- `nice -n 10 npx playwright test -g 'accessibility sweep'` reported **0 passed, 1 failed** at the loopback fixture. Browser-computed contrast, accessible names and Tab focus remain unverified.
- A local `python3 -` check extracted the existing hex tokens from `src/ui/styles.css` and applied the WCAG luminance formula. All 20 category/theme minima exceeded 4.5:1. These are static token-pair measurements. No HTML or CSS changed, so there are no before-to-after fixes.

| Element | Light | Dark |
| --- | ---: | ---: |
| Demo banner | 6.32:1 | 8.54:1 |
| On-device badge | 6.59:1 | 8.42:1 |
| Cloud badge | 6.14:1 | 7.69:1 |
| Kept local badge | 6.47:1 | 8.34:1 |
| Queued badge | 6.32:1 | 8.54:1 |
| Simulated grading badge | 7.45:1 | 11.41:1 |
| Primary button, including hover | 6.97:1 | 8.94:1 |
| Secondary button, including hover and suggested rating | 13.41:1 | 11.68:1 |
| Body text | 14.14:1 | 14.07:1 |
| Muted text | 5.71:1 | 6.80:1 |

The contrast table contains ten categories measured in two themes. The light minimum was muted text on the accent tint (`#545d77` on `#eeeeff`), and the dark minimum was the corresponding `#b3b9d3` on `#2b2c53`.

## 3. Hybrid routing coverage · Partial

- Changed `test/e2e/extension.spec.ts`, `test/fixtures/captions.xml` and `test/unit/sources.test.ts`. **long notes generate deduplicated on-device chunks offline and route to cloud online** uses the same 10,050-estimated-token passage on both routes. **YouTube captions generate source-linked cards in the side panel** routes the watch page and timedtext XML through Playwright and checks the caption-derived card and video URL in Review.
- `nice -n 10 npx playwright test -g 'chunk'` and `nice -n 10 npx playwright test -g 'YouTube'` each reported **0 passed, 1 failed** before browser launch. The YouTube interception itself was not reached, so its browser behavior remains unverified. The fixture keeps all YouTube requests local to Playwright routing and uses no live video.
- Two direct `node --import tsx --input-type=module -e` probes called the routing/generation modules. The initial fixture did not generate the two expected demo cards, so I rewrote its facts. The corrected probe reported 10,050 estimated tokens, two chunks, and two unique questions. It returned `Simulated — Offline. Gemini Nano can process this on-device. Split into 2 on-device chunks.` offline and `Simulated — This input exceeds the on-device token budget.` online. The corrected caption fixture generated one simulated chlorophyll card.
- The unit substitute **YouTube capture reads MAIN-world caption tracks and keeps the video link** exercises the active-tab capture, the injected track-reader function, caption downloading and parsing, and retained video metadata using JSDOM and a mocked fetch. An initial `nice -n 10 node --import tsx test/unit/sources.test.ts` reported **31 passed, 1 failed** and exposed a URL-object versus string assertion. With the assertion fixed, `nice -n 10 node --import tsx --test --test-isolation=none --test-name-pattern 'YouTube|short Auto generation|all four Firebase|lets Firebase fall back' test/unit/{sources,router,ai}.test.ts` reported **6 passed, 0 failed**. The default-isolation version with the same filter failed initially (**2 file workers passed, 1 failed**) and passed after the fix (**3 file workers passed, 0 failed**).
- Nano-unavailable browser simulation was skipped because Demo mode does not expose a setting for model availability. Existing unit coverage in `test/unit/router.test.ts` checks the Auto decision when Nano is unavailable, and `test/unit/ai.test.ts` checks the provider fallback reason. The focused run passed the routing and fallback tests.

## 4. Submission docs · Done

- Changed `submission/testing-instructions.md`, `submission/demo-video-script.md`, `submission/submission-checklist.md`, `submission/devpost-story.md` and `README.md`. Source install uses Node 24.15+ and points to `dist/`. The Release ZIP is optional. The checklist identifies `MadanChaollaPark/margin-flashcards`, `main`, the driver's Git operations and the owner's Devpost/YouTube steps.
- The demo opens with the audience and problem, demonstrates short-text generation, and explains Firebase AI Logic hybrid inference by **0:30**. A `python3 -` timing check verified contiguous shots with a total of **170 seconds (2:50)** and **61 opening voice-over words**. The fictional sensitive example uses a reserved address. The offline scanned-PDF shot turns Privacy mode off first and shows the queue clearing into the selected deck on reconnect. The live-recording instruction and simulated-shot label are explicit.
- `grep -n "GitHub Release" submission/testing-instructions.md` found one optional match. `grep -n "npm ci" submission/testing-instructions.md` found the source install and the live setup. ``grep -nE 'no remote added|clean `public` branch' submission/submission-checklist.md`` found no stale lines. The plan's `grep -rqF` label loop printed no missing labels. Additional `rg -lF` and `rg -nF` checks located the script's UI labels, the context-menu titles in `src/background.ts` and the four-mode test in `test/unit/router.test.ts`. `rg -n` matched the quoted route reasons in `src/ai/router.ts` and `src/ai/provider.ts`. Both README and Devpost distinguish Demo mode from live inference.

## 5. Repo hygiene · Done

- Changed `.gitignore` and `research/hybrid.txt`. Replaced one example token with `<DEBUG_TOKEN>` and removed the 33 files in top-level `logs/` with `python3 -`. The first attempt with `python -` returned 127 because only `python3` is installed. The history check `git log --oneline -- logs | head -1` returned `508bb32` before removal. `STATE/logs/` and its ignore rule remain present.
- `grep -rnE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' research src submission README.md` and `git grep -nE 'AIza[0-9A-Za-z_-]{30,}|BEGIN [A-Z ]*PRIVATE KEY' -- . ':!package-lock.json'` each returned 1 with no matches. `test ! -d logs || [ -z "$(ls -A logs)" ]` returned 0. `git check-ignore logs/example.log STATE/logs/example.log margin-extension.zip` confirmed the ignore paths.

## 6. Screenshots and package · Partial

- Changed `scripts/screenshots.mjs` and renamed the existing dark-review PNG from `09-review-dark.png` to `10-review-dark.png`. `git show HEAD:submission/screenshots/09-review-dark.png | sha256sum` and `sha256sum submission/screenshots/10-review-dark.png` showed the same hash. `grep -rn '09-' README.md submission scripts` found only the library screenshot name. `grep -o "submission/screenshots/[^)]*" README.md | xargs ls` resolves to `submission/screenshots/00-hero.png` after correcting a directory reference in the Scripts table.
- Opened and inspected all 12 existing PNGs. The gallery identifies simulated output. The existing export image scrolls the demo banner out of view, and the generated panel and hero cut into a preview at the viewport edge. The script now takes a full Options export shot with the banner and status, adjusts the panel and hero viewport, and positions the two cover captures so they do not overlap. These framing changes are unverified in the generated images.
- `nice -n 10 npm run screenshots` failed twice after the build passed. Chromium stopped in Crashpad with `setsockopt: Operation not permitted (1)`; **0 PNGs refreshed**. A direct `nice -n 10 node --input-type=module -e` probe using `chromium.launchPersistentContext` and `--disable-crashpad-for-testing` reached a subsequent denied `shutdown` call in `content/browser/sandbox_host_linux.cc`. A second probe also using `--single-process --no-zygote` failed at that same call. `ls -la submission/screenshots` showed the existing Nov 20 image timestamps. `node --check scripts/screenshots.mjs` passed.
- `nice -n 10 npm run package` refreshed the ignored ZIP with 229 files. `unzip -l margin-extension.zip | head` listed the archive and `unzip -l margin-extension.zip | grep -E '^.* manifest.json$'` showed the 846-byte root `manifest.json`. `unzip -l margin-extension.zip | grep -E '\.map$|\.env|config.local'` returned 1 with no matches. `unzip -tq margin-extension.zip` reported `No errors detected in compressed data of margin-extension.zip.`

## 7. Final verification · Partial

Ran the required commands in order, using `nice -n 10`, then repeated that sequence after the final wording edits.

| Command | Actual result |
| --- | --- |
| `nice -n 10 npx tsc --noEmit` | Exit 0, no diagnostics |
| `nice -n 10 npm test` | Exit 0. Reporter output `ℹ tests 7`, `ℹ pass 7`, `ℹ fail 0` describes the seven test files in this environment. |
| `nice -n 10 npm run test:e2e` | Build passed. Playwright printed `Running 10 tests using 1 worker` and `10 failed`, all before the test body at `listen EPERM: operation not permitted 127.0.0.1`. Exit 1. |
| `nice -n 10 npm run package` | Exit 0. `Packaged 229 files in /workspace/flashcard-ext/margin-extension.zip`. |

- `nice -n 10 node --import tsx --test --test-isolation=none test/unit/*.test.ts` verified the individual count: `ℹ tests 109`, `ℹ pass 109`, `ℹ fail 0`. `nice -n 10 npx playwright test --list` discovered 10 tests. A standalone `node --input-type=module -e` probe binding `node:net` to `127.0.0.1:0` reproduced `EPERM` without the project fixture.
- `git diff --check -- . ':!LOOP_LOG.md'` passed. The unfiltered check spotted pre-existing trailing whitespace in driver-owned `LOOP_LOG.md`. The temporary Chromium probe profiles were removed in `finally`. A workspace `find` check showed no scratch profiles, core dumps or Playwright report directory. Playwright left its usual ignored `test-results/` output.
- Browser execution and screenshot refresh remain blocked in this environment. Live Firebase and Gemini Nano verification was not run, as deferred in the plan. No Git history or external submission operation was performed.

SUMMARY: Unit tests passed 109/109, typecheck passed, and the 229-file ZIP was refreshed. Sandbox socket restrictions blocked Playwright and screenshot regeneration.
