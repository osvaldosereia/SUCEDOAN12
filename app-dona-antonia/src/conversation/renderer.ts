import type { ConversationSnapshot } from './types.ts';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderConversation(snapshot: ConversationSnapshot): string {
  const messages = snapshot.messages.map((message) => {
    const roleClass = message.role === 'assistant'
      ? 'assistant-message'
      : 'user-message';
    const label = message.role === 'assistant' ? 'Ana' : 'Você';

    return `
      <div class="message ${roleClass}" data-message-id="${escapeHtml(message.id)}">
        <span class="message-author">${label}</span>
        <p>${escapeHtml(message.text)}</p>
      </div>
    `.trim();
  }).join('');

  const typing = snapshot.isTyping
    ? `
      <div class="typing-indicator" role="status" aria-label="Ana está digitando">
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <span aria-hidden="true"></span>
        <small>Ana está digitando...</small>
      </div>
    `.trim()
    : '';

  const replies = snapshot.replies.length > 0
    ? `
      <div class="quick-actions" aria-label="Respostas rápidas">
        ${snapshot.replies.map((reply) => `
          <button type="button" data-conversation-reply="${escapeHtml(reply.id)}">
            ${escapeHtml(reply.label)}
          </button>
        `).join('')}
      </div>
    `.trim()
    : '';

  return `${messages}${typing}${replies}`;
}
