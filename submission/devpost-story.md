# Margin

**Tagline:** Learn what you read. Private by default, cloud when it counts.

**Platform category:** Web (Chrome). It's a Chrome extension running Gemini Nano through Firebase AI Logic hybrid inference.

---

## Inspiration

Take a third-year medical student. Every day she reads lecture slides, guidelines and her own case notes. Spaced repetition is the best-evidenced way to keep that knowledge, but writing good flashcards by hand takes longer than the reading itself, so most students give up on it.

AI card generators fix the time problem by sending your reading to a server. That rules them out for the material people most need to remember: patient-case notes, internal work docs, contracts, a journal in a language you're learning. They also stop working when you're offline, for example on the subway.

Firebase AI Logic's hybrid inference let us build something different. **Gemini Nano on the device acts as the gatekeeper and does the everyday work. Content goes to cloud Gemini only when it needs to and is allowed to, and every one of those decisions is shown to the user.**

## What it does

Margin is a Chrome extension that turns what you read into spaced-repetition flashcards. It's built around the split between device and cloud:

- **Capture from anywhere**
  - Right-click and choose "Make flashcards from selection", "…from this page" or "…from image".
  - The side panel also accepts a PDF open in the tab (text extracted locally with pdf.js), a YouTube video's captions, a screenshot or image file, and pasted notes.
- **A router that explains every decision**
  - Every generated card has a route badge: *On-device*, *Cloud*, *Kept local* or *Queued*.
  - Expand the badge to see the reason, for example:
    - "Fits on-device budget"
    - "Sensitive content stays on-device."
    - "This input exceeds the on-device token budget."
    - "PDFs without enough extractable text require cloud inference."
  - The badge stays with the card in the library and during review.
- **Gemini Nano as the cloud gatekeeper**
  - Before captured text can go to the cloud, it passes a local pattern check. When Nano is ready, it also passes a Gemini Nano structured-output classification. Image-only captures skip the Nano check.
  - If the text looks sensitive, the job stays on-device, split into chunks if needed.
  - If the pattern check flags text and Nano can't confirm, Margin asks you before sending anything. If you decline, nothing is sent.
- **Privacy mode:** forces on-device inference, so no source content leaves your machine.
- **Works offline**
  - With Nano ready, captures keep working with no connection. Long text is split into on-device chunks.
  - Jobs that truly need the cloud, such as scanned PDFs, are queued. They retry with backoff while the side panel is open and you're back online. You can also retry them manually from Options.
- **Review with private answer grading**
  - You type your answer and Gemini Nano grades it on-device: Correct, Partly correct or Incorrect.
  - It lists the key terms you missed and suggests a rating (Again, Hard, Good or Easy).
  - Your answers never leave the device.
- **Real spaced repetition:** FSRS scheduling via the open-source ts-fsrs library. Each rating button previews its next interval. There are also keyboard shortcuts, cloze cards and a session summary.
- **Library and export**
  - A searchable card library where you can edit, retag, move cards between decks or delete them.
  - Decks and de-duplication.
  - One-click export to an Anki package (.apkg) or a TSV file Anki can import.
- **Source anchors:** cards made from a selection link back to the highlighted passage with a text-fragment URL. Whole-page cards link to their source excerpt when Margin can find it.
- **Transparency**
  - Stats show what share of cards were generated on-device and how much source data stayed local.
  - A Diagnostics card checks Prompt API availability, App Check and Remote Config, and can run a live hybrid test call.

## How we built it

- **Firebase AI Logic** (`firebase/ai`, Firebase JS SDK 13.4.0)
  - Setup is `getAI(app, { backend: new GoogleAIBackend() })` followed by `getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })`.
  - The router chooses the `InferenceMode` for each request instead of once for the whole app:
    - `PREFER_ON_DEVICE` for short, non-sensitive captures, so the SDK's own fallback handles devices without Nano.
    - `ONLY_ON_DEVICE` for sensitive content and privacy mode.
    - `PREFER_IN_CLOUD` for long, non-sensitive text.
    - `ONLY_IN_CLOUD` for scanned PDFs and videos without captions.
  - We read `response.inferenceSource`, so every generation badge reports what actually ran.
  - `initializeDeviceModel()` is called only from the "Enable on-device AI" click, with a download progress bar.
  - Cards, grades and sensitivity results all use `responseSchema` structured JSON, on both device and cloud.
