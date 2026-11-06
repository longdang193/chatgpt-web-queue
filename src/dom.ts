const COMPOSER_SELECTORS = [
  "textarea[data-id=\"root\"]",
  "textarea[placeholder*='Message']",
  "div[contenteditable='true'][data-composer-markdown]",
  "div[contenteditable='true'][data-virtualkeyboard='true']",
  "div[contenteditable='true'][aria-label*='Ask ChatGPT']",
  "div[contenteditable='true'][role='textbox']",
];

const SEND_SELECTORS = [
  "button[data-testid='send-button']",
  "button[aria-label='Send prompt']",
  "button[aria-label='Send message']",
  "button[aria-label='Send']",
];

const STOP_SELECTORS = [
  "button[data-testid='stop-button']",
  "button[aria-label='Stop generating']",
  "button[aria-label='Stop streaming']",
  "button[aria-label='Stop']",
];

const ERROR_SELECTORS = [
  "[role='alert']",
  "[data-testid*='error']",
  "[class*='toast']",
];

export function findComposer(): HTMLElement | null {
  for (const selector of COMPOSER_SELECTORS) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisible);
    const element = selectComposer(elements);
    if (element) return element;
  }
  return null;
}

export function selectComposer(elements: HTMLElement[]): HTMLElement | null {
  return (
    elements.find(
      (element) =>
        element.hasAttribute("data-composer-markdown") ||
        element.hasAttribute("data-virtualkeyboard") ||
        /ask chatgpt/i.test(element.getAttribute("aria-label") ?? ""),
    ) ?? elements.at(-1) ?? null
  );
}

export function findSendButton(): HTMLButtonElement | null {
  for (const selector of SEND_SELECTORS) {
    const element = document.querySelector<HTMLButtonElement>(selector);
    if (element && isVisible(element) && !element.disabled) return element;
  }
  return null;
}

export function isGenerating(): boolean {
  return STOP_SELECTORS.some((selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    return element !== null && isVisible(element);
  });
}

export function findErrorMessage(): string | null {
  for (const selector of ERROR_SELECTORS) {
    const elements = document.querySelectorAll<HTMLElement>(selector);
    for (const element of elements) {
      const text = element.innerText.trim();
      if (text && /error|rate.?limit|usage cap|try again|network/i.test(text)) {
        return text.slice(0, 240);
      }
    }
  }
  return null;
}

export function readComposerText(element = findComposer()): string {
  if (!element) return "";
  return ("value" in element ? String(element.value) : element.innerText).trim();
}

export function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

export function waitForDomChange(callback: () => void): MutationObserver {
  const observer = new MutationObserver(callback);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  return observer;
}
