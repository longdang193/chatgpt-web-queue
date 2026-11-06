export type QueueItemStatus = "pending" | "sending" | "done" | "failed";

export interface QueueItem {
  id: string;
  prompt: string;
  status: QueueItemStatus;
  error?: string;
  createdAt: number;
}

export interface QueueState {
  version: 1;
  conversationId: string;
  items: QueueItem[];
  running: boolean;
  paused: boolean;
  pauseReason?: string;
  delayMs: number;
  completionNotified: boolean;
  updatedAt: number;
}
