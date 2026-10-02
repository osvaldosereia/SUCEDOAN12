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

function validateRequest({ accessToken, phoneNumberId, toE164, text, graphVersion, timeoutMs, fetchImpl }) {
  const token = typeof accessToken === 'string' ? accessToken.trim() : '';
  const phoneId = String(phoneNumberId ?? '').trim();
  const to = normalizeDigits(toE164);
  const body = typeof text === 'string' ? text : '';
  const version = typeof graphVersion === 'string' ? graphVersion.trim() : '';
  const timeout = Number(timeoutMs ?? 10000);

  if (!token) throw invalidRequest();
  if (!/^\d{5,30}$/.test(phoneId)) throw invalidRequest();
  if (!/^\d{8,20}$/.test(to)) throw invalidRequest();
  if (!body.trim() || body.length > 4096) throw invalidRequest();
  if (!/^v\d+\.\d+$/.test(version)) throw invalidRequest();
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60000) throw invalidRequest();
  if (typeof fetchImpl !== 'function') throw invalidRequest();

  return { token, phoneId, to, body, version, timeout };
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeout);
  const url = `https://graph.facebook.com/${request.version}/${request.phoneId}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: request.to,
    type: 'text',
    text: {
      preview_url: false,
      body: request.body,
    },
  };

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
      throw new MetaTransportError('meta_timeout', {
        retryable: false,
        uncertain: true,
      });
    }
    throw new MetaTransportError('meta_network_error', {
      retryable: false,
      uncertain: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const providerError = responsePayload?.error ?? {};
    const status = Number(response.status) || null;
    throw new MetaTransportError('meta_http_error', {
      httpStatus: status,
      retryable: status === 408 || status === 429,
      uncertain: Boolean(status && status >= 500),
      providerCode: providerError?.code ?? null,
      providerSubcode: providerError?.error_subcode ?? null,
      providerType: providerError?.type ?? null,
    });
  }

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
