import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const config=new URL('../comprar/config.js',import.meta.url);
const guard=new URL('../comprar/chat-deterministic-mode.js',import.meta.url);
const html=new URL('../comprar/index.html',import.meta.url);

test('frontend points to deterministic endpoint and correct WhatsApp',()=>{
  assert.equal(existsSync(config),true);
  const s=readFileSync(config,'utf8');
  assert.match(s,/shopping-chat-deterministic-v1/);
  assert.match(s,/5565984491018/);
  assert.doesNotMatch(s,/shopping-room-sales-v1/);
});

test('deterministic guard disables free composer/media and exposes human handoff',()=>{
  assert.equal(existsSync(guard),true);
  const s=readFileSync(guard,'utf8');
  assert.match(s,/composer/);
  assert.match(s,/human_handoff/);
  assert.match(s,/Atendente/);
  assert.doesNotMatch(s,/openai|queue_ai_job|ai_job/i);
});

test('page loads deterministic guard',()=>{
  assert.equal(existsSync(html),true);
  const s=readFileSync(html,'utf8');
  assert.match(s,/chat-deterministic-mode\.js/);
  assert.match(s,/chat-deterministic-mode\.css/);
});
