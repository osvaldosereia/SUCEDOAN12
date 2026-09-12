import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const edge=new URL('../supabase/functions/admin-chat-deterministic-v1/index.ts',import.meta.url);
const html=new URL('../admin-v3/chat-deterministic.html',import.meta.url);
const js=new URL('../admin-v3/chat-deterministic.js',import.meta.url);

test('admin edge follows Admin V3 public-no-auth model with strict origin and deterministic config only',()=>{
  assert.equal(existsSync(edge),true);
  const s=readFileSync(edge,'utf8').toLowerCase();
  assert.match(s,/donaantonia\.com\.br/);
  assert.match(s,/origin_not_allowed/);
  assert.match(s,/shopping_chat_deterministic_config/);
  assert.match(s,/shopping_chat_trigger_events/);
  assert.doesNotMatch(s,/openai|queue_ai_job|bling|make_webhook/);
});

test('admin page exposes simple deterministic settings',()=>{
  assert.equal(existsSync(html),true);
  const h=readFileSync(html,'utf8');
  const j=readFileSync(js,'utf8');
  assert.match(h,/Atendimento sem IA/i);
  assert.match(h,/Mensagem inicial/i);
  assert.match(h,/Pagamento/i);
  assert.match(h,/Entrega/i);
  assert.match(h,/Atendente/i);
  assert.match(j,/admin-chat-deterministic-v1/);
  assert.doesNotMatch(j,/da_admin_v3_auth/);
});