- **The router** is a pure, unit-tested `decide(job, ctx)` function. It weighs:
  - the input type: text, PNG/JPEG image, PDF or YouTube
  - a script-aware token estimate against the on-device budget, with room reserved for output under Nano's 9,216-token limit
  - whether Nano is available, downloadable, downloading or unavailable
  - online state, sensitivity, privacy mode and the user's override
  
  It always returns a human-readable reason, and tests check that each of the four inference modes is reachable.
- **Firebase App Check:** AI Logic requires it. We use the debug provider on the `chrome-extension://` origin, which the rules accept.
- **Firebase Remote Config** supplies the routing values: the on-device token budget, the model names (`gemini-3.5-flash-lite` for standard requests, `gemini-3.8-flash` for long documents) and cards per chunk. Safe defaults are built in.
- **Firebase Authentication + Cloud Firestore** power an optional deck backup, off by default.
  - It signs in anonymously.
  - It stores cards and scheduling state, never source text.
  - Security rules limit each user to their own data.
- **Chrome MV3**
  - Side panel, popup, review page, library and options pages.
  - Context menus. Host permissions are optional and requested only when needed.
  - All inference runs in extension pages, where the Prompt API is exposed. The service worker only handles messaging.
  - Everything is bundled with esbuild, with no remote code. sql.js (WASM) builds the .apkg files.
- **Testing**
  - node:test unit tests cover the router, parser, de-dupe, chunking, queue, FSRS, TSV/.apkg export and sync mapping.
  - Playwright end-to-end tests load the unpacked extension in Chromium with a deterministic Demo-mode provider. Demo output is always labeled "Simulated".
  - A post-build check fails the build if the bundle doesn't actually call `getGenerativeModel`, `generateContent` and `initializeDeviceModel`.

## Challenges we ran into

- **Choosing the mode per request.** `PREFER_ON_DEVICE` everywhere hides decisions that matter. A sensitive note should never quietly fall back to the cloud. We built the router so users can see and control those choices.
- **The on-device token budget.** Long pages exceed what Nano can take. We chunk at sentence boundaries with overlap and de-duplicate cards across chunks. Long, non-sensitive documents go to a long-context cloud model.
- **Reliable JSON from a small model.** Structured output, plus a tolerant parser (code fences, trailing commas, truncated arrays), plus validation and caps.
- **Extension constraints**
  - MV3's content security policy: no remote code, and WASM for sql.js.
  - No Prompt API in service workers.
  - The user-gesture requirement for downloading the model.
  - App Check on an extension origin, where reCAPTCHA isn't an option.

## Accomplishments that we're proud of

- Users can see and control the split between device and cloud. It isn't hidden as an implementation detail.
- Answer grading during review is private and works offline.
- The whole loop works: capture → generate → edit → review → export to Anki.

## What we learned

- On-device models are great at short, structured, private tasks: classification, grading, and writing cards from a passage. The cloud wins on long documents and scanned PDFs. Designing around that split makes both better.
- Good flashcards follow the minimum-information principle. Prompting for atomic Q/A and cloze cards matters more than model size.

## What's next

- An Android companion for reviewing on the go (Gemini Nano via Firebase AI Logic), synced through the Firestore backup.
- Image-occlusion cards from diagrams.
- Shared decks for study groups, with per-deck privacy settings.

## Built with

TypeScript, Firebase AI Logic (firebase/ai hybrid inference), Gemini Nano (Chrome Prompt API), Gemini API (gemini-3.5-flash-lite, gemini-3.8-flash), Firebase App Check, Firebase Remote Config, Firebase Authentication, Cloud Firestore, Chrome Extensions Manifest V3 (Side Panel, Context Menus), esbuild, ts-fsrs (FSRS), pdf.js, sql.js, IndexedDB, Playwright, Node.js test runner
