export function incrementNotificationAttemptCount(current) {
  const attempts = Number(current);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
    throw new Error("invalid_notification_attempt_count");
  }
  if (attempts >= 10) throw new Error("notification_retry_limit");
  return attempts + 1;
}

export async function sendAndPersistDeliveryNotice({
  send,
  markAccepted,
  markUncertain,
  markTransportFailure,
}) {
  let sent;
  try {
    sent = await send();
  } catch (error) {
    try {
      await markTransportFailure(error);
    } catch (_) {
      // Keep the original transport error; an unrecorded attempt stays non-retryable as "sending".
    }
    throw error;
  }

  const providerMessageId = String(sent?.providerMessageId || "").trim();
  if (!providerMessageId) throw new Error("meta_provider_message_id_missing");

  try {
    await markAccepted(providerMessageId, sent);
  } catch (_) {
    try {
      await markUncertain(providerMessageId, "accepted_state_write_failed");
    } catch (_) {
      // If both writes fail, the earlier "sending" state still blocks automatic retries.
    }
    const error = new Error("meta_accepted_status_uncertain");
    error.code = "meta_accepted_status_uncertain";
    error.providerMessageId = providerMessageId;
    error.uncertain = true;
    throw error;
  }

  return sent;
}
