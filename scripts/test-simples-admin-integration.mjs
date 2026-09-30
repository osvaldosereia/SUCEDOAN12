import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page=readFileSync(new URL('../vitrine/admin/simples.html', import.meta.url),'utf8');
const inline=page.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';

assert.ok(inline,'script da tela Simples Nacional não encontrado');
assert.doesNotThrow(()=>new Function(inline),'JavaScript da tela Simples Nacional deve compilar');
assert.match(page,/<title>[^<]*Simples Nacional/i,'título Simples Nacional ausente');
assert.match(page,/admin-service-intelligence-simple-v1/,'endpoint fiscal autenticado ausente');
assert.match(page,/admin-pin-auth-v1/,'autenticação por PIN administrativo ausente');
assert.match(page,/\/auth\/v1\/verify/,'troca do token_hash por sessão Supabase ausente');
assert.match(page,/id="competence"[^>]*type="month"|type="month"[^>]*id="competence"/,'seletor de competência ausente');
for(const id of ['statusBanner','cardRevenue','cardNfe','cardSt','cardMono','cardDas','cardBlockers','issuesList','memoryPanel','exportCsv','exportHtml','accountantDas','homologationSave','lockPeriod']){
  assert.match(page,new RegExp(`id=["']${id}["']`),`controle ${id} ausente`);
}
for(const action of ['simples_summary','simples_recalculate','simples_issues','simples_resolve_issue','simples_lock','simples_homologation_save','simples_export']){
  assert.ok(page.includes(action),`ação ${action} ausente`);
}
assert.doesNotMatch(page,/action\s*[:=]\s*["'](?:pgdas|transmit|transmitir|pay|pagar|das_payment)/i,'V1 não pode conter ação de transmissão/pagamento');
assert.doesNotMatch(page,/id=["'][^"']*(?:transmit|pagar|payment)[^"']*["']/i,'V1 não pode expor controle de transmissão/pagamento');
assert.match(page,/não transmite o PGDAS-D/i,'aviso explícito de homologação ausente');
assert.match(page,/não paga o DAS/i,'aviso explícito de não pagamento ausente');
assert.match(page,/href="\/vitrine\/admin\/"/,'atalho de volta ao Admin ausente');

console.log('PASS Simples Nacional admin integration contract');
