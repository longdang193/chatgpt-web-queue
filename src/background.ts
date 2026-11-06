import {
  completedChatUrl,
  completionNotificationId,
  conversationIdFromNotificationId,
} from "./notifications";

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCompletionMessage(message)) return;

  void chrome.notifications.create(completionNotificationId(message.conversationId), {
    type: "basic",
    iconUrl: "icon.svg",
    title: "ChatGPT queue complete",
    message: `${message.count} prompt${message.count === 1 ? "" : "s"} finished.`,
    priority: 0,
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  const conversationId = conversationIdFromNotificationId(notificationId);
  if (!conversationId) return;

  void openCompletedChat(conversationId, notificationId);
});

async function openCompletedChat(conversationId: string, notificationId: string): Promise<void> {
  const url = completedChatUrl(conversationId);
  const tabs = await chrome.tabs.query({
    url: ["https://chatgpt.com/c/*", "https://chat.openai.com/c/*"],
  });
  const existingTab = tabs.find((tab) => tab.url?.split("?")[0] === url);

  if (existingTab?.id !== undefined) {
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId !== undefined) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url, active: true });
  }

  await chrome.notifications.clear(notificationId);
}

function isCompletionMessage(
  message: unknown,
): message is { type: "queue-complete"; count: number; conversationId: string } {
  if (!message || typeof message !== "object") return false;
  const value = message as { type?: unknown; count?: unknown; conversationId?: unknown };
  return (
    value.type === "queue-complete" &&
    typeof value.count === "number" &&
    typeof value.conversationId === "string"
  );
}
