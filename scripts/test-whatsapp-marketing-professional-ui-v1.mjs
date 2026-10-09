import fs from 'node:fs';
import assert from 'node:assert/strict';

const entry='vitrine/admin/marketing/campaign-entry.js';
const polishJs='vitrine/admin/marketing/marketing-polish.js';
const polishCss='vitrine/admin/marketing/marketing-polish.css';

assert.equal(fs.existsSync(polishJs),true,'marketing-polish.js deve existir');
assert.equal(fs.existsSync(polishCss),true,'marketing-polish.css deve existir');

const entrySource=fs.readFileSync(entry,'utf8');
const js=fs.readFileSync(polishJs,'utf8');
const css=fs.readFileSync(polishCss,'utf8');

assert.match(entrySource,/marketing-polish\.css/,'bootstrap deve carregar CSS compartilhado de Marketing');
assert.match(entrySource,/marketing-polish\.js/,'bootstrap deve carregar enhancer compartilhado de Marketing');

for(const text of ['Templates','Públicos','Campanhas','Consentimentos'])assert.ok(js.includes(text),`navegação deve manter ${text}`);
assert.ok(js.includes('Envios desativados'),'gate deve usar texto curto e operacional');
assert.ok(js.includes('Atualizar público'),'Públicos deve usar CTA curto');
assert.ok(js.includes('Mais filtros'),'Públicos deve recolher filtros avançados sob texto simples');
assert.ok(js.includes('Templates de mensagem'),'Templates deve usar título didático');
assert.ok(js.includes('Crie, edite e acompanhe seus modelos do WhatsApp'),'Templates deve explicar a finalidade sem jargão');
assert.ok(js.includes('Crie, revise e acompanhe campanhas do WhatsApp'),'Campanhas deve ter descrição operacional');
assert.ok(js.includes('Histórico de autorização para mensagens de marketing'),'Consentimentos deve ter descrição curta');
assert.ok(js.includes('Destino do botão'),'editor de campanhas deve substituir jargão Deep link');
assert.ok(js.includes('Enviar para revisão'),'editor deve usar ação clara');

// Regressão: o MutationObserver não pode disparar outro ciclo apenas para
// recolocar botões que já estão na ordem correta. Reordene somente se a
// subnavegação realmente estiver fora da ordem esperada.
assert.match(js,/const\s+navAlreadyOrdered\s*=/,'subnavegação deve detectar quando já está estável');
assert.match(js,/if\s*\(\s*!navAlreadyOrdered\s*\)/,'reordenação deve acontecer somente quando necessária');
assert.doesNotMatch(js,/if\(button\)nav\.insertBefore\(button,gate\|\|null\)/,'não pode haver insertBefore incondicional a cada MutationObserver');

for(const token of ['.marketing-pro-shell','.marketing-template-subnav','.marketing-audience-filters','.marketing-campaign-card','.marketing-pro-advanced','.marketing-pro-toolbar']){
  assert.ok(css.includes(token),`CSS profissional deve conter ${token}`);
}
assert.match(css,/box-shadow:/,'cartões devem ter profundidade visual sutil');
assert.match(css,/max-width:\s*1480px/,'Marketing deve usar largura profissional consistente');
assert.match(css,/@media\(max-width:760px\)/,'layout deve ter tratamento mobile');

console.log('marketing professional UI contract: ok');
