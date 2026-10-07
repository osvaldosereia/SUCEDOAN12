import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseKnowledgeKeywords,knowledgeCategories,knowledgeMatches,knowledgeSearchBlob} from '../vitrine/admin/ana/ana-knowledge.js';

assert.deepEqual(parseKnowledgeKeywords('PIX\npix\ncartão, entrega'),['PIX','pix','cartão','entrega']);
assert.equal(parseKnowledgeKeywords(Array.from({length:20},(_,i)=>`k${i}`).join('\n')).length,12,'keywords must remain bounded');

const items=[
  {title:'Catálogo',category:'Vendas',content:'Acesse o site oficial.',status:'published',keywords:['cesta básica']},
  {title:'Atendimento humano',category:'Atendimento',content:'Encaminhar quando necessário.',status:'draft',keywords:['pessoa']}
];
assert.deepEqual(knowledgeCategories(items),['Atendimento','Vendas']);
assert.match(knowledgeSearchBlob(items[0]),/catalogo/);
assert.equal(knowledgeMatches(items[0],{query:'CATÁLOGO',category:'all',status:'all'}),true);
assert.equal(knowledgeMatches(items[0],{query:'cesta basica',category:'Vendas',status:'published'}),true);
assert.equal(knowledgeMatches(items[0],{query:'cesta',category:'Atendimento',status:'all'}),false);
assert.equal(knowledgeMatches(items[1],{query:'',category:'all',status:'published'}),false);

const ui=fs.readFileSync('vitrine/admin/ana/ana-admin.js','utf8');
assert.match(ui,/anaKnowledgeSearch/);
assert.match(ui,/anaKnowledgeCategory/);
assert.match(ui,/anaKnowledgeStatus/);
assert.match(ui,/Palavras-chave \(uma por linha\)/);
assert.match(ui,/field==='keywords'\?parseKnowledgeKeywords/);
assert.match(ui,/applyKnowledgeFilters/);
assert.match(ui,/knowledgeMatches/);

console.log('PASS: ANA knowledge search, filters and keyword editing contracts');
