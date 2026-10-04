import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath=new URL('../supabase/functions/_shared/whatsapp-meta-webhook-v1.mjs',import.meta.url);
const edgePath='supabase/functions/whatsapp-meta-webhook-v1/index.ts';
const migrationPath='supabase/sql/20261004_whatsapp_template_events_v1.sql';
const fixture=(name)=>JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`,import.meta.url),'utf8'));

const helper=await import(helperPath.href);
assert.equal(typeof helper.templateEventsFromMeta,'function','templateEventsFromMeta deve existir');

const approved=helper.templateEventsFromMeta(fixture('meta-webhook-template-status-approved.redacted.json'));
assert.equal(approved.length,1);
assert.equal(approved[0].waba_id,'1497253794754816');
assert.equal(approved[0].meta_template_id,'920070352646140');
assert.equal(approved[0].template_name,'ofertas_outubro_01');
assert.equal(approved[0].language,'pt_BR');
assert.equal(approved[0].event_type,'APPROVED');
assert.equal(approved[0].status,'APPROVED');
assert.equal(approved[0].reason,null);
assert.match(approved[0].provider_event_key,/1497253794754816.*920070352646140.*APPROVED/);

const rejected=helper.templateEventsFromMeta(fixture('meta-webhook-template-status-rejected.redacted.json'));
assert.equal(rejected.length,1);
assert.equal(rejected[0].status,'REJECTED');
assert.equal(rejected[0].reason,'INCORRECT_CATEGORY');

const qualityPayload={
  object:'whatsapp_business_account',
  entry:[{
    id:'1497253794754816',time:1791144120,
    changes:[{
      field:'message_template_status_update',
      value:{
        event:'FLAGGED',
        message_template_id:'920070352646140',
        message_template_name:'ofertas_outubro_01',
        message_template_language:'pt-BR',
        quality_score:'YELLOW',
        access_token:'should-not-persist',
        secret:'should-not-persist',
      }
    }]
  }]
};
const quality=helper.templateEventsFromMeta(qualityPayload);
assert.equal(quality.length,1);
assert.equal(quality[0].language,'pt_BR','webhook pode usar hífen, cache usa underscore');
assert.equal(quality[0].status,'FLAGGED');
assert.equal(quality[0].quality_rating,'YELLOW');
assert.doesNotMatch(JSON.stringify(quality[0].payload),/should-not-persist|access_token|secret/i,'payload persistido deve ser allowlist/redigido');

assert.equal(fs.existsSync(migrationPath),true,'migration de eventos de template deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');
assert.match(sql,/create table if not exists public\.whatsapp_template_events_v1/i);
assert.match(sql,/provider_event_key[\s\S]{0,100}(unique|create unique index)/i,'evento Meta deve ser idempotente');
assert.match(sql,/create or replace function public\.whatsapp_apply_template_event_v1/i);
assert.match(sql,/security definer/i);
assert.match(sql,/update\s+public\.whatsapp_templates_v1/i,'evento pode atualizar somente cache existente');
assert.doesNotMatch(sql,/insert\s+into\s+public\.whatsapp_templates_v1/i,'webhook não pode inventar template aprovado');
assert.match(sql,/whatsapp_account_id\s*=\s*v_account_id/i,'update precisa ficar restrito à WABA resolvida');
assert.match(sql,/revoke all on function public\.whatsapp_apply_template_event_v1[\s\S]*from public, anon, authenticated/i);
assert.match(sql,/grant execute on function public\.whatsapp_apply_template_event_v1[\s\S]*to service_role/i);

const edge=fs.readFileSync(edgePath,'utf8');
assert.match(edge,/templateEventsFromMeta/);
assert.match(edge,/whatsapp_apply_template_event_v1/);
assert.match(edge,/p_payload:\s*event\.payload/,'Edge deve persistir somente payload allowlist do normalizador');
assert.match(edge,/template_events_(captured|recorded)/);
assert.match(edge,/template_events_unmatched/,'WABA desconhecida deve ser observável e segura');
assert.doesNotMatch(edge,/1497253794754816|840102181903253/,'webhook não pode hardcodar WABA');

console.log('PASS test-whatsapp-meta-template-events-v1');
