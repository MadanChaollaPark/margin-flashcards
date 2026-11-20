## 1. Claims the code doesn't support

**devpost-story.md**

| Claim | What the code does | Rewrite |
|---|---|---|
| "all four `InferenceMode`s chosen per job by our router" | `decide()` only returns ONLY_ON_DEVICE, ONLY_IN_CLOUD, and PREFER_IN_CLOUD. The "Prefer on-device" setting maps to ONLY_ON_DEVICE. | "three modes", or fix the code (change #2) |
| "chunk with overlap" | `chunkText` splits at whitespace and doesn't overlap chunks. | "chunk at word boundaries" |
| Badges read "On-device · Gemini Nano" / "Cloud · Gemini", with reasons like "kept on-device: sensitive content detected" | Labels are "On-device" and "Cloud". Reasons are full sentences, e.g. "Sensitive content stays on-device." | Quote the real strings |
| "PDF input runs in the cloud" (also in What we learned) | pdf.js extracts the text locally. Only PDFs with fewer than 40 letters or digits go to the cloud as bytes. | "Scanned PDFs use the cloud; text PDFs are extracted locally" |
| "Before any cloud call… regex plus Nano classification" | The Nano check only runs on text, and only when Nano is available. Images, scanned PDFs, and caption-less YouTube URLs reach the cloud unchecked. | "before eligible text goes to the cloud" |
| "every card carries a route badge" | The badge only appears in the side-panel preview. Review and Options never show it. | "every generated card shows…", or show it after saving (#3) |
| "inline editing" | You can only edit before saving. Saved cards can't be edited or moved. | "edit cards before saving" |
| "each card links back to the exact passage" | Exact only for selections. Whole-page captures anchor to the first paragraph; notes, images, and YouTube get no link. | "selection cards link to the highlighted passage" |
| "readability extraction" | A home-grown article/main heuristic, not the Readability library | "main-content extraction" |
| Privacy mode: "nothing leaves the machine" | Remote Config is still fetched. | "no source content leaves the machine" |
| Queue "run automatically when you reconnect" | Retries only run while the side panel is open. | add "while the side panel is open" |
| Other generators "all ship your reading to a server" | Can't be verified | "most" |

**demo-video-script.md**

- **S2 "cards stream in":** `generateContent` doesn't stream, so cards appear all at once. Say "cards appear."
- **S3 offline long doc queues:** With Nano ready in Auto, offline long text is split into on-device chunks ("Offline. Gemini Nano can process this on-device. Split into N on-device chunks."). That's a better story to show. To demonstrate the queue, use a scanned PDF offline (`test/fixtures/scan.pdf`). Drop "one line of config."
- **S4 "decision trace popover" and "Nano checks it":** The badge expands to one reason sentence. An email or phone number trips the regex, and the Nano check is skipped. Say "a local pattern check and Gemini Nano screen text before it can go to the cloud."
- **S5 "From this PDF" / "From this video transcript":** These context-menu items don't exist. The menu has selection, page, and image; PDF and YouTube are in the Source dropdown. The reason string is "PDFs without enough extractable text require cloud inference," and it only appears for scanned PDFs.
- **S6 "Mostly right… suggested Good":** A partial answer suggests Hard (rating 2), and the UI says "Partially correct / Missing points." Don't promise "1m/10m/3d/8d"; FSRS computes the intervals.
- **S7 "move it to a deck":** Not possible after saving. Pick the deck before **Accept all**.
- **S8 "never sent to the cloud":** The UI label is "Source data kept local."

## 2. Scores as it stands

- **Technological Implementation: 4.** Per-request routing, `inferenceSource` verification, a Nano sensitivity gate, and Remote Config are all real. But it never uses the SDK's own fallback (PREFER_ON_DEVICE), and nothing has run against real Nano.
- **Design: 3.** The capture → review → export loop is complete. But there's no card library, saved cards can't be edited, and route badges disappear after saving.
- **Potential Impact: 3.** Students are a real audience, but the story doesn't name one specific user, and AI flashcard tools are a crowded space.
- **Quality of the Idea: 3.** Flashcards from reading is an obvious idea. Nano as a cloud gatekeeper and private answer grading are the non-obvious parts, and the story undersells them.

## 3. Five highest-leverage changes for the next 90 minutes

1. **Fix every item in section 1** (about 15 minutes). A judge who catches one false claim will doubt the rest.
2. **Route non-sensitive, short Auto captures through `PREFER_ON_DEVICE`** (about 20 minutes, plus router tests). `firebaseProvider.ts` already labels the case where Firebase falls back to the cloud. This puts the SDK's own hybrid feature on screen, which is what the Technological Implementation criterion measures.
3. **Show the route badge after saving** (about 25 minutes). Add it to the revealed card in Review, and add a read-only card list with badges in Options.
4. **Dry-run every video scene on real Chrome with Nano and a real Firebase project.** Confirm that `gemini-3.5-flash-lite` and `gemini-3.8-flash` resolve, that YouTube `fileData` (`video/mp4` with a youtube.com URL) is accepted by the Gemini Developer API, and that App Check passes. Fix whatever breaks.
5. **Reframe the story around one user and the gatekeeper idea.** For example, a med student pasting patient-case notes: Nano decides what may leave the device and grades answers offline.

## 4. Stage One (pass/fail) risks

- **Required artifacts don't exist yet.** The checklist marks the video ❌ and the public repo ⚠️.
- **Judges can't test live AI.** The Firebase config is baked in at build time, so a judge building from the repo or ZIP gets Demo mode. A configured build would still need the judge's own App Check debug token. The video is your only proof of live Firebase AI Logic calls, so it must not show the DEMO MODE banner. Say this plainly in the testing instructions.
- **No live run so far.** All unit and e2e tests use `MockProvider`.
- **Files to review before pushing.** `logs/*.prompt.md` and `PLAN.md` aren't gitignored, so they'd go into the public repo. I couldn't run `git grep` for keys because shell access was denied, so run the checklist's secret scan yourself.
