# Margin demo video script (2:50, hard cap 3:00)

The owner records Margin running in Chrome and uploads the video publicly to YouTube. Use English audio or English subtitles and keep the video within three minutes.

**Record the live path** using a Firebase project config in `firebase.config.local.json`, a registered App Check debug token, and a downloaded Gemini Nano model. Keep the **DEMO MODE (simulated AI)** banner visible on any Demo mode footage and label the shot as simulated.

## Recording setup

- Chrome desktop 139+.
- Turn on `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart, and click **Enable on-device AI** if available. Wait for **On-device ready**.
- Open Options → Diagnostics before recording. Check that App Check shows **Obtainable** and **Run live hybrid test** reports `on_device` for the on-device shot. Confirm both generation routes in advance and use the actual badges in the recording.
- Keep the sensitivity check enabled for shot 3. This is the default for the Remote Config `sensitivityCheck` setting.
- Use a 1920×1080 screen at 110% browser zoom. Record the voice-over separately and review the video captions.

| # | Time | Shot | Voice-over |
|---|------|------|------------|
| 1 | 0:00–0:11 | Show a medical student's lecture notes and a long article. Cut to the Margin icon. | "For students with piles of reading, making flashcards takes time. Margin turns what you read in Chrome into cards you can review." |
| 2 | 0:11–0:30 | Highlight a paragraph, right-click, and choose **Make flashcards from selection**. Show the generated cards and expand the **On-device** badge. | "Margin uses Firebase AI Logic hybrid inference. It tries Gemini Nano on your device first for short readings and uses Gemini in the cloud when needed and allowed. This paragraph ran on my laptop. The badge tells me why." |
| 3 | 0:30–0:52 | Paste fictional study notes containing `learner@example.invalid`. Expand **Kept local** to show “Sensitive content stays on-device.” In Options, turn **Privacy mode** on and show the inference control. | "With the sensitivity check enabled, if the only signal is a pattern match and Nano is unavailable, Margin asks before sending the capture to the cloud. These notes stay local. Privacy mode requires on-device inference." |
| 4 | 0:52–1:12 | In **Options**, turn **Privacy mode** off and set **Inference mode** to **Only cloud**. Go offline, paste short nonsensitive notes, click **Generate**, and expand **Queued**. Reconnect with the side panel open, show the queue clearing, then open **Cards** to show the new cards in the selected deck. | "With Only cloud selected and no connection, Margin queues the capture. When I reconnect, it generates the cards and saves them to my deck." |
| 5 | 1:12–1:27 | Switch back to **Auto router**. Online, capture a long, nonsensitive article. Expand **Cloud** to show “This input exceeds the on-device token budget.” Show **YouTube** and **Image** in the **Source** menu. | "Long public articles can go to cloud Gemini through the same SDK. Margin can also turn YouTube captions and screenshots into cards." |
| 6 | 1:27–2:02 | Open **Review**. Type a partial answer and press Enter. Show the actual verdict, missed terms if any, and the **Graded on-device** chip. Point out the suggested rating, FSRS interval previews, and keyboard shortcuts. | "Typing an answer helps me remember it. Gemini Nano grades my answer on-device, so it stays private and works offline when Nano is ready. FSRS schedules the next review." |
| 7 | 2:02–2:22 | Open the **Cards** library: search, edit a card, move it to another deck. Options → **Export .apkg**, then import it into Anki desktop (optional cut). | "Everything is editable, and one click exports to Anki." |
| 8 | 2:22–2:40 | In **Options**, show the on-device percentage, the active routing settings, and **Diagnostics**. | "Firebase Remote Config can set routing thresholds and model names, App Check protects the cloud path, and I can see how much stayed local." |
| 9 | 2:40–2:50 | Show the logo, “Learn what you read. Privacy mode keeps every capture on-device.” and the repo URL. | "Margin. Learn what you read. Privacy mode keeps every capture on-device." |

Use the side panel's **Source** menu for PDF and YouTube captures. Read the actual FSRS intervals shown during recording.

## Demo mode instead of live inference

Keep the **DEMO MODE (simulated AI)** banner visible and add a **Simulated** caption. Use these voice-over lines in place of the live narration for the matching shots.

| Shot | Demo mode voice-over |
|------|----------------------|
| 2 | "In the live build, Firebase AI Logic prefers Gemini Nano for short, supported readings and can fall back to cloud Gemini when allowed. The on-device result shown here is simulated." |
| 3 | "With the sensitivity check enabled by default, Margin checks for sensitive patterns locally. The card result here is simulated. In the live build, Privacy mode requires on-device inference." |
| 4 | "Margin queues the capture while I’m offline, with the reason labeled ‘Simulated — ’. On reconnect, Margin saves the simulated cloud results to my deck." |
| 5 | "In the live build, long public articles can go to cloud Gemini. This cloud result is simulated. The Source menu also offers YouTube and image capture." |
| 6 | "In the live build, Gemini Nano grades my answer on-device. The grade shown here is simulated. FSRS schedules the next review." |
| 8 | "These routing stats count simulated cards. In the live build, Remote Config supplies routing settings and App Check protects the cloud path." |
