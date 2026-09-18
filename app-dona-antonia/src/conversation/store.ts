import type {
  ConversationMessage,
  ConversationSnapshot,
  QuickReply,
} from './types.ts';

export interface ConversationStoreOptions {
  typingDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  idFactory?: () => string;
  now?: () => number;
}

export interface AssistantSayOptions {
  replies?: QuickReply[];
}

export interface ConversationStore {
  readonly typingDelayMs: number;
  getSnapshot(): ConversationSnapshot;
  subscribe(listener: (snapshot: ConversationSnapshot) => void): () => void;
  assistantSay(text: string, options?: AssistantSayOptions): Promise<void>;
  userDecision(replyId: string): boolean;
  setReplies(replies: QuickReply[]): void;
}

function normalizedTypingDelay(value: number | undefined): number {
  if (value === 0) return 0;
  const delay = value ?? 650;
  return Math.min(850, Math.max(450, delay));
}

export function createConversationStore(
  options: ConversationStoreOptions = {},
): ConversationStore {
  const typingDelayMs = normalizedTypingDelay(options.typingDelayMs);
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>(
    (resolve) => setTimeout(resolve, milliseconds),
  ));
  const now = options.now ?? Date.now;

  let sequence = 0;
  const idFactory = options.idFactory ?? (() => `message-${++sequence}`);
  const listeners = new Set<(snapshot: ConversationSnapshot) => void>();

  let messages: ConversationMessage[] = [];
  let replies: QuickReply[] = [];
  let isTyping = false;
  let decisionLocked = false;

  function snapshot(): ConversationSnapshot {
    return {
      messages: messages.map((message) => ({ ...message })),
      replies: replies.map((reply) => ({ ...reply })),
      isTyping,
    };
  }

  function emit(): void {
    const current = snapshot();
    for (const listener of listeners) listener(current);
  }

  function setReplies(nextReplies: QuickReply[]): void {
    replies = nextReplies.map((reply) => ({ ...reply }));
    decisionLocked = false;
    emit();
  }

  return {
    typingDelayMs,

    getSnapshot() {
      return snapshot();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async assistantSay(text, assistantOptions = {}) {
      isTyping = true;
      emit();

      await sleep(typingDelayMs);

      messages = [
        ...messages,
        {
          id: idFactory(),
          role: 'assistant',
          text,
          createdAt: now(),
        },
      ];
      replies = (assistantOptions.replies ?? []).map((reply) => ({ ...reply }));
      decisionLocked = false;
      isTyping = false;
      emit();
    },

    userDecision(replyId) {
      if (decisionLocked) return false;

      const selected = replies.find((reply) => reply.id === replyId);
      if (!selected) return false;

      decisionLocked = true;
      replies = [];
      messages = [
        ...messages,
        {
          id: idFactory(),
          role: 'user',
          text: selected.label,
          createdAt: now(),
        },
      ];
      emit();
      return true;
    },

    setReplies,
  };
}
