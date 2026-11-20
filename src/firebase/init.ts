import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { CustomProvider, initializeAppCheck, type AppCheck } from "firebase/app-check";
import type { Settings } from "../storage/settings";
import { firebaseConfig, isConfigured } from "./config";

let initialized: { firebase: FirebaseApp; appCheck: AppCheck } | undefined;

export function initializeFirebase(settings: Pick<Settings, "appCheckDebugToken">): FirebaseApp {
  return initializeFirebaseAppCheck(settings).firebase;
}

export function initializeFirebaseAppCheck(settings: Pick<Settings, "appCheckDebugToken">) {
  if (!isConfigured()) throw new Error("Add firebase.config.local.json and rebuild Margin before enabling Firebase.");

  if (!initialized) {
    const scope = self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string };
    scope.FIREBASE_APPCHECK_DEBUG_TOKEN = settings.appCheckDebugToken || true;

    const app = getApps().find(({ name }) => name === "margin") ?? initializeApp(firebaseConfig, "margin");
    const appCheck = initializeAppCheck(app, {
      // App Check bypasses this provider when a debug token is enabled.
      // A production extension needs its own token issuer for CustomProvider.
      provider: new CustomProvider({
        getToken: async () => { throw new Error("Configure an App Check token issuer for production."); },
      }),
      isTokenAutoRefreshEnabled: true,
    });
    console.info("Firebase App Check: register the debug token logged here in Firebase console > App Check > Manage debug tokens.");
    initialized = { firebase: app, appCheck };
  }
  return initialized;
}
