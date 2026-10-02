import assert from 'node:assert/strict';
import {
  listTemplatesViaMeta,
  normalizeMetaTemplate,
  MetaTemplatesError,
} from '../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs';

const sampleTemplate={
  id:'1234567890',
  name:'pedido_confirmado',
  language:'pt_BR',
  category:'UTILITY',
  status:'APPROVED',
  quality_score:{score:'GREEN',date:1790970000},
  rejected_reason:'NONE',
  last_updated_time:'2026-10-02T20:00:00+0000',
  components:[{type:'BODY',text:'Pedido {{1}} confirmado.'}],
};

{
  const normalized=normalizeMetaTemplate(sampleTemplate);
  assert.equal(normalized.meta_template_id,'1234567890');
  assert.equal(normalized.name,'pedido_confirmado');
  assert.equal(normalized.language,'pt_BR');
  assert.equal(normalized.category,'UTILITY');
  assert.equal(normalized.status,'APPROVED');
  assert.equal(normalized.quality_rating,'GREEN');
  assert.equal(normalized.rejected_reason,null);
  assert.deepEqual(normalized.components,sampleTemplate.components);
}

{
  const calls=[];
  const fetchImpl=async (url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify({data:[sampleTemplate],paging:{}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await listTemplatesViaMeta({
    accessToken:'secret-token',wabaId:'1497253794754816',graphVersion:'v26.0',fetchImpl,timeoutMs:2000,
  });
  assert.equal(result.ok,true);
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].name,'pedido_confirmado');
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/^https:\/\/graph\.facebook\.com\/v26\.0\/1497253794754816\/message_templates\?/);
  assert.match(calls[0].url,/fields=/);
  assert.match(calls[0].url,/limit=100/);
  assert.equal(calls[0].init.headers.Authorization,'Bearer secret-token');
}

{
  let page=0;
  const fetchImpl=async ()=>{
    page++;
    if(page===1)return new Response(JSON.stringify({
      data:[sampleTemplate],
      paging:{next:'https://graph.facebook.com/v26.0/1497253794754816/message_templates?after=CURSOR2&limit=100'}
    }),{status:200});
    return new Response(JSON.stringify({data:[{...sampleTemplate,id:'2',name:'segundo'}]}),{status:200});
  };
  const result=await listTemplatesViaMeta({accessToken:'t',wabaId:'1497253794754816',graphVersion:'v26.0',fetchImpl,maxPages:5});
  assert.equal(result.items.length,2);
  assert.equal(page,2);
}

{
  const fetchImpl=async ()=>new Response(JSON.stringify({
    data:[sampleTemplate],
    paging:{next:'https://evil.example/steal-token'}
  }),{status:200});
  await assert.rejects(
    ()=>listTemplatesViaMeta({accessToken:'top-secret',wabaId:'1497253794754816',graphVersion:'v26.0',fetchImpl}),
    error=>error instanceof MetaTemplatesError&&error.code==='meta_templates_invalid_paging_url'&&!String(error.message).includes('top-secret')
  );
}

{
  const fetchImpl=async ()=>new Response(JSON.stringify({error:{message:'bad',code:190}}),{status:401});
  await assert.rejects(
    ()=>listTemplatesViaMeta({accessToken:'never-log-me',wabaId:'1497253794754816',graphVersion:'v26.0',fetchImpl}),
    error=>error instanceof MetaTemplatesError&&error.code==='meta_templates_http_error'&&error.httpStatus===401&&!JSON.stringify(error).includes('never-log-me')
  );
}

{
  await assert.rejects(
    ()=>listTemplatesViaMeta({accessToken:'x',wabaId:'1497x',graphVersion:'v26.0',fetchImpl:fetch}),
    error=>error instanceof MetaTemplatesError&&error.code==='meta_templates_invalid_request'
  );
}

console.log('PASS test-whatsapp-meta-templates-v1');
