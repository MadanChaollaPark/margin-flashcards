import type { FirebaseApp } from "firebase/app";
import { fetchAndActivate, getBoolean, getNumber, getRemoteConfig, getString, getValue, isSupported } from "firebase/remote-config";
import { MAX_CARDS } from "../cards/schema";

export const DEFAULTS = {
  maxOnDeviceTokens: 6_000,
  cloudModel: "gemini-3.5-flash-lite",
  longDocModel: "gemini-3.8-flash",
  sensitivityCheck: true,
  maxCardsPerChunk: 12,
};

export type RoutingConfig = typeof DEFAULTS;
type RemoteConfigResult = { config: RoutingConfig; fetched: boolean };
const TIMEOUT_MS = 1_500;
export const NANO_CONTEXT_TOKENS = 9_216;
export const NANO_OUTPUT_RESERVE = 1_500;
// The prompt and response schema also need space in the context.
export const MAX_INPUT_BUDGET = NANO_CONTEXT_TOKENS - NANO_OUTPUT_RESERVE - 1_216;

function boundedInteger(value: number, max: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 && value <= max ? value : fallback;
}

export async function loadRemoteConfig(app?: FirebaseApp): Promise<RoutingConfig> {
  return (await loadRemoteConfigStatus(app)).config;
}

export async function loadRemoteConfigStatus(app?: FirebaseApp): Promise<RemoteConfigResult> {
  const defaults = { config: { ...DEFAULTS }, fetched: false };
  if (!app) return defaults;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<RemoteConfigResult>((resolve) => {
      timer = setTimeout(() => resolve(defaults), TIMEOUT_MS);
    });
    return await Promise.race([readRemoteConfig(app), timeout]);
  } catch {
    return defaults;
  } finally {
    clearTimeout(timer);
  }
}

async function readRemoteConfig(app: FirebaseApp): Promise<RemoteConfigResult> {
  if (!await isSupported()) return { config: { ...DEFAULTS }, fetched: false };

  const remote = getRemoteConfig(app);
  remote.defaultConfig = { ...DEFAULTS };
  remote.settings.fetchTimeoutMillis = TIMEOUT_MS;
  await fetchAndActivate(remote);
  return {
    fetched: Object.keys(DEFAULTS).some((key) => getValue(remote, key).getSource() === "remote"),
    config: {
      maxOnDeviceTokens: boundedInteger(getNumber(remote, "maxOnDeviceTokens"), MAX_INPUT_BUDGET, DEFAULTS.maxOnDeviceTokens),
      cloudModel: getString(remote, "cloudModel").trim() || DEFAULTS.cloudModel,
      longDocModel: getString(remote, "longDocModel").trim() || DEFAULTS.longDocModel,
      sensitivityCheck: getBoolean(remote, "sensitivityCheck"),
      maxCardsPerChunk: boundedInteger(getNumber(remote, "maxCardsPerChunk"), MAX_CARDS, DEFAULTS.maxCardsPerChunk),
    },
  };
}
