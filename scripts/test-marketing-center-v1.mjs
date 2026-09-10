import fs from 'node:fs';
import assert from 'node:assert/strict';

const foundation=fs.readFileSync('supabase/migrations/20260910004500_marketing_center_foundation_v1.sql','utf8');
const presets=fs.readFileSync('supabase/migrations/20260910004600_marketing_default_presets_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/admin-marketing-v1/index.ts','utf8');
const ui=fs.readFileSync('admin-v3/marketing-center.js','utf8');
const cfg=fs.readFileSync('admin/config.js','utf8');
const toml=fs.readFileSync('supabase/config.toml','utf8');

for(const table of ['marketing_runtime_config','marketing_channel_accounts','marketing_command_presets','marketing_content_templates','marketing_campaigns','marketing_assets','marketing_publication_jobs','marketing_events']){
  assert.match(foundation,new RegExp(`create table if not exists public\\.${table}`,'i'),`${table} missing`);
  assert.match(foundation,new RegExp(`alter table public\\.${table} enable row level security`,'i'),`${table} RLS missing`);
}
for(const channel of ['whatsapp_status','instagram_story','facebook_story','instagram_carousel','pinterest_pin','google_business_post']){
  assert.ok(foundation.includes(channel),`${channel} missing from foundation`);
  assert.ok(ui.includes(channel),`${channel} missing from UI`);
}
for(const mode of ['no_ai','ai','hybrid','manual']) assert.ok(foundation.includes(`'${mode}'`),`${mode} mode missing`);

assert.match(foundation,/enabled boolean not null default false/i);
assert.match(foundation,/execution_mode text not null default 'off'/i);
assert.match(foundation,/canary_percent smallint not null default 0/i);
assert.match(foundation,/kill_switch boolean not null default true/i);
assert.match(foundation,/publishing_enabled boolean not null default false/i);
assert.match(foundation,/max_daily_ai_cost_cents integer not null default 0/i);
assert.match(foundation,/revoke all on table public\.marketing_publication_jobs from public, anon, authenticated/i);
assert.match(foundation,/grant select,insert on table public\.marketing_events to service_role/i);
assert.doesNotMatch(foundation,/grant\s+(?:all|insert|update|delete)[^;]*marketing_events[^;]*to\s+(?:anon|authenticated)/i);

assert.match(presets,/video_ofertas_economico/);
assert.match(presets,/deterministic_renderer/);
assert.match(presets,/imagem_produto_ia_opcional/);
assert.match(presets,/requires_ai_gate/);
assert.match(presets,/command_text,negative_prompt,variables,settings/);

assert.match(edge,/npm:@supabase\/supabase-js@2\.112\.3/,'Supabase client must be pinned');
for(const action of ['overview','create_command','create_template','create_campaign','update_campaign','create_asset','update_asset','create_publication_draft','kill']) assert.ok(edge.includes(`action==="${action}"`),`${action} missing`);
for(const forbidden of ['publish','enable','approve','set_canary','write_token','activate']) assert.doesNotMatch(edge,new RegExp(`action===?['\"]${forbidden}['\"]`,'i'),`forbidden action ${forbidden} exposed`);
assert.match(edge,/admin\.role!=="owner"/,'kill must require owner');

assert.match(cfg,/marketingEdgeFunction:\s*'admin-marketing-v1'/);
assert.match(cfg,/marketingUiEnabled:\s*true/,'safe Marketing UI should be visible');
assert.match(cfg,/Conteúdo, campanhas, canais e automações sem Make\./);
assert.match(toml,/\[functions\.admin-marketing-v1\][\s\S]*?verify_jwt\s*=\s*true/);

assert.match(ui,/name="mktMode" value="no_ai"/);
assert.match(ui,/name="mktMode" value="ai"/);
assert.match(ui,/name="mktMode" value="hybrid"/);
assert.match(ui,/name="mktMode" value="manual"/);
assert.match(ui,/api\('update_asset'/,'asset edit must persist');
assert.match(ui,/api\(id\?'update_campaign':'create_campaign'/,'campaign drafts must be editable');
assert.match(ui,/Reutilizar\/editar/,'saved commands must be reusable');
assert.doesNotMatch(ui,/Make\.com|functions\/v1\/make|hook\.make\.com/i,'Marketing UI must not depend on Make');

console.log('marketing-center-v1 contract OK');
