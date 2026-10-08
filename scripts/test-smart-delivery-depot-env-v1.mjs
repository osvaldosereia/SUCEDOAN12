import assert from "node:assert/strict";
import { parseDepotEnvironment, buildGoogleOptimizeToursRequest } from "../supabase/functions/_shared/smart-delivery-google-adapter.mjs";

const ok=parseDepotEnvironment("-15.598", "-56.091");
assert.deepEqual(ok.depot,{latitude:-15.598,longitude:-56.091});
assert.equal(ok.returnToDepot,true);
assert.equal(parseDepotEnvironment("-15.598","-56.091","false").returnToDepot,false);
for (const [lat,lng,policy] of [
  ["","-56.091","true"],["-15.598","","true"],["0","0","true"],
  ["-91","-56.091","true"],["-15.598","181","true"],
  ["oops","-56.091","true"],["-15.598","-56.091","maybe"]
]) assert.throws(()=>parseDepotEnvironment(lat,lng,policy));
const req=buildGoogleOptimizeToursRequest(
  [{id:"s1",lat:-15.601,lng:-56.1}],
  {startTime:"2026-10-09T08:00:00-04:00",endTime:"2026-10-09T18:00:00-04:00",...ok}
);
assert.deepEqual(req.model.vehicles[0].startLocation,ok.depot);
assert.deepEqual(req.model.vehicles[0].endLocation,ok.depot);
console.log("Smart Delivery depot environment: OK");
