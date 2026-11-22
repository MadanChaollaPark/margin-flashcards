# Margin demo video script (2:50, hard cap 3:00)

The owner records Margin running in Chrome and uploads the video publicly to YouTube. Use English audio or English subtitles and keep the video within three minutes.

**Record the live path** using a Firebase project config in `firebase.config.local.json`, a registered App Check debug token, and a downloaded Gemini Nano model. Keep the **DEMO MODE (simulated AI)** banner visible on any Demo mode footage and label the shot as simulated.

## Recording setup

- Chrome desktop 139+.
- Turn on `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart, and click **Enable on-device AI** if available. Wait for **On-device ready**.
- Open Options → Diagnostics before recording. Check that App Check shows **Obtainable** and **Run live hybrid test** reports `on_device` for the on-device shot. Confirm both generation routes in advance and use the actual badges in the recording.
- Use a 1920×1080 screen at 110% browser zoom. Record the voice-over separately and review the video captions.

| # | Time | Shot | Voice-over |
|---|------|------|------------|
| 1 | 0:00–0:11 | Show a medical student's lecture notes and a long article. Cut to the Margin icon. | "For students with piles of reading, making flashcards takes time. Margin turns what you read in Chrome into cards you can review." |
| 2 | 0:11–0:30 | Highlight a paragraph, right-click, and choose **Make flashcards from selection**. Show the generated cards and expand the **On-device** badge. | "Margin uses Firebase AI Logic hybrid inference. It tries Gemini Nano on your device first for short readings and uses Gemini in the cloud when needed and allowed. This paragraph ran on my laptop. The badge tells me why." |
| 3 | 0:30–0:52 | Paste fictional study notes containing `learner@example.invalid`. Expand **Kept local** to show “Sensitive content stays on-device.” In Options, turn **Privacy mode** on and show the inference control. | "Margin checks for sensitive patterns locally and can use Gemini Nano to screen eligible text before cloud generation. These notes stay on-device. Privacy mode requires local inference for every capture." |
| 4 | 0:52–1:12 | Turn **Privacy mode** off, select **Auto router**, and go offline. Capture a long page and expand the **On-device** badge to show the chunk count. Choose a scanned PDF (`test/fixtures/scan.pdf`) and show **Queued**. Reconnect and show the queue clearing. The generated cards are saved to the selected deck. | "Offline, Nano still works and splits long text into chunks. Things that need the cloud, like a scanned PDF, wait in a queue and run when I'm back online." |
| 5 | 1:12–1:27 | Online and in **Auto router**, capture a long, nonsensitive article. Expand **Cloud** to show “This input exceeds the on-device token budget.” Show the YouTube and image choices in the **Source** menu. | "Long public articles can go to cloud Gemini through the same SDK. Margin can also turn YouTube captions and screenshots into cards." |
| 6 | 1:27–2:02 | Open **Review**. Type a partial answer and press Enter. Show the actual verdict, missed terms if any, and the **Graded on-device** chip. Point out the suggested rating, FSRS interval previews, and keyboard shortcuts. | "Typing an answer helps me remember it. Gemini Nano grades my answer on-device, so it stays private and works offline when Nano is ready. FSRS schedules the next review." |
| 7 | 2:02–2:22 | Open the **Cards** library: search, edit a card, move it to another deck. Options → **Export .apkg**, then import it into Anki desktop (optional cut). | "Everything is editable, and one click exports to Anki." |
| 8 | 2:22–2:40 | In **Options**, show the on-device percentage, the active routing settings, and **Diagnostics**. | "Firebase Remote Config can set routing thresholds and model names, App Check protects the cloud path, and I can see how much stayed local." |
| 9 | 2:40–2:50 | Logo, tagline, repo URL. | "Margin. Learn what you read: private by default, cloud when it counts." |

Use the side panel's **Source** menu for PDF and YouTube captures. Read the actual FSRS intervals shown during recording.
