import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260918183416_marketing_connection_manager_oauth_v1.sql');
const workflow=read('supabase/functions/admin-marketing-workflow-v1/index.ts');
const oauth=read('supabase/functions/admin-marketing-workflow-v1/marketing-oauth-v1.ts');
const admin=read('admin/marketing.js');
const api=read('admin/marketing-api.js');
const callback=read('admin/marketing-oauth-callback.html');

test('OAuth session stores only state hash and expires quickly',()=>{
  assert.match(migration,/state_hash text not null unique/);
  assert.doesNotMatch(migration,/\bstate\s+text/i);
  assert.match(migration,/interval '15 minutes'/);
  assert.match(migration,/marketing_oauth_redirect_uri','https:\/\/donaantonia\.com\.br\/admin\/marketing-oauth-callback\.html'/);
});

test('OAuth and Vault surfaces are service-role only',()=>{
  assert.match(migration,/alter table public\.marketing_oauth_sessions enable row level security/);
  assert.match(migration,/revoke all on table public\.marketing_oauth_sessions from public,anon,authenticated/);
  for(const fn of ['marketing_vault_put_secret_v1','marketing_vault_get_secret_v1','marketing_vault_delete_secret_v1','marketing_provider_connection_snapshot_v1']){
    assert.match(migration,new RegExp('revoke all on function public\\.'+fn+'[\\s\\S]*from public,anon,authenticated'));
    assert.match(migration,new RegExp('grant execute on function public\\.'+fn+'[\\s\\S]*to service_role'));
  }
});

test('Round 8 does not enable publishing',()=>{
  assert.match(migration,/oauth_external_publish',false/);
  assert.doesNotMatch(migration,/publishing_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration,/instagram_.*publish_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration,/facebook_.*publish_enabled\s*=\s*true/i);
});

test('Meta OAuth requires explicit graph version and minimum publishing scopes',()=>{
  assert.doesNotMatch(admin,/graph_version\|\|'v26\.0'/);
  assert.match(workflow,/graph_version/);
  for(const scope of ['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish'])assert.ok(migration.includes("'"+scope+"'"),scope);
  assert.match(oauth,/www\.facebook\.com\/\$\{version\}\/dialog\/oauth/);
  assert.match(oauth,/\/me\/accounts/);
  assert.match(oauth,/instagram_business_account/);
});

test('Pinterest OAuth uses authorization code and continuous refresh storage',()=>{
  assert.match(oauth,/api\.pinterest\.com\/v5\/oauth\/token/);
  assert.match(oauth,/grant_type:'authorization_code'/);
  assert.match(oauth,/grant_type:'refresh_token'/);
  assert.match(workflow,/dona_antonia_marketing_pinterest_refresh_v1/);
  assert.match(workflow,/resolveMarketingChannelToken/);
  assert.match(workflow,/5\*86400000/);
});

test('Browser never receives provider access tokens',()=>{
  assert.doesNotMatch(admin,/page_token|access_token|refresh_token/i);
  assert.doesNotMatch(api,/page_token|access_token|refresh_token/i);
  assert.doesNotMatch(callback,/access_token|refresh_token|app_secret/i);
  assert.match(workflow,/candidates\.push\(\{id:p\.page_id,name:p\.page_name/);
  assert.match(workflow,/marketing_vault_put_secret_v1/);
});

test('Callback validates same-origin messaging and removes auth code from URL',()=>{
  assert.match(callback,/history\.replaceState/);
  assert.match(callback,/window\.opener\.postMessage\(payload,location\.origin\)/);
  assert.match(admin,/event\.origin!==location\.origin/);
  assert.match(admin,/marketing-oauth-callback/);
});

test('Only owner can configure and complete OAuth',()=>{
  for(const action of ['connection_save_config','oauth_start','oauth_exchange','oauth_complete']){
    const pos=workflow.indexOf('action==="'+action+'"');
    assert.ok(pos>=0,action+' missing');
    assert.match(workflow.slice(pos,pos+500),/admin\.role!=="owner"/);
  }
});

test('WhatsApp Template Assistant remains present',()=>{
  assert.match(admin,/getWhatsAppTemplateLibrary/);
  assert.match(admin,/createAiWhatsAppTemplateDraft/);
  assert.match(admin,/renderTemplateAssistant/);
});

test('connection manager is provider-level and channel-level',()=>{
  assert.match(admin,/Facebook \+ Instagram/);
  assert.match(admin,/Pinterest/);
  assert.match(admin,/renderRound8ConnectionManager/);
  assert.match(admin,/data-provider-oauth/);
  assert.match(admin,/data-oauth-choice/);
  assert.match(api,/getMarketingConnectionOverview/);
  assert.match(api,/completeMarketingOAuth/);
});

test('disconnect is local, owner-only and removes only provider Vault refs',()=>{
  const disconnectMigration=read('supabase/migrations/20260918184518_marketing_connection_disconnect_v1.sql');
  assert.match(disconnectMigration,/meta_page_\[a-z0-9_\]\+/);
  assert.match(disconnectMigration,/pinterest_access_v1/);
  assert.match(disconnectMigration,/pinterest_refresh_v1/);
  assert.match(disconnectMigration,/revoke all on function public\.marketing_vault_delete_provider_secret_v1\(text\) from public,anon,authenticated/);
  const pos=workflow.indexOf('action==="connection_disconnect"');
  assert.ok(pos>=0);
  assert.match(workflow.slice(pos,pos+450),/admin\.role!=="owner"/);
  assert.match(workflow.slice(pos,pos+3500),/external_side_effect:false/);
  assert.doesNotMatch(workflow.slice(pos,pos+3500),/graph\.facebook\.com|api\.pinterest\.com/);
  assert.match(admin,/data-provider-disconnect/);
  assert.match(api,/disconnectMarketingProvider/);
});


test('OAuth hardening cleans temp refs incrementally',()=>{
  assert.match(workflow,/marketing_oauth_cleanup_v1/);
  assert.match(workflow,/cleanupOAuthSessionSecrets/);
  assert.match(workflow,/secret_refs:\{pages:refs\}/);
  assert.match(workflow,/secret_refs:\{access:accessRef,refresh:null\}/);
  assert.match(workflow,/temp_secrets_cleaned:true/);
});
