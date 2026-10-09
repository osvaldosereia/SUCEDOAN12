import assert from "node:assert/strict";
import {classifyMigrationDriftR27} from "./xml-migration-drift-guard-r27.mjs";
const local=[
 "20261009051500_purchase_xml_catalog_observations_v1.sql",
 "20261009155231_separation_ready_reservation_idempotence_20261009.sql",
 "20261009185312_purchase_xml_identity_atomic_r27.sql",
 "20261009185314_purchase_xml_field_approval_r27.sql"
];
const remote=[
 {version:"20261009023146",name:"purchase_xml_catalog_observations_v1"},
 {version:"20261009155231",name:"separation_ready_reservation_idempotence_20261009"},
 {version:"20261009133642",name:"sales_quote_bling_conversion_v1"}
];
const drift=classifyMigrationDriftR27(local,remote);
assert.equal(drift.ok_for_global_db_push,false);
assert.equal(drift.latest_remote_version,"20261009155231");
assert.equal(drift.same_name_different_version,1);
assert.equal(drift.older_unapplied_versions,1);
assert.equal(drift.remote_not_locally_versioned,2);
assert.ok(drift.blockers.includes("possibly_replayed_sql_under_different_version"));
assert.ok(drift.blockers.includes("remote_versions_not_present_locally"));
assert.deepEqual(drift.pending_newer,[
 "20261009185312_purchase_xml_identity_atomic_r27.sql",
 "20261009185314_purchase_xml_field_approval_r27.sql"
]);
const exact=classifyMigrationDriftR27([
 "20261009155231_separation_ready_reservation_idempotence_20261009.sql"
],[{version:"20261009155231",name:"separation_ready_reservation_idempotence_20261009"}]);
assert.equal(exact.ok_for_global_db_push,true);
assert.match(exact.recommendation,/STAGING_REVIEW/);
const invalid=classifyMigrationDriftR27([
 "20261009_not_canonical.sql","20261009155231_one.sql","20261009155231_two.sql"
],[{version:"20261009155231",name:"one"}]);
assert.ok(invalid.blockers.includes("noncanonical_local_filename"));
assert.ok(invalid.blockers.includes("duplicate_local_versions"));
assert.ok(invalid.blockers.includes("same_version_different_name"));
assert.equal(drift.read_only,true);
console.log("PASS R27 full migration drift: block historical replay, mismatched names, missing versions and invalid timestamps");
