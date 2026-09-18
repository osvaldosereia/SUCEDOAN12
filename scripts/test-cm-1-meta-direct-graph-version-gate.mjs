import fs from 'node:fs';
import assert from 'node:assert/strict';

const direct=fs.readFileSync('supabase/functions/whatsapp-meta-direct-v1/index.ts','utf8');
const admin=fs.readFileSync('supabase/functions/admin-whatsapp-direct-v1/index.ts','utf8');

assert.doesNotMatch(direct,/META_GRAPH_VERSION"\)\|\|"v\d+\.\d+"/);
assert.match(direct,/META_GRAPH_VERSION"\)\|\|""/);
assert.match(direct,/meta_graph_version_unverified/);
assert.match(direct,/graph_version_ready/);
assert.match(direct,/release_mode==="off"/);
assert.match(direct,/invalid_signature/);

assert.doesNotMatch(admin,/META_GRAPH_VERSION"\)\|\|"v\d+\.\d+"/);
assert.match(admin,/graphVersionReady/);
assert.match(admin,/meta_graph_version_unverified/);
assert.match(admin,/secureReady/);
assert.match(admin,/owner_required/);
assert.match(admin,/meta_credentials_missing/);

console.log('cm-1 meta direct graph version fail-closed contract ok');
