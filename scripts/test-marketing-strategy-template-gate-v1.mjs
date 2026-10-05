import assert from 'node:assert/strict';
import fs from 'node:fs';

const helperPath='supabase/functions/_shared/marketing-template-strategy-v1.mjs';
assert.equal(fs.existsSync(helperPath),true,'helper de reuso de template da Estratégia deve existir');
const helper=await import(`../${helperPath}?t=${Date.now()}`);
assert.equal(typeof helper.findReusableTemplate,'function','helper deve exportar findReusableTemplate');
assert.equal(typeof helper.buildStrategyTemplateDraft,'function','helper deve exportar buildStrategyTemplateDraft');

const strategy={id:'11111111-1111-4111-8111-111111111111',whatsapp_account_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',offer_format:'single',copy_snapshot:{headline:'Cesta Família',body:'Oferta da semana',cta:'Ver cesta'}};
const compatible={id:'22222222-2222-4222-8222-222222222222',whatsapp_account_id:strategy.whatsapp_account_id,category:'MARKETING',status:'APPROVED',language:'pt_BR',components:[{type:'BODY',text:'{{1}}\n\n{{2}}\n\n{{3}}'}],metadata:{strategy_profile:{offer_format:'single',version:1,reusable:true,compatibility_key:'single:v1'}}};
const protectedCompatible={...compatible,id:'33333333-3333-4333-8333-333333333333',lifecycle:{protected:true}};
const templates=[
  {...compatible,id:'44444444-4444-4444-8444-444444444444',status:'PENDING'},
  {...compatible,id:'55555555-5555-4555-8555-555555555555',category:'UTILITY'},
  {...compatible,id:'66666666-6666-4666-8666-666666666666',whatsapp_account_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
  compatible,
];
assert.equal(helper.findReusableTemplate(strategy,templates)?.id,compatible.id,'deve reutilizar primeiro template MARKETING APPROVED compatível da mesma conta');
assert.equal(helper.findReusableTemplate(strategy,[protectedCompatible])?.id,protectedCompatible.id,'template protegido pode ser reutilizado sem ser alterado');
assert.equal(helper.findReusableTemplate({...strategy,offer_format:'carousel'},templates),null,'formato incompatível não pode ser reutilizado');
assert.equal(helper.findReusableTemplate(strategy,templates.map(item=>({...item,status:'REJECTED'}))),null,'template não aprovado não pode ser reutilizado');
assert.equal(protectedCompatible.lifecycle.protected,true,'helper puro não pode alterar flag protected');

const legacyFixed={...compatible,id:'77777777-7777-4777-8777-777777777777',components:[{type:'BODY',text:'Oferta fixa antiga sem parâmetros'}],metadata:{}};
assert.equal(helper.findReusableTemplate(strategy,[legacyFixed]),null,'template legado fixo não pode ser tratado como compatível só por ser MARKETING APPROVED');
const legacyCanonical={...compatible,id:'88888888-8888-4888-8888-888888888888',metadata:{}};
assert.equal(helper.findReusableTemplate(strategy,[legacyCanonical])?.id,legacyCanonical.id,'template simples legado só pode ser reutilizado quando tiver exatamente a estrutura genérica segura');

const carouselStrategy={...strategy,offer_format:'carousel',offers:[
  {commercial_id:'10101010-1010-4010-8010-101010101010',public_lot_id:'aaaaaaaa-1111-4111-8111-aaaaaaaa1111',public_name:'Cesta Econômica',sale_price_snapshot:99.9},
  {commercial_id:'20202020-2020-4020-8020-202020202020',public_lot_id:'bbbbbbbb-2222-4222-8222-bbbbbbbb2222',public_name:'Cesta Família',sale_price_snapshot:159.9},
]};
const carouselProfile=helper.buildStrategyTemplateProfile(carouselStrategy,carouselStrategy.offers);
const carouselCompatible={...compatible,id:'99999999-9999-4999-8999-999999999999',components:[{type:'BODY',text:'Opções'},{type:'CAROUSEL',cards:[]}],metadata:{strategy_profile:carouselProfile}};
assert.equal(helper.findReusableTemplate(carouselStrategy,[carouselCompatible])?.id,carouselCompatible.id,'carrossel deve reutilizar somente perfil compatível exato');
const carouselWrongProfile={...carouselCompatible,id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',metadata:{strategy_profile:{...carouselProfile,compatibility_key:'carousel:2:outra-oferta'}}};
assert.equal(helper.findReusableTemplate(carouselStrategy,[carouselWrongProfile]),null,'carrossel com outra composição não pode ser reutilizado');
const carouselNoProfile={...carouselCompatible,id:'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',metadata:{}};
assert.equal(helper.findReusableTemplate(carouselStrategy,[carouselNoProfile]),null,'carrossel sem perfil explícito não pode ser reutilizado com segurança');

const simpleDraft=helper.buildStrategyTemplateDraft(strategy,[{public_name:'Cesta Família',sale_price_snapshot:159.9,image_url:'https://www.donaantonia.com.br/img/cesta.jpg'}],{name:'da_strategy_single_test'});
assert.equal(simpleDraft.category,'MARKETING');
assert.equal(simpleDraft.language,'pt_BR');
assert.match(JSON.stringify(simpleDraft),/\{\{1\}\}/,'template simples deve ser parametrizável/reutilizável');

const edgePath='supabase/functions/admin-marketing-strategy-v1/index.ts';
assert.equal(fs.existsSync(edgePath),true,'Edge Admin de Estratégia deve existir');
const source=fs.readFileSync(edgePath,'utf8');
assert.match(source,/marketing-template-strategy-v1\.mjs/,'Edge deve reutilizar helper de estratégia de templates');
assert.match(source,/submit_template/,'Edge deve expor action submit_template');
assert.match(source,/findReusableTemplate\s*\(/,'reuso deve ser tentado antes de criação Meta');
assert.match(source,/createTemplateViaMeta\s*\(/,'template simples deve usar transporte Meta existente');
assert.match(source,/createCarouselTemplateViaMeta\s*\(/,'carrossel deve usar helper Meta existente');
assert.match(source,/uploadTemplateMediaSampleViaMeta\s*\(/,'carrossel novo deve preparar mídia por helper existente');
assert.match(source,/status[^\n]{0,120}approved_internal|approved_internal[^\n]{0,120}status/i,'Portão A deve validar approved_internal antes da submissão');
assert.match(source,/template_reused/,'reuso deve ser auditado no ledger');
assert.match(source,/template_submitted_meta/,'submissão Meta deve ser auditada');
assert.match(source,/meta_rejected/,'rejeição Meta deve ser representada sem envio automático');
assert.doesNotMatch(source,/deleteTemplateViaMeta|editTemplateViaMeta/,'Task 5 não pode alterar/excluir template existente');
assert.doesNotMatch(source,/marketing_schedule_campaign_v1|marketing_start_campaign_v1|send_now|schedule_send/i,'Portão A não pode disparar campanha');
assert.doesNotMatch(source,/campaigns_enabled\s*[:=]\s*true|ana_enabled\s*[:=]\s*true|runtime_mode\s*[:=]\s*["']live["']/i,'Portão A não pode habilitar runtime');

const ui=fs.readFileSync('vitrine/admin/marketing/strategy-center.js','utf8');
assert.doesNotMatch(ui,/graph\.facebook\.com/i,'browser não pode chamar Graph');
assert.doesNotMatch(ui,/META_WHATSAPP_ACCESS_TOKEN|service_role/i,'browser não pode conter token/service role');

const workflow=fs.readFileSync('.github/workflows/marketing-professional-ui-ci.yml','utf8');
assert.ok(workflow.includes('scripts/test-marketing-strategy-template-gate-v1.mjs'),'CI deve executar contrato do Portão A');
assert.ok(workflow.includes('scripts/test-whatsapp-meta-template-admin-v1.mjs'),'CI deve manter regressão do template simples Meta');
assert.ok(workflow.includes('scripts/test-admin-whatsapp-template-carousel-v1.mjs'),'CI deve manter regressão do carrossel Meta');

console.log('marketing strategy template gate v1 contract: ok');
