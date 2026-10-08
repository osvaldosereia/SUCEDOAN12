import assert from "node:assert/strict";
import { validateRouteStops } from "../supabase/functions/_shared/smart-delivery-route-guard.mjs";

const stop = (lat, lng) => [{ id: "route-stop-1", lat, lng }];
assert.equal(validateRouteStops(stop(-15.601, -56.098)).length, 1);
for (const coords of [[0, 0], [null, 0], [0, null], [91, 1], [1, -181]]) {
  assert.throws(() => validateRouteStops(stop(...coords)), /coordinates/);
}
assert.throws(() => validateRouteStops([stop(-15, -56)[0], stop(-16, -57)[0]]), /Duplicate/);
console.log("Smart Delivery coordinate guard: OK");
