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
  return new MetaTransportError('meta_invalid_request', {
    retryable: false,
    uncertain: false,
  });
}

function normalizeDigits(value) {
  return String(value ?? '').replace(/\D+/g, '');
}

function validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl }) {
  const token = typeof accessToken === 'string' ? accessToken.trim() : '';
  const phoneId = String(phoneNumberId ?? '').trim();
  const to = normalizeDigits(toE164);
  const version = typeof graphVersion === 'string' ? graphVersion.trim() : '';
  const timeout = Number(timeoutMs ?? 10000);
  if (!token) throw invalidRequest();
  if (!/^\d{5,30}$/.test(phoneId)) throw invalidRequest();
  if (!/^\d{8,20}$/.test(to)) throw invalidRequest();
  if (!/^v\d+\.\d+$/.test(version)) throw invalidRequest();
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60000) throw invalidRequest();
  if (typeof fetchImpl !== 'function') throw invalidRequest();
  return { token, phoneId, to, version, timeout };
}

function validateRequest({ accessToken, phoneNumberId, toE164, text, graphVersion, timeoutMs, fetchImpl }) {
  const common = validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl });
  const body = typeof text === 'string' ? text : '';
  if (!body.trim() || body.length > 4096) throw invalidRequest();
  return { ...common, body };
}

function validateTemplateRequest({ accessToken, phoneNumberId, toE164, templateName, languageCode, components, graphVersion, timeoutMs, fetchImpl }) {
  const common = validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl });
  const name = typeof templateName === 'string' ? templateName.trim() : '';
  const language = typeof languageCode === 'string' ? languageCode.trim() : '';
  const normalizedComponents = components == null ? [] : components;

  if (!/^[a-z0-9_]{1,512}$/.test(name)) throw invalidRequest();
  if (!/^[A-Za-z]{2,3}(?:_[A-Za-z]{2,4})?$/.test(language)) throw invalidRequest();
  if (!Array.isArray(normalizedComponents) || normalizedComponents.length > 10) throw invalidRequest();

  const safeComponents = normalizedComponents.map((component) => {
    if (!component || typeof component !== 'object' || String(component.type ?? '').toLowerCase() !== 'body') throw invalidRequest();
    const parameters = component.parameters ?? [];
    if (!Array.isArray(parameters) || parameters.length > 100) throw invalidRequest();
    return {
      type: 'body',
      parameters: parameters.map((parameter) => {
        if (!parameter || typeof parameter !== 'object' || String(parameter.type ?? '').toLowerCase() !== 'text') throw invalidRequest();
        const text = typeof parameter.text === 'string' ? parameter.text : '';
        if (!text.trim() || text.length > 1024) throw invalidRequest();
        return { type: 'text', text };
      }),
    };
  });

  return { ...common, name, language, components: safeComponents };
}

function validateMediaRequest({ accessToken, phoneNumberId, toE164, mediaType, mediaId, caption, filename, graphVersion, timeoutMs, fetchImpl }) {
  const common = validateCommonRequest({ accessToken, phoneNumberId, toE164, graphVersion, timeoutMs, fetchImpl });
  const type = String(mediaType ?? '').trim().toLowerCase();
  const id = String(mediaId ?? '').trim();
  const normalizedCaption = typeof caption === 'string' ? caption.trim() : '';
  const normalizedFilename = typeof filename === 'string' ? filename.trim() : '';
  if (!['image','audio','video','document'].includes(type)) throw invalidRequest();
  if (!/^[A-Za-z0-9._:-]{3,240}$/.test(id)) throw invalidRequest();
  if (normalizedCaption.length > 1024) throw invalidRequest();
  if (normalizedFilename.length > 240 || /[\u0000-\u001f\u007f\\/]/.test(normalizedFilename)) throw invalidRequest();
  return { ...common, type, id, caption: normalizedCaption, filename: normalizedFilename };
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

function providerErrorFromResponse(response, responsePayload) {
  const providerError = responsePayload?.error ?? {};
  const status = Number(response.status) || null;
  return new MetaTransportError('meta_http_error', {
    httpStatus: status,
    retryable: status === 408 || status === 429,
    uncertain: Boolean(status && status >= 500),
    providerCode: providerError?.code ?? null,
    providerSubcode: providerError?.error_subcode ?? null,
    providerType: providerError?.type ?? null,
  });
}

function resultFromResponse(response, responsePayload) {
  const providerMessageId = responsePayload?.messages?.[0]?.id;
  if (typeof providerMessageId !== 'string' || !providerMessageId.trim()) {
    throw new MetaTransportError('meta_invalid_response', {
      httpStatus: Number(response.status) || null,
      retryable: false,
      uncertain: true,
    });
  }
  return {
    ok: true,
    provider: 'meta',
    providerMessageId: providerMessageId.trim(),
    httpStatus: Number(response.status) || 200,
  };
}

async function postMetaMessage(request, payload, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeout);
  const url = `https://graph.facebook.com/${request.version}/${request.phoneId}/messages`;
  let response;
  let responsePayload;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    responsePayload = await readJsonSafely(response);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new MetaTransportError('meta_timeout', { retryable: false, uncertain: true });
    }
    throw new MetaTransportError('meta_network_error', { retryable: false, uncertain: true });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw providerErrorFromResponse(response, responsePayload);
  return resultFromResponse(response, responsePayload);
}

export async function sendTextViaMeta({
  accessToken,
  phoneNumberId,
  toE164,
  text,
  graphVersion,
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const request = validateRequest({
    accessToken,
    phoneNumberId,
    toE164,
    text,
    graphVersion,
    timeoutMs,
    fetchImpl,
  });
  return await postMetaMessage(request, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: request.to,
    type: 'text',
    text: { preview_url: false, body: request.body },
  }, fetchImpl);
}

export async function sendTemplateViaMeta({
  accessToken,
  phoneNumberId,
  toE164,
  templateName,
  languageCode,
  components = [],
  graphVersion,
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const request = validateTemplateRequest({
    accessToken,
    phoneNumberId,
    toE164,
    templateName,
    languageCode,
    components,
    graphVersion,
    timeoutMs,
    fetchImpl,
  });
  return await postMetaMessage(request, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: request.to,
    type: 'template',
    template: {
      name: request.name,
      language: { code: request.language },
      components: request.components,
    },
  }, fetchImpl);
}

export async function sendMediaViaMeta({
  accessToken,
  phoneNumberId,
  toE164,
  mediaType,
  mediaId,
  caption = '',
  filename = '',
  graphVersion,
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const request = validateMediaRequest({
    accessToken, phoneNumberId, toE164, mediaType, mediaId, caption, filename,
    graphVersion, timeoutMs, fetchImpl,
  });
  const media = { id: request.id };
  if (request.type !== 'audio' && request.caption) media.caption = request.caption;
  if (request.type === 'document' && request.filename) media.filename = request.filename;
  return await postMetaMessage(request, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: request.to,
    type: request.type,
    [request.type]: media,
  }, fetchImpl);
}
