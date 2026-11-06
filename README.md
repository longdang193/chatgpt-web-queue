# ChatGPT Prompt Queue

Small, local-first Chrome MV3 extension that queues prompts in ChatGPT and notifies you when the queue drains.

## Verdict review

The original recommendation is directionally correct:

- A content script plus DOM APIs is enough for an MVP; no backend or REA is required.
- The difficult part is completion detection and safe handoff between prompts, not queue CRUD.
- `chrome.storage.local` is the durable source of queue state. The content script owns the active state machine; the MV3 service worker only handles desktop notifications.
- A run must be explicit and pause on uncertainty, user input, conversation changes, or visible error states.

The referenced repositories are useful design references, not code dependencies:

- `kgruiz/chatgpt-queue`: WXT-based, conversation-scoped persistence, attachments, model controls, and keyboard-first editing. Its repository license is GPL-3.0.
- `LaNguAx/ChatGPT-Message-Queue-Extension`: TypeScript/React MV3 queue with DOM completion detection, configurable delays, retries, and tests. Its repository license is MIT.

This implementation deliberately starts smaller: prompt text only, conversation-scoped local storage, explicit Start/Pause, reorder/remove/retry/skip, and completion notification. It does not bypass usage limits or anti-automation controls.

## Development

```powershell
npm install
npm run check
```

Load `dist/` as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository's `dist` directory.
5. Open `https://chatgpt.com`, queue prompts, and press **Start**.

The queue is stored under a conversation-specific key in `chrome.storage.local`. Refreshing the page preserves the queue. Switching conversations loads the other conversation's queue and invalidates any stale in-flight run.

## Current safety behavior

- Only one prompt is sent at a time.
- A prompt is marked `sending` before DOM interaction and becomes `done` only after the stop-generation control disappears and remains absent briefly.
- Missing composer/send controls, ignored clicks, visible error toasts, and completion timeouts pause the queue and mark the item `failed`.
- If the user types into an empty composer while automation is ready, the queue pauses instead of overwriting the draft.
- When all items are `done`, the extension sends one notification through the service worker.
