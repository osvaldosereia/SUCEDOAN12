import assert from "node:assert/strict";
import {validateRouteStops,buildGoogleRequest,parseGoogleResponse} from "../supabase/functions/smart-delivery-optimize-v1/route-model.mjs";
const a={id:"a",latitude:-15.60,longitude:-56.10};
const b={id:"b",latitude:-15.61,longitude:-56.12};
const stops=[a,b];
assert.equal(validateRouteStops(stops).length,2);
assert.equal(buildGoogleRequest(stops).model.shipments.length,2);
assert.equal(buildGoogleRequest(stops).model.vehicles[0].travelMode,"DRIVING");
assert.deepEqual(parseGoogleResponse({routes:[{visits:[{shipmentIndex:1},{shipmentIndex:0}]}]},stops),["b","a"]);
for(const bad of [
 [],[a,a],[{id:"c",latitude:null,longitude:0}],[{id:"c",latitude:91,longitude:0}],
 [{id:"c",latitude:0,longitude:Infinity}]
]) assert.throws(()=>validateRouteStops(bad));
for(const bad of [
 {},{routes:[]},{routes:[{visits:[{shipmentIndex:0}]}]},
 {routes:[{visits:[{shipmentIndex:0},{shipmentIndex:0}]}]},
 {routes:[{visits:[{shipmentIndex:0},{shipmentIndex:2}]}]},
 {routes:[{visits:[{shipmentIndex:0},{shipmentIndex:1}]}],skippedShipments:[{index:1}]}
]) assert.throws(()=>parseGoogleResponse(bad,stops));
console.log("Smart Delivery Google optimizer model: ok");
