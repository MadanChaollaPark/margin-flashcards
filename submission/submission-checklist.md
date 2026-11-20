# #BuildHybridAI 2026 — submission checklist for Margin

Deadline: **Nov 30, 2026 @ 2:00pm PST** (= **Dec 1, 2026 07:00 KST**). Source: devpost overview + Official Rules §4 ("ends at 2:00 P.M. PT on Nov 30, 2026"). Commits pushed after the Submission Period ends are not evaluated (Rules §6).

Legend: ✅ ready in this folder · ⚠️ needs the user · ❌ missing

| Requirement (quoted/paraphrased from rules) | Status | Where / what to do |
|---|---|---|
| Devpost account + registered for the hackathon ("You must have a Devpost account to register") | ⚠️ | Create/sign in at devpost.com, click "Join hackathon". Check eligibility (not a resident of excluded countries; age of majority). |
| Project name, tagline | ✅ | `devpost-story.md` (Margin — "Learn what you read. Private by default, cloud when it counts.") |
| Select at least one platform | ✅ | Web (Chrome) |
| Text description incl. "how you used Firebase AI Logic, a summary of the Project's features and functionality, and a value proposition" | ✅ | `devpost-story.md` (paste sections into Devpost) |
| Built with | ✅ | `devpost-story.md` → Built with |
| Uses Firebase AI Logic hybrid inference; App Check required ("debug tokens are accepted in submissions") | ✅ code / ⚠️ project | Code: `src/ai/firebaseProvider.ts`, `src/firebase/init.ts`. User must create a Firebase project, enable AI Logic (Gemini Developer API), register the web app, paste config (see README "Connect a real Firebase project"), register the App Check debug token. |
| Public GitHub/GitLab repo with all source, assets and instructions; Firebase AI Logic imported **and called** at runtime | ⚠️ | Local git repo is ready at `/workspace/flashcard-ext` (no remote added). User must create a public repo and push. |
| Open-source license detectable in the repo About section (Apache preferred) | ✅ file / ⚠️ GitHub | `LICENSE` (Apache-2.0) at repo root; GitHub will detect it automatically. |
| No production API keys / secrets / PII in repo, form, or testing instructions | ✅ | Config is a placeholder; real config goes in git-ignored `firebase.config.local.json`. Working tree scan is clean. **Push the clean `public` branch** (single squashed commit, created locally), not `master`: early `master` history contained saved Firebase-docs HTML with Google's public page keys. Re-check: `git grep -nE "AIza[0-9A-Za-z_-]{30,}"` prints nothing. |
| Demo video ≤ 3 min, shows project functioning on Chrome, public on YouTube, English | ❌ ⚠️ | Script + shot list: `demo-video-script.md`. Must be recorded on real Chrome with Gemini Nano + a real Firebase project so both routes are real. Upload to YouTube as Public; paste link. |
| URL to the project for judging/testing (encouraged) | ⚠️ | Options: attach the zip via a GitHub Release link (`margin-extension.zip`) with install steps, or publish to Chrome Web Store (unlisted). Must be free. Testing instructions: `testing-instructions.md`. |
| Image gallery / screenshots | ✅ | `submission/screenshots/*.png` |
| Existing-app disclosure | ✅ N/A | New project built during the Submission Period. |
| Testing access free and unrestricted until judging ends | ⚠️ | Keep repo/release public through Dec 16, 2026. |

## Recommended order for the user
1. Firebase console: create project → AI Services → AI Logic → Get started (Gemini Developer API) → register Web app → copy config.
2. Put the config in `firebase.config.local.json` (git-ignored), `npm run build`, load `dist/` unpacked in Chrome 139+.
3. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart, click "Enable on-device AI" in Margin.
4. Open Margin options → copy the App Check debug token from the console log → Firebase console → App Check → Apps → Manage debug tokens → add.
5. Record the video per `demo-video-script.md`, upload to YouTube (Public).
6. Create a public GitHub repo, push, confirm the License shows in About.
7. Devpost → Enter a submission: paste story, built-with, repo URL, YouTube URL, screenshots, testing instructions; pick "Web (Chrome)"; submit before Dec 1 07:00 KST.
