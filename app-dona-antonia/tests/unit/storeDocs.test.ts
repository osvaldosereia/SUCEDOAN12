import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../..');

function read(path:string):string {
  return readFileSync(resolve(ROOT,path),'utf8');
}

test('store checklists are explicitly draft and prohibit publication', () => {
  for (const path of [
    'docs/store/APP-STORE-CHECKLIST.md',
    'docs/store/PLAY-STORE-CHECKLIST.md',
  ]) {
    const doc=read(path);
    assert.match(doc,/DRAFT/);
    assert.match(doc,/NÃO PUBLICAR/);
    assert.match(doc,/Produção:\*\* OFF/);
  }
});

test('review profile is synthetic and contains no real-contact fields', () => {
  const doc=read('docs/store/REVIEW-PROFILE.md');
  assert.match(doc,/TEST-REVIEWER-001/);
  assert.match(doc,/TEST-CUSTOMER-REVIEWER-001/);
  assert.match(doc,/TEST-SESSION-/);
  assert.match(doc,/Dados reais:\*\* PROIBIDOS/);
  assert.doesNotMatch(doc,/\b\d{11}\b/);
  assert.doesNotMatch(doc,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
});

test('store docs preserve real-effect safety gates', () => {
  const docs=[
    read('docs/store/APP-STORE-CHECKLIST.md'),
    read('docs/store/PLAY-STORE-CHECKLIST.md'),
    read('docs/store/REVIEW-PROFILE.md'),
  ].join('\n');

  assert.match(docs,/pedidos reais OFF/i);
  assert.match(docs,/marketing push OFF/i);
  assert.match(docs,/nenhum.*produção/i);
});
