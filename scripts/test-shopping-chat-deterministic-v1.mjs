import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const coreUrl=new URL('../supabase/functions/shopping-chat-deterministic-v1/core.mjs',import.meta.url);
const edgePath=new URL('../supabase/functions/shopping-chat-deterministic-v1/index.ts',import.meta.url);
const migrationPath=new URL('../supabase/migrations/20260912052000_shopping_chat_deterministic_v1.sql',import.meta.url);
const papoaiMigrationPath=new URL('../supabase/migrations/20260912130000_shopping_chat_papoai_identity_v1.sql',import.meta.url);

test('core exists and routes without AI', async()=>{
  assert.equal(existsSync(coreUrl),true,'core missing');
  const {routeDeterministicText}=await import(coreUrl.href);
  assert.deepEqual(routeDeterministicText('quero ver as cestas'),{type:'baskets',state:'VIEWING_BASKETS'});
  assert.deepEqual(routeDeterministicText('tem ofertas?'),{type:'products',offers:true,state:'VIEWING_PRODUCTS'});
  assert.deepEqual(routeDeterministicText('quero finalizar'),{type:'checkout',state:'CHECKOUT'});
  assert.deepEqual(routeDeterministicText('formas de pagamento'),{type:'payment',state:'INFO_PAYMENT'});
  assert.deepEqual(routeDeterministicText('onde entrega?'),{type:'delivery',state:'INFO_DELIVERY'});
  assert.deepEqual(routeDeterministicText('quero falar com atendente'),{type:'human',state:'HUMAN_SERVICE'});
  assert.deepEqual(routeDeterministicText('xyz assunto não previsto'),{type:'menu',state:'MENU'});
});

test('metadata merge preserves payment selected before trigger logging', async()=>{
  const {mergeDeterministicMetadata}=await import(coreUrl.href);
  assert.deepEqual(
    mergeDeterministicMetadata({state:'CHECKOUT',payment_method:'pix'},'CHECKOUT'),
    {state:'CHECKOUT',payment_method:'pix'}
  );
  assert.deepEqual(
    mergeDeterministicMetadata({state:'CHECKOUT',payment_method:'cash'},'CHECKOUT',{source:'papoai'}),
    {state:'CHECKOUT',payment_method:'cash',source:'papoai'}
  );
});

test('PapoAI identity parser accepts current and Portuguese webhook fields', async()=>{
  const {extractPapoAIIdentity}=await import(coreUrl.href);
  assert.deepEqual(extractPapoAIIdentity({name:'Maria Silva',phone:'+5565999999999'}),{name:'Maria Silva',phone:'+5565999999999'});
  assert.deepEqual(extractPapoAIIdentity({nome:'João',telefone:'(65) 99999-9999'}),{name:'João',phone:'(65) 99999-9999'});
});

test('new edge has no AI, OpenAI, Make or Bling path',()=>{
  const src=readFileSync(edgePath,'utf8').toLowerCase();
  for(const forbidden of ['queue_ai_job','openai','conversation-worker','make_webhook','bling']) assert.equal(src.includes(forbidden),false,`forbidden token: ${forbidden}`);
  assert.match(src,/shopping_chat_deterministic_config/);
  assert.match(src,/shopping_chat_trigger_events/);
  assert.match(src,/media_disabled_in_deterministic_chat/);
  assert.match(src,/create_papoai_room/);
  assert.match(src,/deterministic_chat_attach_papoai_contact_v1/);
  assert.match(src,/select\('metadata'\)/);
  assert.match(src,/mergeDeterministicMetadata/);
});

test('migration creates deterministic config, audit and local-only checkout',()=>{
  const sql=readFileSync(migrationPath,'utf8').toLowerCase();
  assert.match(sql,/create table if not exists public\.shopping_chat_deterministic_config/);
  assert.match(sql,/create table if not exists public\.shopping_chat_trigger_events/);
  assert.match(sql,/create or replace function public\.deterministic_chat_start_session_v1/);
  assert.match(sql,/create or replace function public\.deterministic_chat_identify_customer_v1/);
  assert.match(sql,/create or replace function public\.deterministic_chat_checkout_preview_v1/);
  assert.match(sql,/create or replace function public\.deterministic_chat_confirm_order_v1/);
  assert.match(sql,/'storefront_received'/);
  assert.match(sql,/set status='confirmed'/);
  assert.match(sql,/'deterministic_chat'/);
  assert.equal(sql.includes('queue_bling'),false);
});

test('PapoAI bridge only attaches existing customers and never auto-registers from a profile name',()=>{
  assert.equal(existsSync(papoaiMigrationPath),true,'PapoAI migration missing');
  const sql=readFileSync(papoaiMigrationPath,'utf8').toLowerCase();
  assert.match(sql,/create or replace function public\.deterministic_chat_attach_papoai_contact_v1/);
  assert.match(sql,/customer_found/);
  assert.match(sql,/customer_ambiguous/);
  assert.match(sql,/identity_source/);
  assert.equal(sql.includes('insert into public.customers'),false);
  assert.equal(sql.includes('update public.customers'),false);
});