import assert from "node:assert/strict";
import test from "node:test";
import { hasFailedItems, isQueueComplete, migrateStagedQueue, resetQueueState } from "../src/queue";
import { sendWasAccepted, waitUntil } from "../src/sender";
import { completedChatUrl, completionNotificationId } from "../src/notifications";
import { getQueueInputAction } from "../src/shortcuts";

test("queue input shortcuts map Shift+Enter to add and Ctrl+Shift+Enter to start", () => {
  assert.equal(
    getQueueInputAction({ key: "Enter", shiftKey: true, ctrlKey: false, metaKey: false }),
    "add",
  );
  assert.equal(
    getQueueInputAction({ key: "Enter", shiftKey: true, ctrlKey: true, metaKey: false }),
    "start",
  );
  assert.equal(
    getQueueInputAction({ key: "Enter", shiftKey: true, ctrlKey: false, metaKey: true }),
    "start",
  );
});

test("queue input keeps Ctrl+Enter as the existing add shortcut", () => {
  assert.equal(
    getQueueInputAction({ key: "Enter", shiftKey: false, ctrlKey: true, metaKey: false }),
    "add",
  );
});

test("staged queue migrates to the conversation created by its first send", () => {
  const migrated = migrateStagedQueue(
    {
      version: 1,
      conversationId: "new-chat",
      items: [
        { id: "sent", prompt: "first", status: "sending", createdAt: 1 },
        { id: "next", prompt: "second", status: "pending", createdAt: 2 },
      ],
      running: true,
      paused: false,
      delayMs: 2_000,
      completionNotified: false,
      updatedAt: 1,
    },
    "conversation-123",
  );

  assert.deepEqual(migrated?.items.map((item) => item.status), ["pending", "pending"]);
  assert.equal(migrated?.conversationId, "conversation-123");
  assert.equal(migrated?.paused, true);
});

test("a failed item prevents the queue from being complete", () => {
  const state = {
    version: 1 as const,
    conversationId: "conversation-123",
    items: [
      { id: "failed", prompt: "first", status: "failed" as const, createdAt: 1 },
      { id: "done", prompt: "second", status: "done" as const, createdAt: 2 },
    ],
    running: false,
    paused: true,
    delayMs: 2_000,
    completionNotified: false,
    updatedAt: 2,
  };

  assert.equal(isQueueComplete(state), false);
  assert.equal(hasFailedItems(state), true);
});

test("a non-empty all-done queue is complete", () => {
  const state = {
    version: 1 as const,
    conversationId: "conversation-123",
    items: [{ id: "done", prompt: "second", status: "done" as const, createdAt: 2 }],
    running: false,
    paused: false,
    delayMs: 2_000,
    completionNotified: false,
    updatedAt: 2,
  };

  assert.equal(isQueueComplete(state), true);
});

test("a fast response is accepted when ChatGPT clears the composer before Stop appears", () => {
  assert.equal(sendWasAccepted("Reply with exactly: cdp-two", "", false), true);
  assert.equal(sendWasAccepted("Reply with exactly: cdp-two", "Reply with exactly: cdp-two", false), false);
});

test("completion waits resolve from a DOM mutation before the timer fallback", async () => {
  let mutationCallback: (() => void) | undefined;
  let ready = false;
  const originalDocument = (globalThis as { document?: Document }).document;
  const originalMutationObserver = globalThis.MutationObserver;
  const originalWindow = (globalThis as { window?: Window }).window;

  class FakeMutationObserver {
    constructor(callback: () => void) {
      mutationCallback = callback;
    }

    observe(): void {}

    disconnect(): void {}
  }

  (globalThis as { document?: Document }).document = { body: {} } as Document;
  globalThis.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
  (globalThis as { window?: Window }).window = {
    setTimeout,
    clearTimeout,
  } as unknown as Window;

  try {
    const completion = waitUntil(() => ready, 5_000);
    ready = true;
    mutationCallback?.();
    assert.equal(await completion, true);
  } finally {
    (globalThis as { document?: Document }).document = originalDocument;
    globalThis.MutationObserver = originalMutationObserver;
    (globalThis as { window?: Window }).window = originalWindow;
  }
});

test("clearing a queue creates an empty queue for the same conversation", () => {
  const cleared = resetQueueState({
    version: 1,
    conversationId: "conversation-123",
    items: [
      { id: "done", prompt: "already sent", status: "done", createdAt: 1 },
      { id: "pending", prompt: "not sent", status: "pending", createdAt: 2 },
    ],
    running: true,
    paused: false,
    delayMs: 3_000,
    completionNotified: true,
    updatedAt: 3,
  });

  assert.deepEqual(cleared.items, []);
  assert.equal(cleared.conversationId, "conversation-123");
  assert.equal(cleared.running, false);
  assert.equal(cleared.paused, false);
  assert.equal(cleared.completionNotified, false);
  assert.equal(cleared.delayMs, 3_000);
});

test("completion notifications deep-link to the completed conversation", () => {
  const conversationId = "6aedd75c-2f60-83ed-b570-de2c38e4367d";

  assert.equal(
    completionNotificationId(conversationId),
    "chatgpt-queue-complete:6aedd75c-2f60-83ed-b570-de2c38e4367d",
  );
  assert.equal(
    completedChatUrl(conversationId),
    "https://chatgpt.com/c/6aedd75c-2f60-83ed-b570-de2c38e4367d",
  );
});
