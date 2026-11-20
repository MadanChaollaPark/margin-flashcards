import type { FirebaseOptions } from "firebase/app";

declare const __MARGIN_MOCK__: boolean;

declare const __MARGIN_FIREBASE_CONFIG__: FirebaseOptions;

export const firebaseConfig: FirebaseOptions =
  typeof __MARGIN_FIREBASE_CONFIG__ === "undefined" ? {} : __MARGIN_FIREBASE_CONFIG__;

export function isConfigured(config = firebaseConfig): boolean {
  return [config.apiKey, config.appId, config.projectId].every(
    (value) => !!value?.trim() && value.trim() !== "REPLACE_ME",
  );
}

export function shouldUseMock(settingsMock: boolean): boolean {
  const mockBuild = typeof __MARGIN_MOCK__ !== "undefined" && __MARGIN_MOCK__;
  return mockBuild || settingsMock || !isConfigured();
}
