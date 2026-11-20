# Project brief: hybrid-AI flashcard Chrome extension for #BuildHybridAI 2026 (Devpost)

## Hackathon facts (quoted from devpost pages, read 2026-11-20)
- Deadline: Nov 30, 2026 @ 2:00pm PST. Judging Dec 10-16. Winners ~Dec 21.
- "Using the Firebase AI Logic Hybrid Inference SDK, your app runs prompts on-device when a local model is available and falls back to the cloud when it isn't."
- Platform Web (Chrome): "Gemini Nano 4 via Firebase AI Logic. Build a web app or a Chrome extension."
- "Build a Gen AI application using Firebase AI Logic along with supported firebase products such as: AppCheck, RemoteConfig, Firestore and Authentication."
- "Firebase AI Logic requires App Check; debug tokens are accepted in submissions."
- Repo must be public GitHub/GitLab with OSS license (Apache preferred), "must demonstrate the use of Firebase AI Logic at runtime in your code — imported and actually called".
- Demo video <= 3 min on YouTube, public, English.
- No production API keys / secrets / PII in repo.
- Judging (equal weight, 1-5): Technological Implementation (how effectively uses hybrid inference), Design (complete coherent product, not PoC), Potential Impact (credible specific case, real audience), Quality of the Idea (creative, non-obvious use; understanding of problem space).
- Prizes: Grand $10k, runners up, Best Web/Chrome $3k.

## SDK facts (firebase 13.4.0, `firebase/ai`; types in research/ai-public.d.ts)
- `getAI(app, { backend: new GoogleAIBackend() })`; `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE | ONLY_ON_DEVICE | PREFER_IN_CLOUD | ONLY_IN_CLOUD, onDeviceParams?, inCloudParams?: { model: 'gemini-3.5-flash-lite' ... } })`
- Default cloud model gemini-3.5-flash-lite (also gemini-3.8-flash, gemini-4-hydrogen).
- `model.initializeDeviceModel(progress => ...)` must be called on user gesture before prompting.
- `result.response.inferenceSource` is 'on_device' | 'in_cloud'.
- On-device: single-turn text, text+image (PNG/JPEG), structured JSON output via responseSchema; max 9216 tokens. NOT on-device: PDFs, audio/video, multi-turn, tools -> falls back to cloud with PREFER_ON_DEVICE.
- On-device uses Chrome Prompt API (`LanguageModel` global), Chrome desktop 139+.
- App Check: `initializeAppCheck`, debug provider via `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`.

## Product
Chrome MV3 extension that turns anything (selection, full page, PDF in tab, YouTube transcript, image/screenshot, pasted notes) into Anki-style flashcards, with spaced repetition review (FSRS or SM-2), editing, decks, export to Anki (TSV/CSV import format and ideally .apkg).
Hybrid story: on-device Gemini Nano for private/offline/short text & images; cloud Gemini for long docs (chunk beyond token budget), PDFs, and when Nano unavailable. Visible per-card badge showing on-device vs cloud, and a privacy mode (ONLY_ON_DEVICE).
Constraints: MV3 forbids remote code -> bundle firebase with esbuild. No real Firebase project available: config is a placeholder; must ship a mock/demo mode so everything works offline in tests/screenshots. Work dir /workspace/flashcard-ext, Node 24, Playwright chromium available, google-chrome at /usr/bin/google-chrome. ~3 hours total.
