import type { Card } from "./schema";

export function cardStats(cards: Card[]) {
  const local = cards.filter((card) => card.route?.source === "on_device");
  const cloudCount = cards.filter((card) => card.route?.source === "in_cloud").length;
  const total = local.length + cloudCount;
  const runs = new Map<string, number>();
  for (const card of local) {
    if (card.route?.localBytes) runs.set(card.route.runId ?? card.id, card.route.localBytes);
  }
  return {
    onDeviceCount: local.length,
    cloudCount,
    onDevicePercent: total ? Math.round(local.length / total * 100) : 0,
    localBytes: [...runs.values()].reduce((sum, bytes) => sum + bytes, 0),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
