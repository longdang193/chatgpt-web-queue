import assert from "node:assert/strict";
import test from "node:test";
import { hasFailedItems, isQueueComplete, migrateStagedQueue } from "../src/queue";
import { sendWasAccepted, waitUntil } from "../src/sender";

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
