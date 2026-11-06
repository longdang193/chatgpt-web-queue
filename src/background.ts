chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCompletionMessage(message)) return;

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.svg",
    title: "ChatGPT queue complete",
    message: `${message.count} prompt${message.count === 1 ? "" : "s"} finished.`,
    priority: 0,
  });
});

function isCompletionMessage(
  message: unknown,
): message is { type: "queue-complete"; count: number } {
  if (!message || typeof message !== "object") return false;
  const value = message as { type?: unknown; count?: unknown };
  return value.type === "queue-complete" && typeof value.count === "number";
}
