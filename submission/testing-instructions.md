# Testing instructions (paste into the Devpost "Testing instructions" field)

**Quick look, no setup needed (Demo mode):**
1. Download `margin-extension.zip` from the repo's latest GitHub Release and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
3. Click the Margin toolbar icon, then **Open side panel**, then **Try a sample**, then **Generate**. Save the cards, then open **Review**.
4. Without a Firebase project, Margin runs in **Demo mode**: every AI result is simulated and labeled "Simulated". Demo mode is for trying the UI and flow only.

**Live hybrid inference (Firebase AI Logic):**
1. Use Chrome desktop 139 or later. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart.
2. Clone the repo and run `npm ci`. Copy `firebase.config.example.json` to `firebase.config.local.json` and fill in your Firebase web app config. The project needs AI Logic enabled with the Gemini Developer API.
3. Run `npm run build`, then load `dist/` unpacked.
4. In Margin's Options, turn **Demo mode** off. Open DevTools on the Options page and copy the App Check debug token it logs. Register it in Firebase console → App Check → Apps → Manage debug tokens.
5. In the side panel, click **Enable on-device AI** and wait for Gemini Nano to finish downloading.
6. Options → Diagnostics → **Run live hybrid test**. It should report the inference source (`on_device` or `in_cloud`) and latency.

No production keys, secrets or personal data are included in the repo or this form.
