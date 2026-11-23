import type { Card } from "../cards/schema";
import { db, type Database } from "../storage/db";
import type { GenerationJob } from "./provider";

export const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 30_000;
type QueueMode = "demo" | "live";

export interface QueuedJob {
  id: string;
  job: GenerationJob;
  reason: string;
  mode?: QueueMode;
  createdAt: number;
  attempts: number;
  state?: "queued" | "failed" | "confirm";
  nextAttemptAt?: number;
  lastError?: string;
}

export function queueState(entry: QueuedJob): NonNullable<QueuedJob["state"]> {
  return entry.state ?? (entry.attempts >= MAX_ATTEMPTS ? "failed" : "queued");
}

export function queuedMode(entry: QueuedJob): QueueMode {
  return entry.mode ?? (entry.reason.startsWith("Simulated — ") ? "demo" : "live");
}

export async function enqueue(job: GenerationJob, reason: string, database = db, mode?: QueueMode): Promise<QueuedJob> {
  const entry: QueuedJob = {
    id: crypto.randomUUID(), job, reason, ...(mode && { mode }), createdAt: Date.now(), attempts: 0, state: "queued",
  };
  await database.put("queue", entry);
  return entry;
}

type ProcessJob = (job: GenerationJob) => Promise<Card[] | { confirm: string } | undefined>;
type DrainContext = { process: ProcessJob; mode: QueueMode };

export async function drainQueue(
  prepare: () => DrainContext | undefined | Promise<DrainContext | undefined>,
  online: () => boolean,
  database: Database = db,
  onlyId?: string,
  now = Date.now,
): Promise<QueueMode | undefined> {
  const drain = async () => {
    if (!online()) return;
    const entries = (await database.all("queue")).filter((entry) => onlyId
      ? entry.id === onlyId
      : queueState(entry) === "queued");
    entries.sort((first, second) => first.createdAt - second.createdAt);
    let mode: QueueMode | undefined;
    for (const entry of entries) {
      if (!onlyId && (entry.nextAttemptAt ?? 0) > now()) continue;
      if (!online()) return;
      const context = await prepare();
      if (!context || !online()) return;
      mode = context.mode;
      const capturedMode = queuedMode(entry);
      if (capturedMode !== mode) {
        if (onlyId) {
          const lastError = capturedMode === "demo"
            ? "Queued in Demo mode. Turn Demo mode on to retry, or remove it."
            : "Queued in live mode. Turn Demo mode off to retry, or remove it.";
          await database.updateQueuedJob({ ...entry, lastError });
        }
        continue;
      }
      try {
        const result = await context.process(entry.job);
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
    // A pass with only delayed jobs still needs the active mode for its timer.
    if (!mode && !onlyId && online() && entries.length) return (await prepare())?.mode;
    return mode;
  };

  // Extension pages share this lock and cannot drain the same job concurrently.
  if (globalThis.navigator?.locks) return navigator.locks.request("margin-offline-queue", drain);
  return drain();
}

export function startQueueDrain(
  prepare: () => DrainContext | Promise<DrainContext>,
  onError = console.error,
  onComplete?: () => void,
  { database = db, online = () => navigator.onLine }: { database?: Database; online?: () => boolean } = {},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let setupRetryDelay = INITIAL_BACKOFF_MS;
  let stopped = false;
  let draining = false;
  // Jobs added mid-drain may have no retry timestamp to trigger another pass.
  let rerun = false;
  async function run() {
    if (stopped) return;
    if (draining) {
      rerun = true;
      return;
    }
    clearTimeout(timer);
    draining = true;
    try {
      // A new request can follow a settings change while the current pass is running.
      const active = () => !stopped && !rerun && online();
      let setupFailed = false;
      const mode = await drainQueue(async () => {
        try {
          return await prepare();
        } catch (error) {
          setupFailed = true;
          onError(error);
          return undefined;
        }
      }, active, database);
      onComplete?.();
      if (!active()) return;
      if (setupFailed) {
        // Without a resolved mode, a setup failure must leave the entries untouched.
        timer = setTimeout(drain, setupRetryDelay);
        setupRetryDelay = INITIAL_BACKOFF_MS * 2;
        return;
      }
      setupRetryDelay = INITIAL_BACKOFF_MS;
      if (!mode) return;
      const now = Date.now();
      const entries = await database.all("queue");
      const next = entries.reduce((earliest, entry) =>
        queuedMode(entry) === mode && queueState(entry) === "queued" && entry.nextAttemptAt !== undefined
          ? Math.min(earliest, entry.nextAttemptAt) : earliest, Infinity);
      if (active() && Number.isFinite(next)) timer = setTimeout(drain, Math.max(1_000, next - now));
    } catch (error) {
      onError(error);
    } finally {
      draining = false;
      if (rerun && !stopped) {
        rerun = false;
        void run();
      }
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
