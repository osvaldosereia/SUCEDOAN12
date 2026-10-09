import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditXmlReleaseR26,currentLocalMigrations,R26_REQUIRED_GATES} from "./xml-release-preflight-r26.mjs";
const local=currentLocalMigrations();
const remote=["20261009035359","20261009133642","20261009155231"];
const baseline=auditXmlReleaseR26({localFiles:local,remoteMigrations:remote});
assert.equal(baseline.ok,false,"Never approve real release with unverified operational gates");
assert.ok(!baseline.errors.includes("r23_pending_migration_older_than_remote_head"),
 "R27 CLI migration now follows the applied separation version");
assert.ok(baseline.errors.includes("unverified_supabase_isolated_auth_rls_edge"));
assert.ok(baseline.errors.includes("unverified_browser_mobile_desktop"));
assert.ok(!baseline.errors.includes("duplicate_separation_migration_must_not_replay"),
 "Canonical applied separation migration must not exist twice");
const duplicate=auditXmlReleaseR26({localFiles:[...local,
 "20261009160000_separation_ready_reservation_idempotence.sql"],
 remoteMigrations:remote});
assert.ok(duplicate.errors.includes("duplicate_separation_migration_must_not_replay"));
const missing=auditXmlReleaseR26({localFiles:local,
 remoteMigrations:["20261009035359"]});
assert.ok(missing.errors.includes("remote_separation_applied_version_missing"));
const reversed=auditXmlReleaseR26({localFiles:local.filter(x=>
 !x.includes("purchase_xml_field_approval_r27.sql")).concat(
 "20261009140000_purchase_xml_field_approval_r27.sql"),remoteMigrations:remote});
assert.ok(reversed.errors.includes("r23_must_precede_r24"));
const allVerified=Object.fromEntries(R26_REQUIRED_GATES.map(x=>[x,true]));
const namesReordered=local.map(x=>x
 .replace("20261009185312_purchase_xml_identity_atomic_r27.sql",
 "20261009170000_purchase_xml_identity_atomic_r27.sql")
 .replace("20261009185314_purchase_xml_field_approval_r27.sql",
 "20261009170100_purchase_xml_field_approval_r27.sql"));
const future=auditXmlReleaseR26({
 localFiles:namesReordered,remoteMigrations:remote,verifiedGates:allVerified
});
assert.deepEqual(future.errors,[],"Version sequencing is safe only after all independent gates");
assert.equal(future.release_allowed,true);
assert.equal(baseline.read_only,true);
const index=readFileSync(new URL("../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts",import.meta.url),"utf8");
for(const action of ["xml_catalog_fiscal_dossier","xml_field_apply_preview",
 "xml_field_apply_commit","xml_field_apply_rollback","xml_catalog_full_comparison"])
 assert.ok(index.includes(action),"R26 must preserve "+action);
const admin=readFileSync(new URL("../vitrine/admin/index.html",import.meta.url),"utf8");
// Do not mistake backend-only code for usable Admin buttons.
assert.ok(admin.includes("xmlCatalogFieldReviewMarkup"),"Existing XML review UI lost");
assert.ok(!/SUPABASE_SERVICE_ROLE_KEY\s*=|sb_secret_[a-z0-9]+/i.test(admin));
console.log("PASS R26: remote-head migration ordering, duplicate prevention, fail-closed release, Edge routes and UI-secret regression");
