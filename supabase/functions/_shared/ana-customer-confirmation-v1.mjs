const normalizeText = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const digitsOnly = value => String(value ?? '').replace(/\D/g, '');
const ADDRESS_FIELDS = new Set(['postal_code','street','number','complement','neighborhood','city','state','reference']);
const AFFIRMATIONS = new Set(['sim','confirmo','esta correto','esta correta','os dados estao corretos','isso mesmo']);

function isExplicitCorrection(text) {
  return /^(?:nao|corrigir|corrijo|corrija|esta errado|esta errada|quero corrigir|na verdade|o correto|a correta)\b/.test(text);
}

function includesDifferentDocument(text, suggestions) {
  const sequences = String(text ?? '').match(/(?:\d[.\-/ ]*){11,14}/g) || [];
  const sentDocuments = sequences.map(digitsOnly).filter(value => value.length === 11 || value.length === 14);
  if (!sentDocuments.length) return false;
  const suggestedDocuments = (Array.isArray(suggestions) ? suggestions : [])
    .filter(item => item?.field_name === 'cpf_cnpj')
    .map(item => digitsOnly(item?.normalized_value));
  return sentDocuments.some(value => suggestedDocuments.every(existing => value !== existing));
}

function includesAddressCorrection(text, suggestions) {
  if (!(Array.isArray(suggestions) ? suggestions : []).some(item => ADDRESS_FIELDS.has(String(item?.field_name || '')))) return false;
  const hasAddress = /\b(?:rua|avenida|av|travessa|alameda|bairro|cep|endereco|numero)\b/.test(text);
  const signalsCorrection = /\b(?:na verdade|correto|correta|mudou|outro|outra|errado|errada|corrigir)\b/.test(text);
  return hasAddress && signalsCorrection;
}

export function classifyCustomerConfirmation({ message, pendingRequest } = {}) {
  const none = { decision: 'none', request_id: null };
  if (!message || !pendingRequest || pendingRequest.status !== 'pending') return none;
  const requestId = String(pendingRequest.id || pendingRequest.request_id || '').trim();
  const messageId = String(message.id || '').trim();
  const conversationId = String(message.conversation_id || '').trim();
  const requestConversationId = String(pendingRequest.conversation_id || '').trim();
  if (!requestId || !messageId || !conversationId || conversationId !== requestConversationId || message.direction !== 'inbound') return none;

  const messageAt = Date.parse(message.received_at || message.created_at || '');
  const expiresAt = Date.parse(pendingRequest.expires_at || '');
  const outboundAt = Date.parse(pendingRequest.outbound_sent_at || '');
  if (!Number.isFinite(messageAt) || !Number.isFinite(expiresAt) || !Number.isFinite(outboundAt) || messageAt <= outboundAt || messageAt > expiresAt) return none;

  const text = normalizeText(message.text_body ?? message.text);
  if (!text) return none;
  const suggestions = Array.isArray(pendingRequest.suggestions) ? pendingRequest.suggestions : [];
  if (isExplicitCorrection(text) || includesDifferentDocument(message.text_body ?? message.text, suggestions) || includesAddressCorrection(text, suggestions)) {
    return { decision: 'correct', request_id: requestId };
  }
  if (AFFIRMATIONS.has(text)) return { decision: 'confirm', request_id: requestId };
  return none;
}

