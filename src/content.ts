import {
  findComposer,
  findErrorMessage,
  isGenerating,
  readComposerText,
  waitForDomChange,
} from "./dom";
import {
  countPendingItems,
  hasFailedItems,
  isQueueComplete,
  nextPendingItem,
} from "./queue";
import { getConversationId, loadQueue, newQueue, removeQueue, saveQueue } from "./storage";
import { sendPrompt, waitForCompletion } from "./sender";
import type { QueueItem, QueueState } from "./types";

const PANEL_ID = "chatgpt-prompt-queue";

class QueueController {
  private state: QueueState = newQueue(getConversationId());
  private listeners = new Set<(state: QueueState) => void>();
  private pumpInFlight = false;
  private runToken = 0;
  private conversationId = this.state.conversationId;
  private observer: MutationObserver | null = null;

  async init(): Promise<void> {
    this.state = await loadQueue(this.conversationId);
    this.emit();
    this.observer = waitForDomChange(() => {
      this.checkForUserInput();
      this.checkConversation();
    });
    window.setInterval(() => this.checkConversation(), 1_000);
    void this.pump();
  }

  subscribe(listener: (state: QueueState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): QueueState {
    return this.state;
  }

  add(prompt: string): void {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const item: QueueItem = {
      id: crypto.randomUUID(),
      prompt: trimmed,
      status: "pending",
      createdAt: Date.now(),
    };
    this.update({
      items: [...this.state.items, item],
      completionNotified: false,
      paused: false,
      pauseReason: undefined,
    });
    void this.pump();
  }

  start(): void {
    this.update({ running: true, paused: false, pauseReason: undefined });
    void this.pump();
  }

  pause(reason = "paused-by-user"): void {
    this.update({ paused: true, pauseReason: reason });
  }

  retry(itemId: string): void {
    this.update({
      items: this.state.items.map((item) =>
        item.id === itemId ? { ...item, status: "pending", error: undefined } : item,
      ),
      running: true,
      paused: false,
      pauseReason: undefined,
    });
    void this.pump();
  }

  skip(itemId: string): void {
    this.update({
      items: this.state.items.map((item) =>
        item.id === itemId ? { ...item, status: "done", error: undefined } : item,
      ),
    });
    void this.pump();
  }

  remove(itemId: string): void {
    this.update({ items: this.state.items.filter((item) => item.id !== itemId) });
  }

  move(itemId: string, direction: -1 | 1): void {
    const index = this.state.items.findIndex((item) => item.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= this.state.items.length) return;
    const items = [...this.state.items];
    const [item] = items.splice(index, 1);
    if (!item) return;
    items.splice(target, 0, item);
    this.update({ items });
  }

  private async pump(): Promise<void> {
    if (this.pumpInFlight || !this.state.running || this.state.paused) return;
    const item = nextPendingItem(this.state);
    if (!item) {
      this.finishIfComplete();
      return;
    }
    if (isGenerating()) return;

    const composerText = readComposerText(findComposer());
    if (composerText) {
      this.pause("user-input-detected");
      return;
    }

    this.pumpInFlight = true;
    const runToken = this.runToken;
    this.update({
      items: this.state.items.map((entry) =>
        entry.id === item.id ? { ...entry, status: "sending", error: undefined } : entry,
      ),
    });

    try {
      await sendPrompt(item.prompt);
      await waitForCompletion();
      const currentItem = this.state.items.find((entry) => entry.id === item.id);
      if (runToken !== this.runToken || currentItem?.status !== "sending") {
        this.pumpInFlight = false;
        return;
      }
      this.update({
        items: this.state.items.map((entry) =>
          entry.id === item.id ? { ...entry, status: "done" } : entry,
        ),
      });
      await delay(this.state.delayMs);
      this.pumpInFlight = false;
      await this.pump();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown-error";
      const surfaced = findErrorMessage();
      this.update({
        items: this.state.items.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "failed", error: surfaced ?? message }
            : entry,
        ),
        running: false,
        paused: true,
        pauseReason: surfaced ?? message,
      });
      this.pumpInFlight = false;
    }
  }

  private finishIfComplete(): void {
    if (isQueueComplete(this.state) && !this.state.completionNotified) {
      this.update({ running: false, completionNotified: true });
      chrome.runtime.sendMessage({
        type: "queue-complete",
        count: this.state.items.filter((item) => item.status === "done").length,
      });
      return;
    }
    if (hasFailedItems(this.state) && this.state.running) {
      this.update({ running: false, paused: true, pauseReason: "failed-item" });
    }
  }

  private checkForUserInput(): void {
    if (!this.state.running || this.state.paused || this.pumpInFlight) return;
    if (isGenerating()) return;
    if (readComposerText(findComposer())) this.pause("user-input-detected");
  }

  private checkConversation(): void {
    const nextConversationId = getConversationId();
    if (nextConversationId === this.conversationId) return;
    const previousConversationId = this.conversationId;
    const previousState = this.state;
    this.conversationId = nextConversationId;
    this.runToken += 1;
    this.pumpInFlight = false;

    if (
      previousConversationId === "new-chat" &&
      nextConversationId !== "new-chat" &&
      previousState.items.length > 0
    ) {
      const migratedState: QueueState = {
        ...previousState,
        conversationId: nextConversationId,
        items: previousState.items.map((item) =>
          item.status === "sending" ? { ...item, status: "done" as const } : item,
        ),
        updatedAt: Date.now(),
      };
      void saveQueue(migratedState).then(() => removeQueue(previousConversationId));
      this.state = migratedState;
      this.emit();
      if (isGenerating()) {
        void waitForCompletion().then(() => this.pump());
      } else {
        void this.pump();
      }
      return;
    }

    void loadQueue(nextConversationId).then((state) => {
      this.state = state;
      this.emit();
      void this.pump();
    });
  }

  private update(patch: Partial<QueueState>): void {
    this.state = { ...this.state, ...patch, updatedAt: Date.now() };
    void saveQueue(this.state);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

function mountPanel(controller: QueueController): void {
  if (document.getElementById(PANEL_ID)) return;
  const host = document.createElement("div");
  host.id = PANEL_ID;
  const shadow = host.attachShadow({ mode: "open" });
  document.body.append(host);

  shadow.innerHTML = `
    <style>${styles}</style>
    <section class="panel" aria-label="ChatGPT prompt queue">
      <header class="header">
        <strong>Prompt queue</strong>
        <span class="count" data-count>0 pending</span>
        <button class="icon" data-toggle aria-label="Collapse queue">−</button>
      </header>
      <div class="body">
        <textarea data-input rows="3" placeholder="Queue the next prompt…"></textarea>
        <div class="actions">
          <button class="primary" data-add>Add to queue</button>
          <button data-start>Start</button>
          <button data-pause>Pause</button>
        </div>
        <div class="status" data-status>Idle</div>
        <ol data-list></ol>
      </div>
    </section>`;

  const input = shadow.querySelector<HTMLTextAreaElement>("[data-input]")!;
  const add = shadow.querySelector<HTMLButtonElement>("[data-add]")!;
  const start = shadow.querySelector<HTMLButtonElement>("[data-start]")!;
  const pause = shadow.querySelector<HTMLButtonElement>("[data-pause]")!;
  const toggle = shadow.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const body = shadow.querySelector<HTMLElement>(".body")!;
  const list = shadow.querySelector<HTMLOListElement>("[data-list]")!;
  const count = shadow.querySelector<HTMLElement>("[data-count]")!;
  const status = shadow.querySelector<HTMLElement>("[data-status]")!;

  add.addEventListener("click", () => {
    controller.add(input.value);
    input.value = "";
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      add.click();
    }
  });
  start.addEventListener("click", () => controller.start());
  pause.addEventListener("click", () => controller.pause());
  toggle.addEventListener("click", () => {
    body.hidden = !body.hidden;
    toggle.textContent = body.hidden ? "+" : "−";
  });

  controller.subscribe((state) => {
    const pending = countPendingItems(state);
    count.textContent = `${pending} pending`;
    start.disabled = state.running && !state.paused;
    pause.disabled = !state.running || state.paused;
    status.textContent = state.paused
      ? `Paused: ${state.pauseReason ?? "manual"}`
      : state.running
        ? "Running"
        : pending === 0 && state.items.length > 0
          ? "Complete"
          : "Idle";
    list.replaceChildren(...state.items.map((item) => renderItem(item, controller)));
  });
}

