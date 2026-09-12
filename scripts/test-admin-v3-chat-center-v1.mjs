import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('admin-v3/atendimento.html','utf8');
const center=readFileSync('admin-v3/service-chat-center.js','utf8');
const edge=readFileSync('supabase/functions/admin-service-intelligence-simple-v1/index.ts','utf8');

for(const tab of ['rules','chat','intelligence','history','evolution']){
  assert.match(html,new RegExp(`data-strategy-tab=["']${tab}["']`),`aba ${tab} deve existir`);
}
assert.match(html,/id=["']tabChat["']/,'painel Chat deve existir');
assert.match(html,/id=["']tabIntelligence["']/,'painel Inteligência deve existir');
assert.match(html,/service-chat-center\.js/,'módulo da central do chat deve ser carregado');

assert.match(center,/\['rules','chat','intelligence','history','evolution'\]/,'navegação central deve reconhecer as cinco abas');
assert.match(center,/admin-chat-menu-v1/,'aba Chat deve reutilizar o backend do Menu do Chat');
assert.match(center,/runtime_save/,'aba Inteligência deve salvar o runtime simples');
assert.match(center,/strict_mode/,'modo restrito deve ser configurável');
assert.match(center,/humanize_all_replies/,'humanização deve ser configurável');
assert.match(center,/similarity_threshold/,'sensibilidade deve ser configurável');
assert.match(center,/max_history_messages/,'histórico máximo deve ser configurável');
assert.match(center,/max_candidate_rules/,'regras candidatas devem ser configuráveis');
assert.match(center,/fallback_mode/,'fallback deve ser configurável');
assert.match(center,/Confirmação pelo WhatsApp/,'proteção de identificação web deve aparecer na aba Chat');
assert.match(center,/Confirmação do endereço/,'confirmação de endereço deve aparecer na aba Chat');
assert.match(center,/Retorno ao WhatsApp/,'retorno ao WhatsApp deve aparecer na aba Chat');

assert.match(edge,/action===["']runtime_save["']/,'backend deve aceitar runtime_save');
assert.match(edge,/similarity_threshold/,'backend deve validar sensibilidade');
assert.match(edge,/max_history_messages/,'backend deve validar histórico');
assert.match(edge,/fallback_mode/,'backend deve validar fallback');

console.log('admin_v3_chat_center_v1_ok');
