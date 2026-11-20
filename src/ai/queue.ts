import type { Card } from "../cards/schema";
import { db, type Database } from "../storage/db";
import type { GenerationJob } from "./provider";

export const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 30_000;

export interface QueuedJob {
  id: string;
  job: GenerationJob;
  reason: string;
  createdAt: number;
  attempts: number;
  state?: "queued" | "failed" | "confirm";
  nextAttemptAt?: number;
  lastError?: string;
}

export function queueState(entry: QueuedJob): NonNullable<QueuedJob["state"]> {
  return entry.state ?? (entry.attempts >= MAX_ATTEMPTS ? "failed" : "queued");
}

export async function enqueue(job: GenerationJob, reason: string, database = db): Promise<QueuedJob> {
  const entry: QueuedJob = { id: crypto.randomUUID(), job, reason, createdAt: Date.now(), attempts: 0, state: "queued" };
  await database.put("queue", entry);
  return entry;
}

type ProcessJob = (job: GenerationJob) => Promise<Card[] | { confirm: string } | undefined>;

export async function drainQueue(
  process: ProcessJob,
  online: () => boolean,
  database: Database = db,
  onlyId?: string,
  now = Date.now,
): Promise<void> {
  const drain = async () => {
    if (!online()) return;
    const entries = (await database.all("queue")).filter((entry) => onlyId
      ? entry.id === onlyId
      : queueState(entry) === "queued" && (entry.nextAttemptAt ?? 0) <= now());
    entries.sort((first, second) => first.createdAt - second.createdAt);
    for (const entry of entries) {
      if (!online()) break;
      try {
        const result = await process(entry.job);
        if (result === undefined) continue;
        if (Array.isArray(result)) await database.completeQueuedJob(entry.id, result);
        else await database.updateQueuedJob({ ...entry, state: "confirm", lastError: result.confirm });
      } catch (error) {
        const attempts = (queueState(entry) === "failed" ? 0 : entry.attempts) + 1;
        const state = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
        await database.updateQueuedJob({
          ...entry, attempts, state,
          nextAttemptAt: state === "queued" ? now() + INITIAL_BACKOFF_MS * 2 ** (attempts - 1) : undefined,
          lastError: error instanceof Error ? error.message : "Generation failed.",
        });
      }
    }
  };

  // Extension pages share this lock and cannot drain the same job concurrently.
  if (globalThis.navigator?.locks) await navigator.locks.request("margin-offline-queue", drain);
  else await drain();
}

export function startQueueDrain(process: ProcessJob, onError = console.error, onComplete?: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let draining = false;
  async function run() {
    if (stopped || draining) return;
    clearTimeout(timer);
    draining = true;
    try {
      await drainQueue(process, () => navigator.onLine);
      onComplete?.();
      if (stopped || !navigator.onLine) return;
      const now = Date.now();
      const entries = await db.all("queue");
      const next = entries.reduce((earliest, entry) =>
        queueState(entry) === "queued" && entry.nextAttemptAt !== undefined
          ? Math.min(earliest, entry.nextAttemptAt) : earliest, Infinity);
      if (!stopped && Number.isFinite(next)) timer = setTimeout(drain, Math.max(1_000, next - now));
    } catch (error) {
      onError(error);
    } finally {
      draining = false;
    }
  }
  const drain = () => { void run(); };
  drain();
  return {
    drain,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
