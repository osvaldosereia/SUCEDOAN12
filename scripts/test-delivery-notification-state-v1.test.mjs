import test from "node:test";
import assert from "node:assert/strict";
import { sendAndPersistDeliveryNotice } from "../supabase/functions/_shared/delivery-notification-state-v1.mjs";
import * as notificationState from "../supabase/functions/_shared/delivery-notification-state-v1.mjs";

test("accepted Meta notice with a database write failure stays uncertain with its provider ID", async () => {
  const providerMessageId = "wamid.accepted-by-meta";
  let uncertainRecord = null;
  let transportFailureRecorded = false;

  await assert.rejects(
    sendAndPersistDeliveryNotice({
      send: async () => ({ providerMessageId }),
      markAccepted: async () => { throw new Error("database response lost"); },
      markUncertain: async (id, reason) => { uncertainRecord = { id, reason }; },
      markTransportFailure: async () => { transportFailureRecorded = true; },
    }),
    (error) => error.code === "meta_accepted_status_uncertain" && error.providerMessageId === providerMessageId,
  );

  assert.deepEqual(uncertainRecord, { id: providerMessageId, reason: "accepted_state_write_failed" });
  assert.equal(transportFailureRecorded, false, "a database write failure after provider acceptance is not a transport failure");
});

test("transport failure records its certainty and does not attempt accepted-state persistence", async () => {
  const transportError = Object.assign(new Error("network timeout"), { uncertain: true });
  let recordedError = null;
  let acceptedWriteAttempted = false;

  await assert.rejects(
    sendAndPersistDeliveryNotice({
      send: async () => { throw transportError; },
      markAccepted: async () => { acceptedWriteAttempted = true; },
      markUncertain: async () => {},
      markTransportFailure: async (error) => { recordedError = error; },
    }),
    (error) => error === transportError,
  );

  assert.equal(recordedError, transportError);
  assert.equal(acceptedWriteAttempted, false);
});

test("notification retry count increments and stops at the ten-attempt limit", () => {
  assert.equal(typeof notificationState.incrementNotificationAttemptCount, "function");
  assert.equal(notificationState.incrementNotificationAttemptCount(1), 2);
  assert.equal(notificationState.incrementNotificationAttemptCount(9), 10);
  assert.throws(() => notificationState.incrementNotificationAttemptCount(10), /notification_retry_limit/);
  assert.throws(() => notificationState.incrementNotificationAttemptCount("invalid"), /invalid_notification_attempt_count/);
});
