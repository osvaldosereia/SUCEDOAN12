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

// A estratégia continua disponível como motor interno, mas não deve ocupar
// uma aba no fluxo operacional simplificado do Marketing.
assert.doesNotMatch(polish,/strategy:'Estratégia'/,'Estratégia não deve aparecer na navegação principal');
assert.doesNotMatch(polish,/data-marketing-view=["']strategy["']/,'shell não deve expor botão Estratégia');
assert.doesNotMatch(polish,/strategy-center\.js/,'shell operacional não deve carregar a tela Estratégia');

assert.ok(source.includes('admin-marketing-strategy-v1'),'UI preservada deve usar API Admin canônica de estratégia');
assert.match(source,/attendanceAuthorizedFetch/,'UI preservada deve usar autenticação do Admin');
assert.match(source,/attendanceJsonApi\(["']accounts["']/,'UI preservada deve reutilizar contas autorizadas existentes');
for(const action of ['overview','opportunities','calendar','learnings','settings','generate','regenerate','request_internal_approval','approve_internal','discard','save_weights','save_seasonality']){
  assert.ok(source.includes(`'${action}'`)||source.includes(`"${action}"`),`UI preservada deve suportar action ${action}`);
}

for(const text of ['Estratégia de Marketing','Gerar estratégia agora','Calendário','Configurações','Recomendação da semana','Por que esta estratégia?','Oportunidades detectadas','Aprendizados','Aprovar estratégia','Gerar alternativa']){
  assert.ok(source.includes(text),`texto obrigatório ausente no módulo preservado: ${text}`);
}
for(const status of ['Aguardando sua aprovação','Em análise na Meta','Aprovado pela Meta','Pronta para envio','Bloqueada','Concluída']){
  assert.ok(source.includes(status),`estado amigável ausente: ${status}`);
}
assert.ok(source.includes('Sinal inicial')&&source.includes('Tendência'),'aprendizados sem evidência forte devem usar linguagem cautelosa');
assert.doesNotMatch(source,/graph\.facebook\.com|service_role|SUPABASE_SERVICE_ROLE_KEY/i,'browser não pode carregar segredo ou Graph');
assert.match(css,/@media\s*\(max-width:\s*760px\)/,'UI preservada deve ter breakpoint mobile');
assert.match(css,/min-height:\s*44px/,'CTAs mobile devem ter alvo mínimo de 44px');

const workflow=fs.readFileSync('.github/workflows/marketing-professional-ui-ci.yml','utf8');
assert.ok(workflow.includes('scripts/test-whatsapp-marketing-strategy-ui-v1.mjs'),'CI deve continuar protegendo o módulo preservado');
assert.ok(workflow.includes('vitrine/admin/marketing/strategy-center.js'),'CI deve observar módulo de Estratégia preservado');

console.log('marketing strategy preserved/off-primary-nav contract: ok');
