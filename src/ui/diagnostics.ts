import { InferenceMode } from "firebase/ai";
import { getLimitedUseToken } from "firebase/app-check";
import { browserModel, FirebaseProvider } from "../ai/firebaseProvider";
import { isConfigured, shouldUseMock } from "../firebase/config";
import { initializeFirebaseAppCheck } from "../firebase/init";
import { loadRemoteConfig, loadRemoteConfigStatus, type RoutingConfig } from "../firebase/remoteConfig";
import { readSettings, type Settings } from "../storage/settings";
import { element, fillRoutingRules, message } from "./shared";

const liveTest = element<HTMLButtonElement>("run-live-test");
const liveResult = element("live-test-result");
const demoHint = "Connect a Firebase project to run a live test";
let revision = 0;
let running = false;
let demoMode = true;

function setStatus(key: string, label: string, state: "good" | "warning" | "error" | "skip") {
  const value = element(`diagnostic-${key}`);
  value.textContent = label;
  value.dataset.state = state;
}

async function withTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("The check timed out.")), milliseconds);
    });
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function showRoutingConfig(config: RoutingConfig) {
  fillRoutingRules(config);
  const labels = {
    maxOnDeviceTokens: "On-device token limit",
    cloudModel: "Cloud model",
    longDocModel: "Long-document model",
    sensitivityCheck: "Sensitivity check",
    maxCardsPerChunk: "Cards per chunk",
  };
  element("remote-config").replaceChildren(...Object.entries(config).map(([key, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = labels[key as keyof typeof labels];
    const description = document.createElement("dd");
    description.textContent = typeof value === "boolean" ? (value ? "On" : "Off") : String(value);
    row.append(term, description);
    return row;
  }));
}

export async function refreshDiagnostics(settings: Settings) {
  const current = ++revision;
  demoMode = shouldUseMock(settings.mock);
  liveTest.disabled = demoMode || running;
  liveResult.textContent = "";
  element("live-test-hint").textContent = demoMode
    ? isConfigured() ? `${demoHint}. Turn off Demo mode on this configured build.` : demoHint
    : "Uses a built-in prompt that can fall back to cloud.";

  const version = /\b(?:Headless)?Chrome\/(\d+(?:\.\d+)*)/u.exec(navigator.userAgent)?.[1];
  const supported = version !== undefined && Number(version.split(".")[0]) >= 139;
  setStatus("chrome", version ? `${version} · ${supported ? "139+" : "requires 139+"}` : "Chrome 139+ required",
    supported ? "good" : "warning");
  const model = browserModel();
  const hasPrompt = typeof model !== "undefined";
  setStatus("prompt", hasPrompt ? "Present" : "Unavailable", hasPrompt ? "good" : "warning");
  setStatus("firebase", isConfigured() ? "Present" : "Missing", isConfigured() ? "good" : "warning");
  setStatus("mode", demoMode ? "Demo" : "Live", demoMode ? "skip" : "good");
  setStatus("nano", model ? "Checking…" : "Unavailable", model ? "skip" : "warning");
  setStatus("app-check", demoMode ? "Skipped in Demo mode" : "Checking…", "skip");
  setStatus("remote-config", demoMode ? "Defaults" : "Checking…", "skip");

  const checkNano = async () => {
    if (!model) return;
    try {
      const availability = await withTimeout(model.availability(), 3_000);
      if (current === revision) setStatus("nano", availability, availability === "available" ? "good" : "warning");
    } catch {
      if (current === revision) setStatus("nano", "Check failed", "error");
    }
  };
  const nano = checkNano();
  let initialized: ReturnType<typeof initializeFirebaseAppCheck> | undefined;
  if (!demoMode) {
    try {
      // Start the token check independently of the Remote Config fetch.
      initialized = initializeFirebaseAppCheck(settings);
    } catch (error) {
      setStatus("app-check", message(error, "App Check initialization failed."), "error");
    }
  }

  await Promise.all([
    nano,
    initialized && withTimeout(getLimitedUseToken(initialized.appCheck), 5_000).then(
      () => { if (current === revision) setStatus("app-check", "Obtainable", "good"); },
      (error: unknown) => {
        if (current === revision) setStatus("app-check", message(error, "Could not obtain a limited-use token."), "error");
      },
    ),
    loadRemoteConfigStatus(initialized?.firebase).then(({ config, fetched }) => {
      if (current !== revision) return;
      setStatus("remote-config", fetched ? "Fetched" : "Defaults", fetched ? "good" : "skip");
      showRoutingConfig(config);
    }),
  ]);
}

liveTest.addEventListener("click", async () => {
  if (running || demoMode) return;
  running = liveTest.disabled = true;
  const current = revision;
  liveResult.textContent = "Running…";
  try {
    const settings = await readSettings();
    if (shouldUseMock(settings.mock)) throw new Error(demoHint);
    const app = initializeFirebaseAppCheck(settings).firebase;
    const config = await loadRemoteConfig(app);
    if (current !== revision) return;
    const provider = new FirebaseProvider(app, config);
    const started = performance.now();
    const { source } = await withTimeout(provider.generate({
      task: { kind: "sensitivity", text: "The sky is blue." },
      mode: InferenceMode.PREFER_ON_DEVICE,
      cloudModel: config.cloudModel,
      reason: "Live hybrid test",
    }), 30_000);
    if (current === revision) liveResult.textContent = `inferenceSource: ${source} · ${Math.round(performance.now() - started)} ms`;
  } catch (error) {
    if (current === revision) liveResult.textContent = message(error, "Live hybrid test failed.");
  } finally {
    if (current !== revision) liveResult.textContent = "";
    running = false;
    liveTest.disabled = demoMode;
  }
});
