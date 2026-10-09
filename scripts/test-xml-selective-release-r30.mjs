import assert from 'node:assert/strict';
import {planSelectiveXmlRelease,REQUIRED_GATES,sha256} from './xml-selective-release-planner-r30.mjs';
const remote=[
 {version:'20261009155231',name:'separation_ready_reservation_idempotence_20261009'},
 {version:'20261009190052',name:'fiscal_nfe_autorecovery_v1_20261009'}
];
const gates=Object.fromEntries(REQUIRED_GATES.map(g=>[g,true]));
const args={remoteMigrations:remote,identityVersion:'20261009210000',reviewVersion:'20261009210001'};
const pending=planSelectiveXmlRelease(args);
assert.equal(pending.ok_for_review,false);
assert.ok(pending.errors.includes('unverified_authenticated_owner_edge'));
assert.ok(pending.errors.includes('unverified_browser_mobile_desktop'));
assert.equal(pending.can_apply_to_production,false);
const reviewed=planSelectiveXmlRelease({...args,verifiedGates:gates});
assert.equal(reviewed.ok_for_review,true);
assert.equal(reviewed.can_apply_to_production,false);
assert.equal(reviewed.selected_count,2);
assert.equal(reviewed.sources.length,2);
assert.ok(reviewed.sources.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
assert.ok(reviewed.no_global_db_push&&reviewed.no_migration_repair&&reviewed.read_only);
const old=planSelectiveXmlRelease({...args,
 identityVersion:'20261009185312',reviewVersion:'20261009185314',verifiedGates:gates});
assert.ok(old.errors.includes('cli_versions_precede_or_equal_live_head'));
const collision=planSelectiveXmlRelease({...args,
 identityVersion:'20261009230000',reviewVersion:'20261009230000',verifiedGates:gates});
assert.ok(collision.errors.includes('identity_must_precede_review'));
const duplicated=planSelectiveXmlRelease({...args,
 remoteMigrations:[...remote,{version:'20261009201000',name:'purchase_xml_field_approval_release'}],
 verifiedGates:gates});
assert.ok(duplicated.errors.includes('equivalent_xml_release_may_already_have_been_applied'));
assert.throws(()=>planSelectiveXmlRelease({remoteMigrations:[]}),/snapshot_required/);
assert.notEqual(sha256('identity'),sha256('review'));
console.log('PASS R30: CLI versions > remote, two selected SQL digests, no db push, no repair, release fails closed without Edge/browser/backup gates');
