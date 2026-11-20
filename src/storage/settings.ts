export const inferenceModes = [
  ["auto", "Auto router"], ["prefer-device", "Prefer on-device"], ["prefer-cloud", "Prefer cloud"],
  ["only-device", "Only on-device"], ["only-cloud", "Only cloud"],
] as const;

export type ModeOverride = typeof inferenceModes[number][0];

export interface Settings {
  mock: boolean;
  privacyMode: boolean;
  modeOverride: ModeOverride;
  firestoreBackup: boolean;
  appCheckDebugToken?: string;
}

export async function readSettings(): Promise<Settings> {
  const { mock, privacyMode, modeOverride, appCheckDebugToken, firestoreBackup } = await chrome.storage.local.get<Partial<Settings>>([
    "mock", "privacyMode", "modeOverride", "appCheckDebugToken", "firestoreBackup",
  ]);
  return {
    mock: mock === true,
    privacyMode: privacyMode === true,
    firestoreBackup: firestoreBackup === true,
    modeOverride: modeOverride && inferenceModes.some(([mode]) => mode === modeOverride) ? modeOverride : "auto",
    appCheckDebugToken: typeof appCheckDebugToken === "string" ? appCheckDebugToken.trim() : undefined,
  };
}
