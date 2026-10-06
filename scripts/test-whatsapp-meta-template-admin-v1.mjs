import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperUrl=new URL('../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs',import.meta.url);
const edgeUrl=new URL('../supabase/functions/admin-whatsapp-templates-v1/index.ts',import.meta.url);

const {buildTemplateCacheRows,validateTemplateDraft}=await import(helperUrl.href);

const syncedAt='2026-10-02T22:10:00.000Z';
const account={id:'11111111-1111-4111-8111-111111111111',waba_id:'1497253794754816',slug:'dona-antonia-0975'};
const items=[{
  meta_template_id:'123',name:'pedido_confirmado',language:'pt_BR',category:'UTILITY',status:'APPROVED',
  components:[{type:'BODY',text:'Pedido {{1}} confirmado.'}],quality_rating:'GREEN',rejected_reason:null,
  last_updated_time:'2026-10-02T20:00:00+0000',meta_quality_score:{score:'GREEN'}
}];
const existingByKey=new Map([['pedido_confirmado\u0000pt_BR',{
  metadata:{attendance:{show_in_attendance:true,favorite_order:7},local_note:'preservar'}
}]]);
const rows=buildTemplateCacheRows({items,account,existingByKey,syncedAt});
assert.equal(rows.length,1);
assert.equal(rows[0].whatsapp_account_id,account.id);
assert.equal(rows[0].waba_id,account.waba_id);
assert.equal(rows[0].meta_template_id,'123');
assert.equal(rows[0].status,'APPROVED');
assert.equal(rows[0].quality_rating,'GREEN');
assert.equal(rows[0].last_synced_at,syncedAt);
assert.deepEqual(rows[0].metadata.attendance,{show_in_attendance:true,favorite_order:7});
assert.equal(rows[0].metadata.local_note,'preservar');
assert.equal(rows[0].metadata.sync_source,'meta_cloud_api');
assert.equal(rows[0].metadata.rejected_reason,null);

const media=validateTemplateDraft({name:'oferta_imagem',language:'pt_BR',category:'MARKETING',components:[
  {type:'HEADER',format:'IMAGE',example:{header_handle:['4::sample-handle']}},
  {type:'BODY',text:'Olá {{1}}',example:{body_text:[['Maria']]}},
  {type:'BUTTONS',buttons:[{type:'PHONE_NUMBER',text:'Telefonar',phone_number:'5565998150975'}]}
]});
assert.equal(media.components[0].format,'IMAGE');
assert.equal(media.components[0].example.header_handle[0],'4::sample-handle');
assert.equal(media.components[2].buttons[0].type,'PHONE_NUMBER');

const location=validateTemplateDraft({name:'localizacao_loja',language:'pt_BR',category:'UTILITY',components:[
  {type:'HEADER',format:'LOCATION'},
  {type:'BODY',text:'Confira nossa localização.'}
]});
assert.equal(location.components[0].format,'LOCATION');

const catalog=validateTemplateDraft({name:'ver_catalogo',language:'pt_BR',category:'MARKETING',components:[
  {type:'BODY',text:'Veja nossos produtos.'},
  {type:'BUTTONS',buttons:[{type:'CATALOG',text:'Ver catálogo'}]}
]});
assert.equal(catalog.components[1].buttons[0].type,'CATALOG');

const authTemplate=validateTemplateDraft({name:'codigo_acesso',language:'pt_BR',category:'AUTHENTICATION',components:[
  {type:'BODY',add_security_recommendation:true},
  {type:'FOOTER',code_expiration_minutes:10},
  {type:'BUTTONS',buttons:[{type:'OTP',otp_type:'COPY_CODE',text:'Copiar código'}]}
]});
assert.equal(authTemplate.category,'AUTHENTICATION');
assert.equal(authTemplate.components[0].add_security_recommendation,true);
assert.equal(authTemplate.components[2].buttons[0].type,'OTP');

assert.throws(()=>validateTemplateDraft({name:'imagem_sem_amostra',language:'pt_BR',category:'MARKETING',components:[{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Teste'}]}),/meta_template_header_handle_required/);

assert.equal(fs.existsSync(edgeUrl),true,'Edge Function administrativa de templates deve existir');
const edge=fs.readFileSync(edgeUrl,'utf8');
assert.match(edge,/adminAuth/);
assert.match(edge,/admin_users/,'mutations devem continuar protegidas por Admin ativo');
assert.match(edge,/META_WHATSAPP_ACCESS_TOKEN/);
assert.match(edge,/META_WHATSAPP_GRAPH_VERSION/);
assert.match(edge,/listTemplatesViaMeta/);
assert.match(edge,/createTemplateViaMeta/,'Edge deve importar helper de criação');
assert.match(edge,/editTemplateViaMeta/,'Edge deve importar helper de edição');
assert.match(edge,/deleteTemplateViaMeta/,'Edge deve importar helper de exclusão');
assert.match(edge,/whatsapp_templates_v1/);
assert.match(edge,/onConflict:\s*["']waba_id,name,language["']/);
assert.match(edge,/action\s*!==\s*["']list["'][\s\S]{0,80}action\s*!==\s*["']sync["']/,'GET deve continuar deny-by-default fora de list/sync');
assert.match(edge,/action\s*===\s*["']sync["']/,'sync deve continuar executando atualização remota');
assert.match(edge,/req\.method\s*===\s*["']POST["']/,'POST deve ficar em ramo separado do list/sync');
assert.match(edge,/action\s*===\s*["']create["']/,'POST create deve existir');
assert.match(edge,/action\s*===\s*["']edit["']/,'POST edit deve existir');
assert.match(edge,/action\s*===\s*["']delete["']/,'POST delete deve existir');
assert.match(edge,/templateById|templateRowById/,'edit/delete devem resolver template local antes da Meta');
assert.match(edge,/create[\s\S]{0,2200}accountById\(/,'create deve resolver WABA por account local');
assert.match(edge,/edit[\s\S]{0,2600}syncTemplates\(/,'edit deve sincronizar cache após sucesso');
assert.match(edge,/delete[\s\S]{0,2600}syncTemplates\(/,'delete deve sincronizar cache após sucesso');
assert.match(edge,/mutation_fields_not_allowed/,'browser não pode injetar WABA/token/destino nas mutations');
assert.match(edge,/waba_id/);
assert.match(edge,/phone_number_id/);
assert.match(edge,/access_token/);
assert.match(edge,/to_phone_e164/);
assert.match(edge,/meta_template_mutation_uncertain/,'timeout/rede de mutation deve exigir sync antes de nova tentativa');
assert.doesNotMatch(edge,/EAA[A-Za-z0-9_-]{30,}/,'não pode conter token literal');
assert.doesNotMatch(edge,/shopping-checkout|shopping-chat-checkout|bling/i,'sync/mutations de templates não podem depender do checkout/Bling');

console.log('PASS test-whatsapp-meta-template-admin-v1');
