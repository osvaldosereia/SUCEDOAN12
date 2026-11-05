import assert from "node:assert/strict";
import test from "node:test";

const validation = await import("../supabase/functions/_shared/delivery-ops-validation-v1.mjs").catch(() => ({}));
const routeIds = (count) => Array.from({ length: count }, (_, index) =>
  `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

test("route request rejects more than 30 orders instead of truncating the selection", () => {
  assert.equal(typeof validation.normalizeRouteOrderIds, "function");
  assert.throws(() => validation.normalizeRouteOrderIds(routeIds(31)), /route_too_many_orders/);
});

test("route request rejects invalid or duplicate order ids", () => {
  assert.equal(typeof validation.normalizeRouteOrderIds, "function");
  assert.throws(() => validation.normalizeRouteOrderIds(["invalid"]), /invalid_order_id/);
  const id = routeIds(1)[0];
  assert.throws(() => validation.normalizeRouteOrderIds([id, id]), /duplicate_order_in_route/);
});

test("driver reordering rejects an invalid stop ID instead of silently dropping it", () => {
  assert.equal(typeof validation.normalizeStopIds, "function");
  const validIds = routeIds(3);
  assert.throws(() => validation.normalizeStopIds([...validIds, "invalid-stop-id"]), /invalid_stop_id/);
  assert.throws(() => validation.normalizeStopIds([validIds[0], validIds[0]]), /duplicate_stop_in_route/);
});

test("adding orders to an existing planned route preserves its unselected deliveries", () => {
  assert.equal(typeof validation.mergePlannedRouteOrderIds, "function");
  const existing = routeIds(2);
  const selected = [existing[1], routeIds(1)[0].replace("000000000001", "000000000003")];
  assert.deepEqual(validation.mergePlannedRouteOrderIds(existing, selected), [existing[0], existing[1], selected[1]]);
});

test("driver route view keeps today's completed deliveries visible", () => {
  assert.equal(typeof validation.driverVisibleRuns, "function");
  const driverId = routeIds(1)[0];
  const otherDriverId = routeIds(1)[0].replace("000000000001", "000000000002");
  const runs = [
    { id: "planned", driver_id: driverId, status: "planned" },
    { id: "dispatched", driver_id: driverId, status: "dispatched" },
    { id: "completed", driver_id: driverId, status: "completed" },
    { id: "cancelled", driver_id: driverId, status: "cancelled" },
    { id: "other-driver", driver_id: otherDriverId, status: "completed" },
  ];
  assert.deepEqual(validation.driverVisibleRuns(runs, driverId).map((run) => run.id), ["planned", "dispatched", "completed"]);
});

test("WhatsApp notification channel comes from the store account, not customer phone", () => {
  assert.equal(typeof validation.channelForWhatsappAccount, "function");
  assert.equal(validation.channelForWhatsappAccount({ phone_e164: "+5565991231018" }), "1018");
  assert.equal(validation.channelForWhatsappAccount({ slug: "dona-antonia-0975" }), "0975");
  assert.equal(validation.channelForWhatsappAccount({ phone_e164: "+5565991234567" }), null);
});

test("active driver requires a valid WhatsApp number for customer notifications", () => {
  assert.equal(typeof validation.normalizeDriverPhone, "function");
  assert.throws(() => validation.normalizeDriverPhone("", true), /driver_phone_required/);
  assert.throws(() => validation.normalizeDriverPhone("123", true), /driver_phone_invalid/);
  assert.equal(validation.normalizeDriverPhone("(65) 99999-9999", true), "+5565999999999");
  assert.equal(validation.normalizeDriverPhone("", false), null);
});