function renderItem(item: QueueItem, controller: QueueController): HTMLLIElement {
  const row = document.createElement("li");
  row.className = `item ${item.status}`;
  const text = document.createElement("span");
  text.textContent = item.prompt;
  const meta = document.createElement("small");
  meta.textContent = item.error ? `${item.status}: ${item.error}` : item.status;
  const controls = document.createElement("span");
  controls.className = "item-controls";
  for (const [label, action] of [
    ["↑", () => controller.move(item.id, -1)],
    ["↓", () => controller.move(item.id, 1)],
    ["Retry", () => controller.retry(item.id)],
    ["Skip", () => controller.skip(item.id)],
    ["×", () => controller.remove(item.id)],
  ] as const) {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", action);
    controls.append(button);
  }
  row.append(text, meta, controls);
  return row;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const styles = `
:host { all: initial; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.panel { position: fixed; z-index: 2147483647; right: 20px; bottom: 20px; width: 360px; color: #f7f7f8; background: #202123; border: 1px solid #4b4d50; border-radius: 14px; box-shadow: 0 12px 40px #0008; overflow: hidden; }
.header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: #2a2b32; }
.header strong { font-size: 14px; }
.count, .status, small { color: #a7a7ad; font-size: 11px; }
.count { margin-left: auto; }
.body { padding: 12px; }
textarea { box-sizing: border-box; width: 100%; resize: vertical; color: inherit; background: #343541; border: 1px solid #565869; border-radius: 8px; padding: 9px; font: inherit; font-size: 13px; }
button { color: inherit; background: #343541; border: 1px solid #565869; border-radius: 7px; padding: 6px 9px; cursor: pointer; font: inherit; font-size: 12px; }
button:hover:not(:disabled) { background: #454654; }
button:disabled { cursor: default; opacity: .45; }
.primary { color: white; background: #10a37f; border-color: #10a37f; }
.icon { border: 0; padding: 0 4px; margin-left: 4px; font-size: 17px; line-height: 1; }
.actions { display: flex; gap: 6px; margin-top: 8px; }
.status { margin-top: 9px; }
ol { display: flex; flex-direction: column; gap: 7px; padding: 0; margin: 10px 0 0; list-style: none; max-height: 260px; overflow: auto; }
.item { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; padding: 9px; border-radius: 8px; background: #2a2b32; font-size: 12px; }
.item > span:first-child { white-space: pre-wrap; overflow-wrap: anywhere; }
.item small { grid-column: 1; }
.item-controls { grid-column: 2; grid-row: 1 / span 2; display: flex; flex-wrap: wrap; gap: 3px; justify-content: end; align-content: center; }
.item-controls button { padding: 3px 5px; font-size: 10px; }
.sending { outline: 1px solid #f5c451; }
.done { opacity: .65; }
.failed { outline: 1px solid #ef6b73; }
`;

const controller = new QueueController();
void controller.init().then(() => mountPanel(controller));
