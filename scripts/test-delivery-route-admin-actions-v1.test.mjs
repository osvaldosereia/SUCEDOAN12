import assert from "node:assert/strict";
import test from "node:test";
import { deliveryStopCapabilities, isValidDeliveryRescheduleDate } from "../site/admin/delivery-domain.mjs";

test("admin can edit only an unstarted planned route stop", () => {
  const editable = deliveryStopCapabilities(
    { status: "planned" },
    { status: "planned" },
  );
  assert.deepEqual(editable, {
    canCancel: true,
    canReassign: true,
    canReschedule: true,
    canMarkDelivered: false,
    isDelivered: false,
    isCancelled: false,
  });

  for (const run of [
    { status: "planned", loading_started_at: "2026-11-06T10:00:00Z" },
    { status: "planned", loaded_at: "2026-11-06T10:00:00Z" },
    { status: "dispatched" },
  ]) {
    const locked = deliveryStopCapabilities(run, { status: "planned" });
    assert.equal(locked.canCancel, false);
    assert.equal(locked.canReassign, false);
    assert.equal(locked.canReschedule, false);
  }

  const inRoute = deliveryStopCapabilities(
    { status: "dispatched" },
    { status: "out_for_delivery" },
  );
  assert.equal(inRoute.canMarkDelivered, true);
  assert.equal(inRoute.canCancel, false);
});

test("delivered and cancelled route stops are never editable", () => {
  for (const status of ["delivered", "cancelled", "failed"]) {
    const capabilities = deliveryStopCapabilities({ status: "planned" }, { status });
    assert.equal(capabilities.canCancel, false);
    assert.equal(capabilities.canReassign, false);
    assert.equal(capabilities.canReschedule, false);
  }
});

test("delivery reschedule accepts valid non-Sunday dates from today onward", () => {
  assert.equal(isValidDeliveryRescheduleDate("2026-11-06", "2026-11-06"), true);
  assert.equal(isValidDeliveryRescheduleDate("2026-11-07", "2026-11-06"), true);
  assert.equal(isValidDeliveryRescheduleDate("2026-11-05", "2026-11-06"), false);
  assert.equal(isValidDeliveryRescheduleDate("2026-11-08", "2026-11-06"), false);
  assert.equal(isValidDeliveryRescheduleDate("2026-02-30", "2026-02-01"), false);
  assert.equal(isValidDeliveryRescheduleDate("not-a-date", "2026-11-06"), false);
});
