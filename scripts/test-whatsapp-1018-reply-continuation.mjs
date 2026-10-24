import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBasketReply,latestCanaryReply,CANARY_CONVERSATION} from '../vitrine/admin/whatsapp-lab/reply-parser.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('vitrine/admin/whatsapp-lab/lab.js'),html=read('vitrine/admin/whatsapp-lab/index.html');
const msg=(id,at='2026-10-24T17:43:46Z')=>({
 direction:'inbound',message_type:'interactive',message_at:at,
 metadata:{interactive:{type:'list_reply',list_reply:{id,title:'Cesta Mini'}}}
});
const wrap=messages=>({ok:true,account:{phone_e164:'+5565984491018',id:'account-1018'},
 conversation:{id:CANARY_CONVERSATION,whatsapp_account_id:'account-1018',phone_e164:'+5565999828360'},
 messages});
assert.deepEqual(parseBasketReply(msg('da:whatsapp:size:mini')),{kind:'size',size:'mini',id:'da:whatsapp:size:mini'});
assert.deepEqual(parseBasketReply(msg('da:whatsapp:basket:mini:2')),{kind:'basket',size:'mini',number:2,id:'da:whatsapp:basket:mini:2'});
assert.equal(parseBasketReply(msg('da:whatsapp:basket:mini:4')),null);
assert.equal(parseBasketReply(msg('da:whatsapp:size:unknown')),null);
assert.equal(parseBasketReply(msg('custom:untrusted')),null);
assert.equal(parseBasketReply({...msg('da:whatsapp:size:mini'),direction:'outbound'}),null);
assert.equal(parseBasketReply({...msg('da:whatsapp:size:mini'),message_type:'text'}),null);
assert.equal(parseBasketReply({...msg('da:whatsapp:size:mini'),metadata:{interactive:{type:'button_reply',button_reply:{id:'da:whatsapp:size:mini'}}}}),null);
assert.equal(parseBasketReply({message_type:'interactive',metadata:{interactive:{type:'list_reply',list_reply:{id:'da:whatsapp:size:mini'}}}}),null);
assert.equal(latestCanaryReply(wrap([msg('da:whatsapp:size:mini')])).size,'mini');
assert.equal(latestCanaryReply(wrap([msg('da:whatsapp:size:mini','2026-10-24T17:00:00Z'),msg('da:whatsapp:basket:media:3')])).number,3,'should choose latest reply');
assert.equal(latestCanaryReply(wrap([{direction:'inbound',message_type:'text',text_body:'ola'}])),null);
assert.equal(latestCanaryReply({...wrap([msg('da:whatsapp:size:mini')]),account:{phone_e164:'+5565984499999',id:'account-1018'}}),null);
assert.equal(latestCanaryReply({...wrap([msg('da:whatsapp:size:mini')]),conversation:{id:CANARY_CONVERSATION,phone_e164:'+5565999999999',whatsapp_account_id:'account-1018'}}),null);
assert.equal(latestCanaryReply({...wrap([msg('da:whatsapp:size:mini')]),conversation:{id:CANARY_CONVERSATION,phone_e164:'+5565999828360',whatsapp_account_id:'WRONG'}}),null);
assert.match(html,/id="readReplyBtn"/);
assert.match(html,/id="replyStatus"/);
assert.match(js,/attendanceJsonApi\('conversation',\{conversation_id:CANARY_CONVERSATION,limit:35\}\)/);
assert.match(js,/latestCanaryReply\(data\)/);
assert.match(js,/\$\('metaPayloadKind'\)\.value='combinations'/);
assert.match(js,/choiceKey\(model,reply\.number\)/);
assert.match(js,/renderMeta\(\);refreshCanaryControls\(\)/);
assert.match(js,/confirm\('Confirmar envio REAL pela Meta/,'Sending remains explicit after reading');
assert.match(js,/const LIVE_TEST_ENABLED=false/,'0975 route must remain off');
console.log('PASS Meta list reply parsing + verified internal canary conversation + guided continuation without changing live webhook');
