import fs from 'node:fs';
import assert from 'node:assert/strict';

const edgePath='supabase/functions/papo-external-agent-v1/index.ts';
assert.ok(fs.existsSync(edgePath),'Edge Function do agente externo PapoAI deve existir');
const edge=fs.readFileSync(edgePath,'utf8');

assert.match(edge,/conversation\.message/,'deve aceitar o evento conversation.message do PapoAI');
assert.match(edge,/contact\?\.phone_number|contact\.phone_number/,'deve identificar o contato pelo telefone enviado pelo PapoAI');
assert.match(edge,/messages/,'deve consumir o histórico enviado pelo PapoAI');
assert.match(edge,/lookup_customer_by_phone/,'identidade deve ser resolvida por telefone');
assert.match(edge,/room_start_for_conversation_v1/,'deve reutilizar a sessão oficial do Comprar');
assert.match(edge,/preferred_reply/,'modo texto\/áudio deve respeitar preferência do cliente');
assert.match(edge,/gpt-4o-mini-tts|ai_voice_profiles/,'áudio deve reutilizar o perfil de voz oficial');
assert.match(edge,/audio_url/,'contrato deve poder devolver URL de áudio quando aplicável');
assert.match(edge,/shopping_url/,'resposta deve carregar o link personalizado do Comprar');
assert.match(edge,/response/,'deve devolver resposta textual compatível para teste do PapoAI');
assert.match(edge,/x-papo-webhook-token/i,'endpoint deve aceitar autenticação por header');
assert.doesNotMatch(edge,/make\.com|hook\.eu1\.make/i,'nova integração não pode depender do Make');

const roadmap=fs.readFileSync('docs/PAPOAI-COMPRAR-EVOLUCAO-ROADMAP-20260917.md','utf8');
assert.match(roadmap,/agente externo/i,'roadmap deve registrar o agente externo PapoAI');
assert.match(roadmap,/Supabase/i,'roadmap deve manter Supabase como orquestrador');

console.log('PASS: PapoAI agente externo via Supabase V1');
