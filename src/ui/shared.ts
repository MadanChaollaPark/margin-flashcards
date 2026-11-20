import { InferenceSource } from "firebase/ai";
import type { Route } from "../cards/schema";
import { shouldUseMock } from "../firebase/config";
import { NANO_OUTPUT_RESERVE, type RoutingConfig } from "../firebase/remoteConfig";
import { readSettings } from "../storage/settings";

export const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function notify(text: string, error = false): void {
  const toast = element<HTMLElement>("toast");
  toast.textContent = text;
  toast.classList.toggle("error", error);
}

export function clearNotice(): void {
  element("toast").textContent = "";
}

export function downloadFile(data: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function showDemoBanner(mock: boolean): void {
  element("demo-banner").hidden = !mock;
}

export function watchDemoBanner(): void {
  const update = () => { void readSettings().then(({ mock }) => showDemoBanner(shouldUseMock(mock))); };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.mock) update();
  });
  update();
}

export function ask(id: string, reason: string, action?: () => Promise<boolean>): Promise<boolean> {
  const dialog = element<HTMLDialogElement>(id);
  dialog.querySelector("p")!.textContent = reason;
  dialog.returnValue = "";
  return new Promise((resolve, reject) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "allow"), { once: true });
    const allow = dialog.querySelector<HTMLButtonElement>('[value="allow"]')!;
    allow.onclick = action ? (event) => {
      event.preventDefault();
      allow.disabled = true;
      void action().then((granted) => dialog.close(granted ? "allow" : "cancel"), (error) => {
        reject(error);
        dialog.close();
      }).finally(() => { allow.disabled = false; });
    } : null;
    dialog.showModal();
  });
}

export function fillRoutingRules(config: RoutingConfig): void {
  const rules = [
    ["On-device", `In Auto, Firebase prefers Gemini Nano for supported inputs up to ${config.maxOnDeviceTokens.toLocaleString()} estimated tokens, with ${NANO_OUTPUT_RESERVE.toLocaleString()} reserved for output. Firebase can fall back to cloud. Privacy mode and Only on-device require local inference.`],
    ["Cloud", `${config.cloudModel} for standard requests. ${config.longDocModel} for long text, scanned PDFs, and videos without captions. With Nano ready, long text splits into local chunks when offline, private, or set to Prefer on-device.`],
    ["Sensitive content", config.sensitivityCheck
      ? "The local sensitivity check is on. Sensitive text stays local, or asks for approval when a pattern matches and Nano is unavailable."
      : "The local sensitivity check is off. Privacy mode still requires local inference."],
    ["Offline and review", `Cloud jobs queue offline and reroute on retry. Generation allows ${config.maxCardsPerChunk} cards per chunk. Typed answers are graded on-device.`],
  ];
  element("routing-rules").replaceChildren(...rules.map(([title, description]) => {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = title;
    const detail = document.createElement("p");
    detail.textContent = description;
    item.append(name, detail);
    return item;
  }));
}
export const queueRetryHelp = "Queued jobs retry when Margin is open and you're online.";

export function routeBadge(label: string, style: string, reason: string): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "route";
  const summary = document.createElement("summary");
  summary.className = `badge ${style}`;
  summary.textContent = label;
  summary.title = reason;
  const explanation = document.createElement("p");
  explanation.className = "hint";
  explanation.textContent = reason;
  details.append(summary, explanation);
  return details;
}

export function cardRouteBadge(route?: Route): HTMLDetailsElement {
  if (!route) return routeBadge("Restored", "neutral", "Restored from a Firestore backup.");
  const local = route.source === InferenceSource.ON_DEVICE;
  const keptLocal = local && /sensitive|privacy mode|require on-device/iu.test(route.reason);
  const label = keptLocal ? "Kept local" : local ? "On-device" : "Cloud";
  return routeBadge(route.simulated ? `Simulated · ${label}` : label,
    keptLocal ? "private" : local ? "device" : "cloud", route.reason);
}

export function fillTags(list: HTMLUListElement, tags: string[] = []): void {
  list.replaceChildren(...tags.map((tag) => {
    const chip = document.createElement("li");
    chip.textContent = tag;
    return chip;
  }));
  list.hidden = !tags.length;
}
