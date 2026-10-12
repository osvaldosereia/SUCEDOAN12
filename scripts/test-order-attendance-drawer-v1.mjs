import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin=file('vitrine/admin/index.html');
const attendance=file('vitrine/admin/atendimento/attendance-app.js');
const page=file('vitrine/admin/atendimento/index.html');
const css=file('vitrine/admin/atendimento/attendance.css');

for(const [index,block] of [...admin.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].entries()){
  if(block[1].trim())new Script(block[1],{filename:'admin-inline-'+index+'.js'});
}
new Script(attendance.replace(/^import[^\n]*\n/gm,''),{filename:'attendance-app.js'});

assert.match(admin,/data-order-chat=/,'every order card must offer chat entry point');
assert.match(admin,/querySelectorAll\('\[data-order-chat\]'\)/,'order chat buttons must be wired after rendering');
assert.match(admin,/class="order-chat-sheet"[^>]*role="dialog"[^>]*aria-modal="true"/,'drawer must be accessible');
assert.match(admin,/\.order-chat-sheet\[hidden\]/,'closed drawer must be absent from layout');
assert.match(admin,/iframe id="orderChatFrame"/,'drawer reuses existing Attendance app');
assert.match(admin,/embedded:'order'/,'drawer must request order-specific view');
assert.match(admin,/sheet\.hidden=true/,'drawer must clean up after closing');
assert.match(page,/attendance-app\.js\?v=order-drawer-v1/,'chat app must have updated cache key');
assert.match(page,/attendance\.css\?v=order-drawer-v1/,'chat CSS must have updated cache key');
assert.match(css,/body\.order-embedded \.conversation-pane/,'embedded chat must be visible');
assert.match(css,/body\.order-embedded \.mobile-chat-back/,'mobile back button must not hide the embedded chat');

const functionText=attendance.match(/function canonicalOrderPhone\(value\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(functionText,'phone normalization helper must exist');
const normalize=runInNewContext('('+functionText+')',{});
for(const [input,expected] of [
  ['(65) 99317-9002','5565993179002'],
  ['+55 (65) 99317-9002','5565993179002'],
  ['65993179002','5565993179002'],
  ['65 3311-2233','556533112233'],
  ['',''],['123','']
])assert.equal(normalize(input),expected,'phone should normalize safely: '+input);

assert.match(attendance,/canonicalOrderPhone\(item\.phone_e164\)===phone/,
  'do not open chats on partial phone matches');
assert.match(attendance,/matches\.length>1/,'several channels require explicit selection');
assert.match(attendance,/String\(item\.customer_id\|\|'\'\)===customerId/,
  'prefer conversations linked to the order customer');
assert.match(attendance,/if\(EMBEDDED_ORDER\)await openEmbeddedOrderConversation\(\)/,
  'automatic conversation selection must happen on boot');
assert.match(attendance,/Atendimento indisponível/,'errors must be visible in the drawer');
console.log('OK: order cards + WhatsApp conversation bottom sheet');
