import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const html=fs.readFileSync(new URL('../vitrine/admin/atendimento/index.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://donaantonia.com.br/vitrine/admin/atendimento/?embedded=1',pretendToBeVisual:true});
const {window}=dom;
for(const key of ['window','document','sessionStorage','location','HTMLElement','HTMLButtonElement','HTMLInputElement','HTMLTextAreaElement'])globalThis[key]=window[key];
globalThis.parent=window;
window.sessionStorage.setItem('da_finance_access_token_v1','test-token');
window.open=()=>null;
window.confirm=()=>true;

const messages=Array.from({length:14},(_,i)=>({
  id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
  direction:'inbound',message_type:'text',text_body:`Mensagem ${i+1}`,
  message_at:`2026-09-29T14:${String(38+i).padStart(2,'0')}:00.000Z`
}));

function jsonResponse(body,status=200){return Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}))}
globalThis.fetch=window.fetch=async input=>{
  const url=new URL(String(input));
  const action=url.searchParams.get('action');
  if(action==='accounts')return jsonResponse({ok:true,items:[
    {id:'230cd673-ded4-4514-8245-58804a1b044b',slug:'dona-antonia-1018',display_name:'1018',phone_e164:'+5565984491018'},
    {id:'308660df-72a0-4e23-b3e9-b36d7307bb20',slug:'dona-antonia-0975',display_name:'0975',phone_e164:'+5565998150975'}
  ]});
  if(action==='queue'){
    const account=url.searchParams.get('account_id');
    return jsonResponse({ok:true,items:account==='230cd673-ded4-4514-8245-58804a1b044b'?[{conversation_id:'45df8660-e1a8-4282-99a1-030c72e5a335',display_name:'Jucilene Jacinto',phone_e164:'+5565981736994',last_activity_at:'2026-09-29T15:19:20Z',last_message_text:'Deus abençoe vocês!',unread_count:14,has_order:true,registration_incomplete:false}]:[]});
  }
  if(action==='conversation')return jsonResponse({ok:true,conversation:{id:'45df8660-e1a8-4282-99a1-030c72e5a335',phone_e164:'+5565981736994',mode:'ai',last_inbound_at:'2026-09-29T15:19:20Z'},account:{phone_e164:'+5565984491018'},messages,service_window:{open:false,remaining_seconds:0}});
  if(action==='context')return jsonResponse({ok:true,customer:{id:'d390c67c-1bb1-4acc-957d-8a21bc793089',name:'Jucilene Jacinto',phone_e164:'+5565981736994',order_count:1,lifetime_value:178,marketing_opt_in:false},address:{city:'Várzea Grande'},registration:{registration_complete:true},orders:[]});
  return jsonResponse({ok:true});
};

await import(new URL('../vitrine/admin/atendimento/attendance.js?render-test=1',import.meta.url));
await new Promise(r=>setTimeout(r,50));
const card=[...document.querySelectorAll('#queue1018 .queue-card')].find(x=>x.textContent.includes('Jucilene Jacinto'));
assert.ok(card,'Jucilene deve aparecer na fila 1018');
card.click();
await new Promise(r=>setTimeout(r,80));
const box=document.querySelector('#messages');
assert.equal(box.hidden,false,'histórico deve ficar visível após selecionar a conversa');
assert.equal(box.querySelectorAll('.message-row').length,14,'as 14 mensagens devem ser renderizadas');
assert.match(box.textContent,/Mensagem 1/);
assert.match(box.textContent,/Mensagem 14/);
assert.equal(document.querySelector('#conversationEmpty').hidden,true,'estado vazio deve permanecer oculto');
console.log('OK · conversa com 14 mensagens renderiza o histórico no DOM.');
