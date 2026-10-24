import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(path,'utf8');
const api=read('supabase/functions/admin-whatsapp-templates-v1/index.ts');
const helper=read('supabase/functions/_shared/whatsapp-meta-flows-v1.mjs');
const ui=read('vitrine/admin/marketing/flow-center.js');
const marketing=read('vitrine/admin/marketing/marketing-polish.js');

assert.match(api,/eq\("slug","dona-antonia-1018"\)/);
assert.match(api,/if\(auth\.role!=="owner"\)/);
assert.match(api,/const FLOW_FUNCTION_PATH="\/functions\/v1\/whatsapp-1018-basket-flow-v1"/);
assert.match(api,/flow_readiness/);
assert.match(api,/flow_upload_json/);
assert.match(api,/flow_configure_endpoint/);
assert.match(api,/flow_register_key/);
assert.match(api,/flow_publish/);
assert.match(api,/flow_delete/);
assert.match(api,/DA_FLOW_1018_RSA_PKCS8/);
assert.doesNotMatch(api,/url\.searchParams\.set\(["']access_token/);

assert.match(helper,/headers\.Authorization='Bearer '\+cfg\.token/);
assert.match(helper,/assertFlowPublishable/);
assert.match(helper,/validation_errors/);
assert.match(helper,/whatsapp_business_encryption/);
assert.doesNotMatch(helper,/searchParams\.set\(["']access_token/);

assert.match(ui,/attendanceAuthorizedFetch/);
assert.match(ui,/functions\/v1\/admin-whatsapp-templates-v1/);
assert.match(ui,/flow_upload_json/);
assert.match(ui,/flow_configure_endpoint/);
assert.match(ui,/flow_register_key/);
assert.match(ui,/flow_publish/);
assert.match(ui,/window\.confirm/);
assert.match(ui,/whatsapp-lab/);
assert.doesNotMatch(ui,/0975|interactive\.flow|sendTemplateViaMeta|DA_FLOW_1018_RSA_PKCS8|META_WHATSAPP_ACCESS_TOKEN/);

assert.match(marketing,/PRIMARY_MARKETING_VIEWS=\[[^\]]*'flows'/);
assert.match(marketing,/view==='flows'/);
console.log('PASS Admin Flow manager is pinned to 1018, owner-gated, session-authenticated and publication-gated');
