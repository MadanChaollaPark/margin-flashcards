# Margin: demo video script (target 2:45, hard cap 3:00)

**Rules recap:** the video must be ≤ 3 min, show the project working on Chrome, be uploaded publicly to YouTube, and be in English or have English subtitles.

**Important:** record the live path. That means a Firebase project config in `firebase.config.local.json`, a registered App Check debug token, and Gemini Nano downloaded. The **DEMO MODE** banner must NOT be visible. If any shot has to use Demo mode, label it on screen as simulated.

**Setup:**
- Chrome desktop 139+.
- Turn on `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart, and click **Enable on-device AI** in Margin until it shows ready.
- Open Options → Diagnostics before recording. Every row should be green, and "Run live hybrid test" should report `on_device`.
- Screen 1920×1080, browser zoom 110%. Record the voice-over separately, then fix YouTube's auto-captions.

| # | Time | Shot | Voice-over |
|---|------|------|------------|
| 1 | 0:00–0:12 | Med-student framing: lecture notes and a long article on screen. Cut to the Margin icon. | "I read a lot to learn, and a week later most of it is gone. Spaced repetition works, but writing cards takes forever. And my notes are private." |
| 2 | 0:12–0:32 | Highlight a paragraph, right-click, choose **Make flashcards from selection**. The side panel opens and the cards appear. Expand the green **On-device** badge: "Fits on-device budget". | "Select anything, right-click, and Margin writes atomic flashcards. Firebase AI Logic preferred Gemini Nano here, so this ran on my laptop. The badge tells me where it ran and why." |
| 3 | 0:32–0:52 | Paste case notes with an email address or patient details. The badge shows **Kept local**, reason "Sensitive content stays on-device." Then open Options and flip **Privacy mode** on. | "Before anything can go to the cloud, a local check and Gemini Nano screen the text. Sensitive notes stay on-device. Privacy mode makes that the rule for everything." |
| 4 | 0:52–1:12 | Turn Wi-Fi off. Capture a long page: "Offline. Gemini Nano can process this on-device. Split into N on-device chunks." Then pick a scanned PDF (`test/fixtures/scan.pdf`) and it shows **Queued**. Wi-Fi back on: the queue drains and a blue **Cloud** badge reads "PDFs without enough extractable text require cloud inference." | "Offline, Nano still works and splits long text into chunks. Things that really need the cloud, like a scanned PDF, wait in a queue and run when I'm back online." |
| 5 | 1:12–1:27 | Online, with privacy mode off: capture a long, non-sensitive article. Badge **Cloud**, reason "This input exceeds the on-device token budget." Quick flash of the YouTube source and the screenshot source. | "Long public articles go to cloud Gemini through the same SDK. YouTube captions and screenshots work too." |
| 6 | 1:27–2:02 | Open Review. Type a partial answer and press Enter. Amber **Partly correct** with "Missing: …", plus a **Graded on-device** chip. The suggested **Hard** button is highlighted. Show FSRS interval previews and the keyboard shortcuts. | "Typing an answer helps me remember it. Gemini Nano grades my answer on-device, so it stays private and works on a plane. FSRS schedules the next review." |
| 7 | 2:02–2:22 | Open the **Cards** library: search, edit a card, move it to another deck. Options → **Export .apkg**, then import it into Anki desktop (optional cut). | "Everything is editable, and one click exports to Anki." |
| 8 | 2:22–2:40 | Options: on-device % stat, the AI routing rules with Remote Config values, and the Diagnostics card (App Check ✓, Prompt API ✓). | "Routing thresholds and model names come from Remote Config, App Check protects the cloud path, and I can always see how much stayed local." |
| 9 | 2:40–2:50 | Logo, tagline, repo URL. | "Margin. Learn what you read: private by default, cloud when it counts." |

**Don't claim things the build doesn't do:**
- Cards appear all at once; they don't stream.
- There are no PDF or YouTube context-menu items. Those sources live in the side panel's Source picker.
- Intervals come from FSRS, so read them off the screen.
