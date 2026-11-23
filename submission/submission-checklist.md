# #BuildHybridAI 2026 — submission checklist for Margin

Deadline: **Nov 30, 2026 @ 2:00pm PST** (= **Dec 1, 2026 07:00 KST**). Source: devpost overview + Official Rules §4 ("ends at 2:00 P.M. PT on Nov 30, 2026"). Commits pushed after the Submission Period ends are not evaluated (Rules §6).

Legend: ✅ ready in this folder · ⚠️ needs the user · ❌ missing

| Requirement (quoted/paraphrased from rules) | Status | Where / what to do |
|---|---|---|
| Devpost account + registered for the hackathon ("You must have a Devpost account to register") | ⚠️ | Create/sign in at devpost.com, click "Join hackathon". Check eligibility (not a resident of excluded countries; age of majority). |
| Project name, tagline | ✅ | `devpost-story.md` (Margin — "Learn what you read. Privacy mode keeps every capture on-device.") |
| Select at least one platform | ✅ | Web (Chrome) |
| Text description incl. "how you used Firebase AI Logic, a summary of the Project's features and functionality, and a value proposition" | ✅ | `devpost-story.md` (paste sections into Devpost) |
| Built with | ✅ | `devpost-story.md` → Built with |
| Uses Firebase AI Logic hybrid inference; App Check required ("debug tokens are accepted in submissions") | ✅ code / ⚠️ project | Code: `src/ai/firebaseProvider.ts`, `src/firebase/init.ts`. User must create a Firebase project, enable AI Logic (Gemini Developer API), register the web app, paste config (see README "Connect a real Firebase project"), register the App Check debug token. |
| Public GitHub/GitLab repo with all source, assets and instructions; Firebase AI Logic imported and called at runtime | ⚠️ | Git remote is `MadanChaollaPark/margin-flashcards`, branch `main`. The driver handles commits, tags and pushes. The owner verifies public access before submission. |
| Open-source license detectable in the repo About section (Apache preferred) | ✅ file / ⚠️ owner | `LICENSE` (Apache-2.0) is at the repo root. The owner verifies that GitHub shows it in About. |
| No production API keys / secrets / PII in repo, form, or testing instructions | ✅ | The example Firebase config contains placeholders. Keep real config in the Git-ignored `firebase.config.local.json` and run the secret scan before pushing. |
| Demo video ≤ 3 min, shows project functioning on Chrome, public on YouTube, English | ⚠️ | The script and shot list are in `demo-video-script.md`. The owner records the live path, uploads the video publicly to YouTube and adds the link to Devpost. |
| URL to the project for judging/testing (encouraged) | ⚠️ | Link to the public repository and include `testing-instructions.md`. A GitHub Release can optionally provide `margin-extension.zip`. |
| Image gallery / screenshots | ✅ | `submission/screenshots/*.png` were regenerated on 2026-11-23, including `cover.png` with the updated tagline. |
| Existing-app disclosure | ✅ N/A | New project built during the Submission Period. |
| Testing access free and unrestricted until judging ends | ⚠️ | Keep repo/release public through Dec 16, 2026. |

## Owner steps
1. Firebase console: create project → AI Services → AI Logic → Get started (Gemini Developer API) → register Web app → copy config.
2. Put the config in `firebase.config.local.json` (git-ignored), `npm run build`, load `dist/` unpacked in Chrome 139+.
3. Enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart, click "Enable on-device AI" in Margin.
4. Open Margin options → copy the App Check debug token from the console log → Firebase console → App Check → Apps → Manage debug tokens → add.
5. Follow `testing-instructions.md` in Chrome and verify the capture flow in the native side panel.
6. Record the video per `demo-video-script.md`, upload to YouTube (Public).
7. Verify that `main` is public on `MadanChaollaPark/margin-flashcards` and that the license appears in About.
8. On Devpost, enter the story, Built with list, repository and YouTube links, screenshots and testing instructions. Pick "Web (Chrome)" and submit before Dec 1 at 07:00 KST.
