import { APP_CONFIG, firebaseNodeUrl } from '../shared/config.js';
import { assertExternalWriteAllowed, environmentSnapshot } from '../shared/environment.js';
import { formatWhatsAppMessage } from '../shared/order-delivery.js';
import { saveHomologationOrder } from './firebase-homologation-order-adapter.js';

const STORAGE_KEY = `${APP_CONFIG.cache.namespace}:order-dispatch-sessions`;
const CHANNEL_ORDER = Object.freeze(['whatsapp', 'firebase', 'make']);

export const DISPATCH_STATUS = Object.freeze({
  PREPARED: 'prepared',
  WAITING_WHATSAPP: 'waiting_whatsapp',
  WHATSAPP_OPENED: 'whatsapp_opened',
  BLOCKED: 'blocked',
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error'
});

function text(value) {
  return String(value ?? '').trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function now() {
  return new Date().toISOString();
}

function readSessionsMutable() {
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY) || '[]', []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 100)));
}

function channelState(status, detail = '', attempts = 0) {
  return { status, detail: text(detail), attempts, updatedAt: now() };
}

export function validateDispatchEnvelope(envelope = {}) {
  const errors = [];
  if (!text(envelope.id)) errors.push('Pedido sem identificador de envelope.');
  if (!text(envelope.fingerprint)) errors.push('Pedido sem impressão de idempotência.');
  if (envelope.ambiente !== 'homologation') errors.push('Somente pedidos de homologação são aceitos nesta etapa.');
  if (!envelope.order || typeof envelope.order !== 'object') errors.push('Payload do pedido ausente.');
  if (!Array.isArray(envelope.order?.itens) || envelope.order.itens.length === 0) errors.push('Pedido sem itens.');
  if (!text(envelope.order?.cliente?.telefone)) errors.push('Telefone do cliente ausente.');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function buildWhatsAppUrl(envelope) {
  const validation = validateDispatchEnvelope(envelope);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const number = text(APP_CONFIG.commerce.whatsappNumber).replace(/\D/g, '');
  if (!number) throw new Error('Número do WhatsApp não configurado.');
  const message = formatWhatsAppMessage(envelope.order);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function buildDispatchPlan(envelope) {
  const validation = validateDispatchEnvelope(envelope);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  const config = APP_CONFIG.integrations.orderDispatch;
  const firebasePath = `${APP_CONFIG.firebase.nodes.homologationOrders}/${envelope.id}`;

  return Object.freeze({
    envelopeId: envelope.id,
    fingerprint: envelope.fingerprint,
    environment: environmentSnapshot(),
    sequence: CHANNEL_ORDER,
    channels: Object.freeze({
      whatsapp: Object.freeze({
        order: 1,
        mode: 'manual_preview',
        enabled: config.whatsappPreviewEnabled === true,
        url: config.whatsappPreviewEnabled ? buildWhatsAppUrl(envelope) : '',
        message: formatWhatsAppMessage(envelope.order)
      }),
      firebase: Object.freeze({
        order: 2,
        mode: 'homologation_external_write',
        enabled: config.firebaseWriteEnabled === true,
        path: firebasePath,
        url: firebaseNodeUrl(firebasePath),
        productionPathBlocked: true
      }),
      make: Object.freeze({
        order: 3,
        mode: 'external_write',
        enabled: config.makeWriteEnabled === true && Boolean(text(config.makeWebhookUrl)),
        endpointConfigured: Boolean(text(config.makeWebhookUrl))
      })
    })
  });
}

export function prepareDispatchSession(envelope) {
  const plan = buildDispatchPlan(envelope);
  const sessions = readSessionsMutable();
  const previous = sessions.find(item => item?.fingerprint === envelope.fingerprint);
  if (previous) return Object.freeze({ session: Object.freeze(previous), duplicate: true, created: false });

  const createdAt = now();
  const session = {
    id: `dispatch_${envelope.id}`,
    envelopeId: envelope.id,
    fingerprint: envelope.fingerprint,
    createdAt,
    updatedAt: createdAt,
    status: DISPATCH_STATUS.WAITING_WHATSAPP,
    plan: clone(plan),
    envelope: clone(envelope),
    channels: {
      whatsapp: channelState(DISPATCH_STATUS.PREPARED, 'Mensagem preparada para abertura manual.'),
      firebase: channelState(DISPATCH_STATUS.BLOCKED, `Escrita bloqueada em ${APP_CONFIG.firebase.nodes.homologationOrders}.`),
      make: channelState(DISPATCH_STATUS.BLOCKED, 'Envio ao Make bloqueado na homologação.')
    },
    history: [{ at: createdAt, action: 'dispatch_prepared', status: DISPATCH_STATUS.WAITING_WHATSAPP }]
  };
  writeSessions([session, ...sessions]);
  return Object.freeze({ session: Object.freeze(session), duplicate: false, created: true });
}

export function readDispatchSessions() {
  return Object.freeze(readSessionsMutable().map(item => Object.freeze(item)));
}

export function findDispatchSession(envelopeId) {
  return readDispatchSessions().find(item => item.envelopeId === text(envelopeId)) || null;
}

function replaceSession(next) {
  const sessions = readSessionsMutable();
  writeSessions([next, ...sessions.filter(item => item?.id !== next.id)]);
  return Object.freeze(next);
}

export function markWhatsAppOpened(envelopeId) {
  const session = findDispatchSession(envelopeId);
  if (!session) throw new Error('Sessão de despacho não encontrada.');
  const updatedAt = now();
  return replaceSession({
    ...clone(session),
    updatedAt,
    status: DISPATCH_STATUS.WHATSAPP_OPENED,
    channels: {
      ...clone(session.channels),
      whatsapp: channelState(DISPATCH_STATUS.WHATSAPP_OPENED, 'Abertura manual registrada localmente.', Number(session.channels?.whatsapp?.attempts || 0) + 1)
    },
    history: [{ at: updatedAt, action: 'whatsapp_opened', status: DISPATCH_STATUS.WHATSAPP_OPENED }, ...(session.history || [])].slice(0, 50)
  });
}

export function registerChannelResult(envelopeId, channel, result = {}) {
  if (!CHANNEL_ORDER.includes(channel)) throw new Error('Canal de despacho inválido.');
  const session = findDispatchSession(envelopeId);
  if (!session) throw new Error('Sessão de despacho não encontrada.');
  const updatedAt = now();
  const success = result.success === true;
  const nextChannel = channelState(
    success ? DISPATCH_STATUS.SUCCESS : DISPATCH_STATUS.ERROR,
    result.detail || result.error || (success ? 'Concluído.' : 'Falha sem detalhe.'),
    Number(session.channels?.[channel]?.attempts || 0) + 1
  );
  const channels = { ...clone(session.channels), [channel]: nextChannel };
  const allExternalSuccess = channels.firebase.status === DISPATCH_STATUS.SUCCESS && channels.make.status === DISPATCH_STATUS.SUCCESS;
  return replaceSession({
    ...clone(session),
    updatedAt,
    status: allExternalSuccess ? DISPATCH_STATUS.SUCCESS : success ? DISPATCH_STATUS.PENDING : DISPATCH_STATUS.ERROR,
    channels,
    history: [{ at: updatedAt, action: `${channel}_${success ? 'success' : 'error'}`, status: nextChannel.status, detail: nextChannel.detail }, ...(session.history || [])].slice(0, 50)
  });
}

export function simulateDispatch(envelope) {
  const prepared = prepareDispatchSession(envelope);
  return Object.freeze({
    ...prepared,
    simulation: true,
    externalWritesExecuted: false,
    nextAction: 'open_whatsapp_manually'
  });
}

export async function dispatchExternalChannels(envelope, adapters = {}) {
  assertExternalWriteAllowed('dispatch order to Firebase homologation and Make');
  const config = APP_CONFIG.integrations.orderDispatch;
  if (config.firebaseWriteEnabled !== true || config.makeWriteEnabled !== true) throw new Error('Canais externos continuam desabilitados na configuração.');
  const session = findDispatchSession(envelope.id);
  if (!session || session.channels?.whatsapp?.status !== DISPATCH_STATUS.WHATSAPP_OPENED) throw new Error('Registre primeiro a abertura do WhatsApp.');

  const firebaseAdapter = typeof adapters.firebase === 'function' ? adapters.firebase : saveHomologationOrder;
  const makeAdapter = adapters.make;
  if (typeof makeAdapter !== 'function') throw new Error('Adaptador do Make não informado.');

  const firebaseResult = await firebaseAdapter(envelope);
  registerChannelResult(envelope.id, 'firebase', firebaseResult);
  if (firebaseResult?.success !== true) return findDispatchSession(envelope.id);

  const makeResult = await makeAdapter(envelope);
  registerChannelResult(envelope.id, 'make', makeResult);
  return findDispatchSession(envelope.id);
}

export function clearDispatchSessions() {
  localStorage.removeItem(STORAGE_KEY);
  return [];
}

export const orderDispatchService = Object.freeze({
  validateDispatchEnvelope,
  buildWhatsAppUrl,
  buildDispatchPlan,
  prepareDispatchSession,
  readDispatchSessions,
  findDispatchSession,
  markWhatsAppOpened,
  registerChannelResult,
  simulateDispatch,
  dispatchExternalChannels,
  clearDispatchSessions
});
