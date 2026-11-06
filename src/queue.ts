import type { QueueItem, QueueState } from "./types";

export const DEFAULT_DELAY_MS = 2_000;

export function createQueueState(conversationId: string): QueueState {
  return {
    version: 1,
    conversationId,
    items: [],
    running: false,
    paused: false,
    delayMs: DEFAULT_DELAY_MS,
    completionNotified: false,
    updatedAt: Date.now(),
  };
}

export function resetQueueState(state: QueueState): QueueState {
  return {
    ...createQueueState(state.conversationId),
    delayMs: state.delayMs,
  };
}

export function normalizeQueueState(
  value: unknown,
  conversationId: string,
): QueueState {
  if (!value || typeof value !== "object") {
    return createQueueState(conversationId);
  }

  const candidate = value as Partial<QueueState>;
  const rawItems = Array.isArray(candidate.items)
    ? candidate.items.filter(isQueueItem).map((item) => ({ ...item }))
    : [];
  const recoveredSending = rawItems.some((item) => item.status === "sending");
  const items = rawItems.map((item) =>
    item.status === "sending"
      ? { ...item, status: "pending" as const, error: item.error ?? "recovered-after-refresh" }
      : item,
  );

  return {
    version: 1,
    conversationId,
    items,
    running: candidate.running === true && !recoveredSending,
    paused: candidate.paused === true || recoveredSending,
    pauseReason:
      typeof candidate.pauseReason === "string"
        ? candidate.pauseReason
        : recoveredSending
          ? "recovered-after-refresh"
          : undefined,
    delayMs:
      typeof candidate.delayMs === "number" && candidate.delayMs >= 0
        ? Math.min(candidate.delayMs, 60_000)
        : DEFAULT_DELAY_MS,
    completionNotified: candidate.completionNotified === true,
    updatedAt: Date.now(),
  };
}

export function nextPendingItem(state: QueueState): QueueItem | undefined {
  return state.items.find((item) => item.status === "pending");
}

export function isQueueComplete(state: QueueState): boolean {
  return state.items.length > 0 && state.items.every((item) => item.status === "done");
}

export function hasFailedItems(state: QueueState): boolean {
  return state.items.some((item) => item.status === "failed");
}

export function migrateStagedQueue(
  value: unknown,
  conversationId: string,
): QueueState | undefined {
  if (conversationId === "new-chat") return undefined;
  const staged = normalizeQueueState(value, "new-chat");
  if (staged.items.length === 0) return undefined;
  return { ...staged, conversationId, updatedAt: Date.now() };
}

export function countPendingItems(state: QueueState): number {
  return state.items.filter((item) => item.status === "pending").length;
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<QueueItem>;
  return (
    typeof item.id === "string" &&
    typeof item.prompt === "string" &&
    typeof item.createdAt === "number" &&
    (item.status === "pending" ||
      item.status === "sending" ||
      item.status === "done" ||
      item.status === "failed")
  );
}
