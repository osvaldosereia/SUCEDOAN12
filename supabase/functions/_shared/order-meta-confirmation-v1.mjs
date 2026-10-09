// R04: signature-attested order button selection, pure and fail-closed.
// The calling webhook MUST verify x-hub-signature-256 on the exact raw body
// before running this function or setting the signed metadata marker.
// This helper is NOT a substitute for Meta HMAC verification.
const wamid = value => typeof value === "string"
  && /^wamid\.[A-Za-z0-9_.:-]{6,450}$/.test(value);
const uuid = value => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function metaOrderConfirmationCandidate(message, { signatureVerified = false } = {}) {
  if (signatureVerified !== true || message?.event_type !== "message.received"
      || message?.message?.direction !== "inbound"
      || !["button","interactive"].includes(message?.message?.message_type)
      || !uuid(message?.whatsapp_account_id)
      || !wamid(message?.provider_message_id)
      || !/^\+\d{10,15}$/.test(String(message?.phone_e164 ?? ""))) return null;
  const meta = message.message.metadata || {};
  // A normal inbound text "CONFIRMADO" is NOT a button.
  const payload = message.message.message_type === "button"
    ? meta.button_payload
    : meta.interactive?.type === "button_reply" ? meta.interactive?.button_reply?.id : null;
  if (payload !== "CONFIRMADO" || !wamid(meta.context_message_id)) return null;
  return {
    button_id: "CONFIRMADO",
    outbound_wamid: meta.context_message_id,
    inbound_wamid: message.provider_message_id,
    whatsapp_account_id: message.whatsapp_account_id,
    phone_e164: message.phone_e164
  };
}

export function markSignedMetaOrderConfirmation(message, candidate) {
  if (!candidate) return message;
  return {
    ...message,
    message: {
      ...message.message,
      metadata: {
        ...message.message.metadata,
        order_meta_confirmation: {
          button_id: candidate.button_id,
          outbound_wamid: candidate.outbound_wamid,
          signature_verified: true,
          source: "signed_meta_webhook"
        }
      }
    }
  };
}
