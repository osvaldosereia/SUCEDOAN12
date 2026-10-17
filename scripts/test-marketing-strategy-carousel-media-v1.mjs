import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sendTemplateViaMeta} from '../supabase/functions/_shared/whatsapp-meta-transport-v1.mjs';

const migration='supabase/migrations/20261005194000_marketing_strategy_carousel_media_tracking_v1.sql';
assert.equal(fs.existsSync(migration),true,'hardening de tracking do carousel deve existir em migration nova');
const sql=fs.readFileSync(migration,'utf8');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_issue_tracking_links_v1/i,'migration deve substituir emissão de tracking de forma versionada');
assert.match(sql,/image_url/i,'tracking deve devolver imagem da Cesta/Kit por card');
assert.match(sql,/marketing_strategy_offers_v1/i,'imagem deve vir da oferta canônica da Estratégia');
assert.match(sql,/revoke\s+all[\s\S]*marketing_issue_tracking_links_v1[\s\S]*anon[\s\S]*authenticated/i,'tracking continua service-role only');
assert.doesNotMatch(sql,/campaigns_enabled\s*=\s*true|ana_enabled\s*=\s*true|mode\s*=\s*['"]live['"]/i,'hardening não pode ativar runtime');

const worker=fs.readFileSync('supabase/functions/whatsapp-marketing-worker-v1/index.ts','utf8');
assert.match(worker,/image_url/i,'worker deve consumir image_url por card');
assert.match(worker,/type\s*:\s*['"]header['"]/i,'worker deve enviar header dinâmico por card');
assert.match(worker,/type\s*:\s*['"]image['"]/i,'header do card deve usar parâmetro image');
assert.match(worker,/sub_type\s*:\s*['"]url['"]/i,'card deve manter botão URL dinâmico');

const components=[{
  type:'carousel',
  cards:[{
    card_index:0,
    components:[
      {type:'header',parameters:[{type:'image',image:{link:'https://www.donaantonia.com.br/img/cesta-teste.jpg'}}]},
      {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:'0123456789abcdef0123456789abcdef0123'}]},
    ],
  },{
    card_index:1,
    components:[
      {type:'header',parameters:[{type:'image',image:{link:'https://ssbesxgaijknwsjbsbcz.supabase.co/storage/v1/object/public/products/kit-teste.jpg'}}]},
      {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:'fedcba9876543210fedcba9876543210fedc'}]},
    ],
  }],
}];
const requests=[];
const sent=await sendTemplateViaMeta({
  accessToken:'meta-token',phoneNumberId:'945659128620084',toE164:'+5565998150975',
  templateName:'mkt_carousel_tracking_media_v1',languageCode:'pt_BR',components,graphVersion:'v23.0',
  fetchImpl:async(_url,init)=>{
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({messages:[{id:'wamid.CAROUSEL_MEDIA_TEST'}]}),{status:200,headers:{'content-type':'application/json'}});
  },
});
assert.equal(sent.providerMessageId,'wamid.CAROUSEL_MEDIA_TEST');
assert.equal(requests.length,1);
assert.deepEqual(requests[0].template.components,components,'transport deve preservar header de imagem e URL rastreável do carousel');

console.log('marketing strategy carousel media v1 contract: ok');
