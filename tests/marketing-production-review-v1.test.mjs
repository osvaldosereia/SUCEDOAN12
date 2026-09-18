import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Admin Marketing possui revisão, aprovação, reprovação e edição',()=>{
  const ui=read('admin/marketing.js');
  const api=read('admin/marketing-api.js');
  for(const token of ['submit-review','approve-asset','reject-asset','toggle-asset-edit','render-campaign','prepare-publication','fork-asset']) assert.match(ui,new RegExp(token));
  for(const token of ['submitMarketingAssetReview','approveMarketingAsset','rejectMarketingAsset','prepareMarketingPublication','saveMarketingAssetEdit','forkMarketingAsset']) assert.match(api,new RegExp(token));
});
test('Fluxo de publicação contempla nove destinos e mantém WhatsApp manual',()=>{
  const sql=read('supabase/migrations/20260918172504_marketing_production_review_flow_v1.sql');
  for(const channel of ['instagram_feed','instagram_story','instagram_reel','instagram_carousel','facebook_post','facebook_story','facebook_reel','pinterest_pin','whatsapp_status']) assert.match(sql,new RegExp(channel));
  assert.match(sql,/v_manual:=v_channel_name='whatsapp_status'/);
  assert.match(sql,/external_publish',false/);
});
test('Editar invalida mídia anterior antes de nova revisão',()=>{
  const sql=read('supabase/migrations/20260918172504_marketing_production_review_flow_v1.sql');
  assert.match(sql,/delete from public\.marketing_media_objects/);
  assert.match(sql,/invalidated_media_count/);
  assert.match(sql,/status='draft'/);
});
test('Painel de canais é fail-closed',()=>{
  const html=read('admin/marketing.html');
  const ui=read('admin/marketing.js');
  assert.match(html,/Canais oficiais/);
  assert.match(html,/FAIL-CLOSED/);
  assert.match(ui,/Bloqueado até concluir conexão\/homologação/);
  assert.match(ui,/publicação em Status permanece manual/);
});
