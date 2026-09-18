export type ConversationRole = 'assistant' | 'user';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  text: string;
  createdAt: number;
}

export interface QuickReply {
  id: string;
  label: string;
}

export interface ConversationSnapshot {
  messages: ConversationMessage[];
  replies: QuickReply[];
  isTyping: boolean;
}
