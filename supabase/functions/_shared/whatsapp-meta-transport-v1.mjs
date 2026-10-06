export class MetaTransportError extends Error {
  constructor(code, {
    httpStatus = null,
    retryable = false,
    uncertain = false,
    providerCode = null,
    providerSubcode = null,
    providerType = null,
  } = {}) {
    super(code);
    this.name = 'MetaTransportError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.uncertain = uncertain;
    this.providerCode = providerCode;
    this.providerSubcode = providerSubcode;
    this.providerType = providerType;
  }
}

function invalidRequest() {
  return new MetaTransportError('meta_invalid_request', { retryable: false, uncertain: false });
}
function normalizeDigits(value) { return String(value ?? '').replace(/\D+/g, ''); }
function validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl }) {
  const token = typeof accessToken === 'string' ? accessToken.trim() : '';
  const phoneId = String(phoneNumberId ?? '').trim();
  const to = normalizeDigits(toE164);
  const version = typeof graphVersion === 'string' ? graphVersion.trim() : '';
  const timeout = Number(timeoutMs ?? 10000);
  if (!token || !/^\d{5,30}$/.test(phoneId) || !/^\d{8,20}$/.test(to) || !/^v\d+\.\d+$/.test(version) || !Number.isFinite(timeout) || timeout < 1 || timeout > 60000 || typeof fetchImpl !== 'function') throw invalidRequest();
  return { token, phoneId, to, version, timeout };
}
function validateRequest({ accessToken, phoneNumberId, toE164, text, graphVersion, timeoutMs, fetchImpl }) {
  const common = validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl });
  const body = typeof text === 'string' ? text : '';
  if (!body.trim() || body.length > 4096) throw invalidRequest();
  return { ...common, body };
}
function safeTextParameter(parameter, maxLength = 1024) {
  if (!parameter || typeof parameter !== 'object' || String(parameter.type ?? '').toLowerCase() !== 'text') throw invalidRequest();
  const text = typeof parameter.text === 'string' ? parameter.text.trim() : '';
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) throw invalidRequest();
  return { type: 'text', text };
}
function safeQuickReplyButton(component) {
  const subType = String(component?.sub_type ?? '').toLowerCase();
  const index = String(component?.index ?? '');
  const parameters = component?.parameters ?? [];
  if (subType !== 'quick_reply' || !/^[0-9]$/.test(index) || !Array.isArray(parameters) || parameters.length !== 1) throw invalidRequest();
  const parameter = parameters[0];
  if (!parameter || typeof parameter !== 'object' || String(parameter.type ?? '').toLowerCase() !== 'payload') throw invalidRequest();
  const payload = typeof parameter.payload === 'string' ? parameter.payload.trim() : '';
  if (!payload || payload.length > 256 || /[\u0000-\u001f\u007f]/.test(payload)) throw invalidRequest();
  return { type: 'button', sub_type: 'quick_reply', index, parameters: [{ type: 'payload', payload }] };
}
function safeCarouselComponent(component) {
  const cards = component?.cards;
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > 10) throw invalidRequest();
  const seen = new Set();
  const safeCards = cards.map((card) => {
    if (!card || typeof card !== 'object') throw invalidRequest();
    const cardIndex = Number(card.card_index);
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 9 || seen.has(cardIndex)) throw invalidRequest();
    seen.add(cardIndex);
    const components = card.components;
    if (!Array.isArray(components) || components.length !== 1) throw invalidRequest();
    const button = components[0];
    if (!button || typeof button !== 'object' || String(button.type ?? '').toLowerCase() !== 'button') throw invalidRequest();
    const subType = String(button.sub_type ?? '').toLowerCase();
    const index = String(button.index ?? '');
    const parameters = button.parameters ?? [];
    if (subType !== 'url' || !/^[0-9]$/.test(index) || !Array.isArray(parameters) || parameters.length !== 1) throw invalidRequest();
    return {
      card_index: cardIndex,
      components: [{
        type: 'button',
        sub_type: 'url',
        index,
        parameters: [safeTextParameter(parameters[0], 2000)],
      }],
    };
  });
  safeCards.sort((a, b) => a.card_index - b.card_index);
  for (let index = 0; index < safeCards.length; index++) {
    if (safeCards[index].card_index !== index) throw invalidRequest();
  }
  return { type: 'carousel', cards: safeCards };
}
function validateTemplateRequest({ accessToken, phoneNumberId, toE164, templateName, languageCode, components, graphVersion, timeoutMs, fetchImpl }) {
  const common = validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl });
  const name = typeof templateName === 'string' ? templateName.trim() : '';
  const language = typeof languageCode === 'string' ? languageCode.trim() : '';
  const normalizedComponents = components == null ? [] : components;
  if (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[A-Za-z]{2,3}(?:_[A-Za-z]{2,4})?$/.test(language) || !Array.isArray(normalizedComponents) || normalizedComponents.length > 10) throw invalidRequest();

  const safeComponents = normalizedComponents.map((component) => {
    if (!component || typeof component !== 'object') throw invalidRequest();
    const type = String(component.type ?? '').toLowerCase();

    if (type === 'body') {
      const parameters = component.parameters ?? [];
      if (!Array.isArray(parameters) || parameters.length > 100) throw invalidRequest();
      return { type: 'body', parameters: parameters.map((parameter) => safeTextParameter(parameter, 1024)) };
    }

    if (type === 'button') return safeQuickReplyButton(component);
    if (type === 'carousel') return safeCarouselComponent(component);

    throw invalidRequest();
  });
  return { ...common, name, language, components: safeComponents };
}
function validateMediaRequest({ accessToken, phoneNumberId, toE164, mediaType, mediaId, caption, filename, graphVersion, timeoutMs, fetchImpl }) {
  const common = validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl });
  const type = String(mediaType ?? '').trim().toLowerCase();
  const id = String(mediaId ?? '').trim();
  const normalizedCaption = typeof caption === 'string' ? caption.trim() : '';
  const normalizedFilename = typeof filename === 'string' ? filename.trim() : '';
  if (!['image','audio','video','document'].includes(type) || !/^[A-Za-z0-9._:-]{3,240}$/.test(id) || normalizedCaption.length > 1024 || normalizedFilename.length > 240 || /[\u0000-\u001f\u007f\\/]/.test(normalizedFilename)) throw invalidRequest();
  return { ...common, type, id, caption: normalizedCaption, filename: normalizedFilename };
}
async function readJsonSafely(response) { try { return await response.json(); } catch (error) { if (error?.name === 'AbortError') throw error; return null; } }
function providerErrorFromResponse(response, responsePayload) {
  const providerError = responsePayload?.error ?? {}; const status = Number(response.status) || null;
  return new MetaTransportError('meta_http_error', { httpStatus: status, retryable: status === 408 || status === 429, uncertain: Boolean(status && status >= 500), providerCode: providerError?.code ?? null, providerSubcode: providerError?.error_subcode ?? null, providerType: providerError?.type ?? null });
}
function resultFromResponse(response, responsePayload) {
  const providerMessageId = responsePayload?.messages?.[0]?.id;
  if (typeof providerMessageId !== 'string' || !providerMessageId.trim()) throw new MetaTransportError('meta_invalid_response', { httpStatus: Number(response.status) || null, retryable: false, uncertain: true });
  return { ok: true, provider: 'meta', providerMessageId: providerMessageId.trim(), httpStatus: Number(response.status) || 200 };
}
async function postMetaMessage(request, payload, fetchImpl) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), request.timeout); const url = `https://graph.facebook.com/${request.version}/${request.phoneId}/messages`;
  let response; let responsePayload;
  try { response = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${request.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }); responsePayload = await readJsonSafely(response); }
  catch (error) { if (controller.signal.aborted || error?.name === 'AbortError') throw new MetaTransportError('meta_timeout', { retryable: false, uncertain: true }); throw new MetaTransportError('meta_network_error', { retryable: false, uncertain: true }); }
  finally { clearTimeout(timeout); }
  if (!response.ok) throw providerErrorFromResponse(response, responsePayload);
  return resultFromResponse(response, responsePayload);
}
export async function sendTextViaMeta({ accessToken, phoneNumberId, toE164, text, graphVersion, timeoutMs = 10000, fetchImpl = globalThis.fetch } = {}) {
  const request = validateRequest({ accessToken, phoneNumberId, toE164, text, graphVersion, timeoutMs, fetchImpl });
  return await postMetaMessage(request, { messaging_product: 'whatsapp', recipient_type: 'individual', to: request.to, type: 'text', text: { preview_url: false, body: request.body } }, fetchImpl);
}
export async function sendTemplateViaMeta({ accessToken, phoneNumberId, toE164, templateName, languageCode, components = [], graphVersion, timeoutMs = 10000, fetchImpl = globalThis.fetch } = {}) {
  const request = validateTemplateRequest({ accessToken, phoneNumberId, toE164, templateName, languageCode, components, graphVersion, timeoutMs, fetchImpl });
  return await postMetaMessage(request, { messaging_product: 'whatsapp', recipient_type: 'individual', to: request.to, type: 'template', template: { name: request.name, language: { code: request.language }, components: request.components } }, fetchImpl);
}
export async function sendMediaViaMeta({ accessToken, phoneNumberId, toE164, mediaType, mediaId, caption = '', filename = '', graphVersion, timeoutMs = 10000, fetchImpl = globalThis.fetch } = {}) {
  const request = validateMediaRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl, mediaType, mediaId, caption, filename });
  const media = { id: request.id }; if (request.type !== 'audio' && request.caption) media.caption = request.caption; if (request.type === 'document' && request.filename) media.filename = request.filename;
  return await postMetaMessage(request, { messaging_product: 'whatsapp', recipient_type: 'individual', to: request.to, type: request.type, [request.type]: media }, fetchImpl);
}
