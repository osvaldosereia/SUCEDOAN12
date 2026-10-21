import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='vitrine/admin/marketing/template-carousel-editor.js';
const source=fs.readFileSync(path,'utf8');

for(const text of ['Salvar rascunho','Enviar para análise da Meta','Nada foi enviado à Meta']){
  assert.ok(source.includes(text),`editor deve deixar claro: ${text}`);
}

assert.match(source,/const CAROUSEL_DRAFT_KEY=/,'rascunho deve ter uma chave versionada');
assert.match(source,/function snapshotCarouselDraft\(/,'editor deve serializar os campos do rascunho');
assert.match(source,/function saveCarouselDraft\(/,'editor deve salvar sem submissao');
assert.match(source,/function restoreCarouselDraft\(/,'editor deve restaurar o rascunho ao reabrir');
assert.match(source,/localStorage\.setItem\(CAROUSEL_DRAFT_KEY/,'rascunho deve sobreviver ao fechamento do navegador');
assert.match(source,/localStorage\.getItem\(CAROUSEL_DRAFT_KEY/,'editor deve recuperar o rascunho salvo');
assert.match(source,/localStorage\.removeItem\(CAROUSEL_DRAFT_KEY/,'rascunho deve ser removido apenas depois da submissao confirmada');
assert.match(source,/try\{localStorage\.removeItem\(CAROUSEL_DRAFT_KEY\)\}catch\{\}/,'falha ao limpar armazenamento local nao pode transformar uma submissao Meta confirmada em falso erro');
assert.match(source,/data-carousel-save-draft/,'o botao de rascunho deve ter acao separada');

const saveStart=source.indexOf('function saveCarouselDraft(');
const saveEnd=source.indexOf('\nfunction ',saveStart+1);
assert.ok(saveStart>=0&&saveEnd>saveStart,'saveCarouselDraft deve ser uma funcao isolada');
const saveBlock=source.slice(saveStart,saveEnd);
assert.doesNotMatch(saveBlock,/apiJson|uploadCardMedia|uploadMarketingTemplateMedia|submitCarouselTemplate/,'salvar rascunho nunca pode chamar Meta nem subir midia');

assert.match(source,/if\(preset==='basket_categories'\)[\s\S]{0,500}restoreCarouselDraft/,'preset D+20 deve restaurar uma revisao local quando existir');
assert.match(source,/apiJson\('create'/,'somente a submissao explicita deve criar template na Meta');

console.log('marketing carousel draft safety contract: ok');
