export type QueueInputAction = "add" | "start";

export interface QueueInputKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function getQueueInputAction(event: QueueInputKeyEvent): QueueInputAction | undefined {
  if (event.key !== "Enter") return undefined;
  if (event.ctrlKey || event.metaKey) return event.shiftKey ? "start" : "add";
  return event.shiftKey ? "add" : undefined;
}
