import assert from "node:assert/strict";
import { buildGoogleOptimizeToursRequest, readGoogleOptimizedOrder } from "../supabase/functions/_shared/smart-delivery-google-adapter.mjs";

const stops = [
  { id: "stop-a", lat: -15.601, lng: -56.098 },
  { id: "stop-b", lat: -15.602, lng: -56.099 },
  { id: "stop-c", lat: -15.603, lng: -56.100 }
];
const window = { startTime: "2026-10-09T08:00:00-04:00", endTime: "2026-10-09T18:00:00-04:00" };
const request = buildGoogleOptimizeToursRequest(stops, window);
assert.equal(request.model.shipments.length, 3);
assert.equal(request.model.vehicles.length, 1);
assert.equal(request.model.shipments[0].label, "stop-a");
const depot = { latitude: -15.596, longitude: -56.095 };
const roundTrip = buildGoogleOptimizeToursRequest(stops, { ...window, depot });
assert.deepEqual(roundTrip.model.vehicles[0].startLocation, depot);
assert.deepEqual(roundTrip.model.vehicles[0].endLocation, depot);
const oneWay = buildGoogleOptimizeToursRequest(stops, { ...window, depot, returnToDepot: false });
assert.equal(oneWay.model.vehicles[0].endLocation, undefined);
assert.throws(() => buildGoogleOptimizeToursRequest(stops, { ...window, depot: { latitude: 0, longitude: 0 } }), /depot/);

assert.equal(JSON.stringify(request).includes("customer"), false);
const response = { routes: [{ vehicleIndex: 0, visits: [
  { shipmentIndex: 2 }, { shipmentIndex: 0 }, { shipmentIndex: 1 }
] }] };
assert.deepEqual(readGoogleOptimizedOrder(response, stops), ["stop-c", "stop-a", "stop-b"]);
assert.throws(() => buildGoogleOptimizeToursRequest([...stops, stops[0]], window), /Duplicate/);
assert.throws(() => buildGoogleOptimizeToursRequest([{ id: "x", lat: null, lng: 0 }], window), /coordinates/);
assert.throws(() => buildGoogleOptimizeToursRequest(stops, { ...window, endTime: window.startTime }), /window/);
assert.throws(() => readGoogleOptimizedOrder({ ...response, skippedShipments: [{ index: 0 }] }, stops), /Skipped/);
assert.throws(() => readGoogleOptimizedOrder({ routes: [{ visits: [{ shipmentIndex: 0 }] }] }, stops), /Incomplete/);
assert.throws(() => readGoogleOptimizedOrder({ routes: [{ visits: [
  { shipmentIndex: 0 }, { shipmentIndex: 0 }, { shipmentIndex: 1 }
] }] }, stops), /Invalid visit/);
assert.throws(() => readGoogleOptimizedOrder({ routes: [{ visits: [
  { shipmentIndex: 0 }, { shipmentIndex: 1 }, { shipmentIndex: 9 }
] }] }, stops), /Invalid visit/);
console.log("Smart Delivery Google adapter safety tests: OK");
