import assert from 'node:assert/strict';
import fs from 'node:fs';

const jsPath='vitrine/admin/marketing/strategy-center.js';
const cssPath='vitrine/admin/marketing/strategy-center.css';
const polishPath='vitrine/admin/marketing/marketing-polish.js';
assert.equal(fs.existsSync(jsPath),true,'strategy-center.js deve existir');
assert.equal(fs.existsSync(cssPath),true,'strategy-center.css deve existir');
const source=fs.readFileSync(jsPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const polish=fs.readFileSync(polishPath,'utf8');

assert.match(polish,/PRIMARY_MARKETING_VIEWS=\[[^\]]*'overview'[^\]]*'strategy'[^\]]*'templates'[^\]]*'campaigns'[^\]]*'audiences'/,'Estratégia deve ficar entre Visão geral e Templates');
assert.match(polish,/strategy:'Estratégia'/,'nav deve usar o rótulo Estratégia');
assert.match(polish,/view==='strategy'[\s\S]{0,500}strategy-center\.js/,'Estratégia deve carregar módulo lazy ao abrir a aba');
assert.doesNotMatch(polish,/import\s+[^;]*strategy-center\.js/,'strategy-center não deve ser import estático no shell');

assert.ok(source.includes('admin-marketing-strategy-v1'),'UI deve usar API Admin canônica de estratégia');
assert.match(source,/attendanceAuthorizedFetch/,'UI deve usar autenticação do Admin');
assert.match(source,/attendanceJsonApi\(["']accounts["']/,'UI deve reutilizar contas autorizadas existentes');
for(const action of ['overview','opportunities','calendar','learnings','settings','generate','regenerate','request_internal_approval','approve_internal','discard','save_weights','save_seasonality']){
  assert.ok(source.includes(`'${action}'`)||source.includes(`"${action}"`),`UI deve suportar action ${action}`);
}

for(const text of ['Estratégia de Marketing','Gerar estratégia agora','Calendário','Configurações','Recomendação da semana','Por que esta estratégia?','Oportunidades detectadas','Aprendizados','Aprovar estratégia','Gerar alternativa']){
  assert.ok(source.includes(text),`texto obrigatório ausente: ${text}`);
}
for(const status of ['Aguardando sua aprovação','Em análise na Meta','Aprovado pela Meta','Pronta para envio','Bloqueada','Concluída']){
  assert.ok(source.includes(status),`estado amigável ausente: ${status}`);
}
assert.ok(source.includes('Sinal inicial')&&source.includes('Tendência'),'aprendizados sem evidência forte devem usar linguagem cautelosa');
assert.doesNotMatch(source,/graph\.facebook\.com|service_role|SUPABASE_SERVICE_ROLE_KEY/i,'browser não pode carregar segredo ou Graph');
assert.match(css,/@media\s*\(max-width:\s*760px\)/,'UI deve ter breakpoint mobile');
assert.match(css,/min-height:\s*44px/,'CTAs mobile devem ter alvo mínimo de 44px');

const workflow=fs.readFileSync('.github/workflows/marketing-professional-ui-ci.yml','utf8');
assert.ok(workflow.includes('scripts/test-whatsapp-marketing-strategy-ui-v1.mjs'),'CI deve executar contrato da UI Estratégia');
assert.ok(workflow.includes('vitrine/admin/marketing/strategy-center.js'),'CI deve observar módulo de Estratégia');

console.log('marketing strategy UI contract: ok');
