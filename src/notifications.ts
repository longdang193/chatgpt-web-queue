const COMPLETION_NOTIFICATION_PREFIX = "chatgpt-queue-complete:";

export function completionNotificationId(conversationId: string): string {
  return `${COMPLETION_NOTIFICATION_PREFIX}${conversationId}`;
}

export function conversationIdFromNotificationId(notificationId: string): string | undefined {
  if (!notificationId.startsWith(COMPLETION_NOTIFICATION_PREFIX)) return undefined;
  const conversationId = notificationId.slice(COMPLETION_NOTIFICATION_PREFIX.length);
  return conversationId || undefined;
}

export function completedChatUrl(conversationId: string): string {
  return `https://chatgpt.com/c/${encodeURIComponent(conversationId)}`;
}
