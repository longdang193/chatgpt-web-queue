import { createQueueState, migrateStagedQueue, normalizeQueueState } from "./queue";
import type { QueueState } from "./types";

const STORAGE_PREFIX = "queue:";

export function getConversationId(): string {
  const match = window.location.pathname.match(/\/c\/([^/]+)/);
  return match?.[1] ?? "new-chat";
}

export async function loadQueue(conversationId: string): Promise<QueueState> {
  const key = storageKey(conversationId);
  const stagingKey = storageKey("new-chat");
  const result = await chrome.storage.local.get([key, stagingKey]);
  if (conversationId !== "new-chat" && result[key] === undefined && result[stagingKey] !== undefined) {
    const migrated = migrateStagedQueue(result[stagingKey], conversationId);
    if (migrated) {
      await chrome.storage.local.set({ [key]: migrated });
      await chrome.storage.local.remove(stagingKey);
      return migrated;
    }
  }
  return normalizeQueueState(result[key], conversationId);
}

export async function saveQueue(state: QueueState): Promise<void> {
  await chrome.storage.local.set({
    [storageKey(state.conversationId)]: {
      ...state,
      updatedAt: Date.now(),
    },
  });
}

export async function removeQueue(conversationId: string): Promise<void> {
  await chrome.storage.local.remove(storageKey(conversationId));
}

export function newQueue(conversationId: string): QueueState {
  return createQueueState(conversationId);
}

function storageKey(conversationId: string): string {
  return `${STORAGE_PREFIX}${conversationId}`;
}
