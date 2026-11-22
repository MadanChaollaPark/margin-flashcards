# Testing instructions (paste into the Devpost "Testing instructions" field)

**Quick look in Demo mode**

1. If a GitHub Release has an attached `margin-extension.zip`, download and unzip it. To build from source, use Node.js 24 LTS (24.15 or newer) and run `git clone https://github.com/MadanChaollaPark/margin-flashcards && cd margin-flashcards && npm ci && npm run build`.
2. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select the unzipped folder or the built `dist/` folder.
3. From a regular browser tab, click the Margin toolbar icon and choose **Open side panel**. On first launch, look for **Welcome to Margin**. Click **Try a sample**, then **Generate**. Look for **DEMO MODE (simulated AI)** and the **Simulated · On-device** badge on the sample cards.
4. Click **Save … cards to Inbox**, open **Review**, and choose **Reveal answer**. Click **Good** to schedule the card and move to the next one.

**Live hybrid inference with Firebase AI Logic**

1. Use Chrome desktop 139 or later. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart.
2. Clone the repo and run `npm ci`. Copy `firebase.config.example.json` to `firebase.config.local.json` and fill in your Firebase web app config. The project needs AI Logic enabled with the Gemini Developer API.
3. Run `npm run build`, then load `dist/` unpacked.
4. In Margin's Options, turn **Demo mode** off. Open DevTools on the Options page and copy the App Check debug token it logs. Register it in Firebase console → App Check → Apps → Manage debug tokens. Enter the registered token under **App Check debug token** in Margin Options, save it, and reopen Margin after it reloads.
5. In the side panel, click **Enable on-device AI** if available and wait for **On-device ready**.
6. Options → Diagnostics → **Run live hybrid test**. It should report the inference source (`on_device` or `in_cloud`) and latency.

No production keys, secrets or personal data are included in the repo or this form.
