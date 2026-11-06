import {
  findComposer,
  findSendButton,
  isGenerating,
  readComposerText,
  waitForDomChange,
} from "./dom";

export async function sendPrompt(prompt: string): Promise<void> {
  const composer = findComposer();
  if (!composer) throw new Error("composer-not-found");

  composer.focus();
  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(composer),
      "value",
    )?.set;
    setter?.call(composer, prompt);
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    composer.textContent = "";
    document.execCommand("insertText", false, prompt);
    if (!readComposerText(composer)) {
      composer.textContent = prompt;
      composer.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }),
      );
    }
  }

  if (!readComposerText(composer)) throw new Error("composer-write-failed");

  const sendButtonReady = await waitUntil(() => findSendButton() !== null, 1_000);
  const sendButton = findSendButton();
  if (!sendButtonReady || !sendButton) throw new Error("send-button-not-found");
  sendButton.click();

  const accepted = await waitUntil(
    () => {
      const currentComposer = findComposer();
      return (
        isGenerating() ||
        (currentComposer !== null &&
          sendWasAccepted(prompt, readComposerText(currentComposer), false))
      );
    },
    2_000,
  );
  if (!accepted) throw new Error("send-click-ignored");
}

export function sendWasAccepted(
  _prompt: string,
  composerText: string,
  generating: boolean,
): boolean {
  return generating || composerText.trim() === "";
}

export async function waitForCompletion(): Promise<void> {
  const idle = await waitUntil(() => !isGenerating(), 10 * 60_000);
  if (!idle) throw new Error("completion-timeout");
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (isGenerating()) return waitForCompletion();
}

export async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  if (predicate()) return true;

  const startedAt = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    let observer: MutationObserver | null = null;
    let timeoutId: number | undefined;

    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      observer?.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      resolve(result);
    };

    observer = waitForDomChange(() => {
      if (predicate()) finish(true);
    });

    const remaining = Math.max(0, timeoutMs - (Date.now() - startedAt));
    timeoutId = window.setTimeout(() => finish(predicate()), remaining);
  });
}
