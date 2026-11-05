import test from "node:test";
import assert from "node:assert/strict";
import * as deliveryDomain from "../site/admin/delivery-domain.mjs";
import {
  buildMapsHref,
  driverRouteKey,
  latestLocationEvidence,
  movePlannedStop,
  normalizeEtaMinutes,
  paidAheadLabel,
} from "../site/admin/delivery-domain.mjs";

test("driver route keys are unique per valid driver id and no longer limited to two cars", () => {
  const a = driverRouteKey("6b2a4416-1c24-4f69-b465-cc19d01511a0");
  const b = driverRouteKey("a0ae051f-0601-4000-8b26-b829d44507b1");
  assert.equal(a, "driver_6b2a4416-1c24-4f69-b465-cc19d01511a0");
  assert.notEqual(a, b);
  assert.throws(() => driverRouteKey("car_1"), /driver_id/i);
});

test("latest location selection includes inbound and outbound evidence and skips invalid coordinates", () => {
  const rows = [
    { id: "older", direction: "inbound", captured_at: "2026-10-01T10:00:00Z", latitude: -15.6, longitude: -56.1 },
    { id: "newest-invalid", direction: "outbound", captured_at: "2026-10-03T10:00:00Z", latitude: 120, longitude: -56.1 },
    { id: "newest-valid", direction: "outbound", captured_at: "2026-10-02T10:00:00Z", latitude: -15.7, longitude: -56.2 },
  ];
  assert.equal(latestLocationEvidence(rows)?.id, "newest-valid");
});

test("map link prefers confirmed coordinates and falls back to a complete text address", () => {
  const confirmed = buildMapsHref({
    destination_latitude: -15.601,
    destination_longitude: -56.097,
    destination_confidence: "confirmed",
    address_snapshot: { street: "Rua A", number: "10", city: "Cuiabá" },
  });
  assert.match(decodeURIComponent(confirmed), /-15\.601,-56\.097/);
  const fallback = buildMapsHref({ address_snapshot: { street: "Rua A", number: "10", city: "Cuiabá" } });
  assert.match(decodeURIComponent(fallback), /Rua A, 10, Cuiabá/);
  const alternateStreet = buildMapsHref({ address_snapshot: { street: "", address_line: "Rua A", number: "10", city: "Cuiabá" } });
  assert.match(decodeURIComponent(alternateStreet), /Rua A, 10, Cuiabá/);
  assert.equal(buildMapsHref({ destination_latitude: 200, destination_longitude: 0 }), "");
});

test("driver reordering only changes planned stops and preserves delivered stops", () => {
  const stops = [
    { id: "done", status: "delivered", sequence: 1 },
    { id: "a", status: "planned", sequence: 2 },
    { id: "b", status: "planned", sequence: 3 },
  ];
  const moved = movePlannedStop(stops, "b", -1, { runStatus: "planned", loadingStarted: false });
  assert.deepEqual(moved.map((row) => row.id), ["done", "b", "a"]);
  assert.throws(() => movePlannedStop(stops, "a", -1, { runStatus: "dispatched", loadingStarted: true }), /locked/i);
  assert.throws(() => movePlannedStop(stops, "done", 1, { runStatus: "planned", loadingStarted: false }), /planned/i);
});

test("ETA is bounded to practical integer minutes", () => {
  assert.equal(normalizeEtaMinutes("15"), 15);
  assert.throws(() => normalizeEtaMinutes("2"), /ETA/i);
  assert.throws(() => normalizeEtaMinutes("15.5"), /ETA/i);
});

test("prepaid orders are unmistakably marked for the driver", () => {
  assert.equal(paidAheadLabel({ delivery_paid_ahead: true, delivery_paid_ahead_method: "pix" }), "PAGO ADIANTADO · NÃO COBRAR");
  assert.equal(paidAheadLabel({ delivery_paid_ahead: false, payment_method: "cash" }), "RECEBER NA ENTREGA");
});

test("accepted-but-unconfirmed notice explains that the WhatsApp message may already be sent", () => {
  assert.equal(typeof deliveryDomain.deliveryNoticeFailureMessage, "function");
  assert.equal(
    deliveryDomain.deliveryNoticeFailureMessage("meta_accepted_status_uncertain", "erro", true),
    "Rota aberta no Google Maps. O WhatsApp pode ter aceitado o aviso, mas o sistema não confirmou o registro. Confira a conversa antes de tentar novamente.",
  );
});

test("admin route selection stops at 30 without dropping an already selected order", () => {
  assert.equal(typeof deliveryDomain.addRouteSelection, "function");
  const selection = new Set(Array.from({ length: 30 }, (_, index) => `order-${index + 1}`));
  assert.throws(() => deliveryDomain.addRouteSelection(selection, "order-31"), /route_too_many_orders/);
  assert.equal(selection.size, 30);
  assert.equal(deliveryDomain.addRouteSelection(selection, "order-1").size, 30);
});

test("failed route creation retains selected orders for retry", () => {
  assert.equal(typeof deliveryDomain.routeSelectionAfterAction, "function");
  const selection = new Set(["order-1", "order-2"]);
  assert.deepEqual([...deliveryDomain.routeSelectionAfterAction(selection, false)], ["order-1", "order-2"]);
  assert.equal(deliveryDomain.routeSelectionAfterAction(selection, true).size, 0);
});

test("today's route queue excludes overdue and future orders and keeps same-day legacy orders", () => {
  assert.equal(typeof deliveryDomain.partitionDeliveryOrders, "function");
  const queue = deliveryDomain.partitionDeliveryOrders([
    { id: "today", checkout_snapshot: { delivery: { date: "2026-11-05" } } },
    { id: "overdue", checkout_snapshot: { delivery: { date: "2026-11-04" } } },
    { id: "future", checkout_snapshot: { delivery: { date: "2026-11-06" } } },
    { id: "legacy-today", created_at: "2026-11-05T04:30:00.000Z", checkout_snapshot: {} },
    { id: "no-date", created_at: "invalid", checkout_snapshot: {} },
  ], "2026-11-05");
  assert.deepEqual(queue.today.map((order) => order.id), ["today", "legacy-today"]);
  assert.deepEqual(queue.overdue.map((order) => order.id), ["overdue"]);
  assert.deepEqual(queue.future.map((order) => order.id), ["future"]);
  assert.deepEqual(queue.undated.map((order) => order.id), ["no-date"]);
});

test("prepaid payment method requires an explicit supported selection", () => {
  assert.equal(typeof deliveryDomain.prepaidPaymentMethod, "function");
  assert.equal(deliveryDomain.prepaidPaymentMethod(""), null);
  assert.equal(deliveryDomain.prepaidPaymentMethod("pix"), "pix");
  assert.equal(deliveryDomain.prepaidPaymentMethod("credit_card"), "credit_card");
  assert.equal(deliveryDomain.prepaidPaymentMethod("cash"), null);
});
