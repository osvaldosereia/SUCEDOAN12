import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync(new URL('../admin/admin-r13-marketing-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../admin/admin-r13-marketing-v2.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../admin/marketing.html',import.meta.url),'utf8');

test('R13 marketing layer is wired and UI-only',()=>{
  assert.match(html,/admin-r13-marketing-v2\.css/);
  assert.match(html,/admin-r13-marketing-v2\.js/);
  assert.doesNotMatch(js,/\bfetch\s*\(/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB/);
});

test('R13 preserves visible fail-closed language and safe interaction contract',()=>{
  assert.match(html,/FAIL-CLOSED/);
  assert.match(html,/Publicação externa continua desligada/);
  assert.match(js,/Publicação externa, outbound e canary continuam dependentes dos gates reais/);
  assert.match(js,/aria-busy/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/safe-area-inset-bottom/);
});
