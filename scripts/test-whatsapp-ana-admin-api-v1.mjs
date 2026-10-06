import assert from 'node:assert/strict';
import fs from 'node:fs';
import { authorizeAnaAdmin, anaAdminPermission } from '../supabase/functions/_shared/ana-admin-auth-v1.mjs';

assert.equal(anaAdminPermission(null,'admin_load'),false);
assert.equal(anaAdminPermission('viewer','admin_load'),true);
assert.equal(anaAdminPermission('editor','admin_save_draft'),true);
assert.equal(anaAdminPermission('editor','admin_test'),true);
assert.equal(anaAdminPermission('editor','admin_publish'),false);
assert.equal(anaAdminPermission('owner','admin_publish'),true);
assert.equal(anaAdminPermission('owner','admin_set_channel'),true);
assert.equal(anaAdminPermission('admin','admin_set_channel'),false);
assert.equal((await authorizeAnaAdmin({authorization:'',authClient:{},serviceClient:{}})).error,'admin_auth_required');
const serviceClient={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'viewer',is_active:true}})})})})};
const authClient={auth:{getUser:async token=>({data:{user:{id:'00000000-0000-4000-8000-000000000001'}},error:null})}};
assert.equal((await authorizeAnaAdmin({authorization:'Bearer token',authClient,serviceClient})).role,'viewer');
assert.equal((await authorizeAnaAdmin({authorization:'Bearer token',authClient:{auth:{getUser:async()=>({data:{},error:new Error()})}},serviceClient})).error,'admin_session_invalid');
const inactiveService={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'owner',is_active:false}})})})})};
assert.equal((await authorizeAnaAdmin({authorization:'Bearer token',authClient,serviceClient:inactiveService})).error,'admin_not_authorized');
const endpoint=fs.readFileSync('supabase/functions/admin-whatsapp-ana-preview-v1/index.ts','utf8');
for(const action of ['admin_load','admin_save_draft','admin_publish','admin_rollback','admin_set_channel','admin_test','admin_history']) assert.match(endpoint,new RegExp(action));
assert.match(endpoint,/authorizeAnaAdmin/);
assert.match(endpoint,/validateAnaConfiguration/);
assert.match(endpoint,/ops2_ana_admin_set_channel_v1/);
assert.match(endpoint,/row\.ana_enabled/);
const migration=fs.readFileSync('supabase/migrations/20261007_whatsapp_ana_admin_v1.sql','utf8');
assert.match(migration,/SET ana_enabled = p_enabled/);
assert.doesNotMatch(migration,/SET[^;]{0,160}(send_enabled|capture_enabled|campaigns_enabled)\\s*=/i);
assert.match(endpoint,/dry_run_not_sendable/);
console.log('PASS: ANA admin authentication, role matrix and management API contracts');




