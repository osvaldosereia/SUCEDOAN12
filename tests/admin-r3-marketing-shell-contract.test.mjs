import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../admin/marketing.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../admin/marketing.js',import.meta.url),'utf8');

test('Marketing uses shared Shell V2 without dropping its functional layer',()=>{
  assert.match(html,/data-admin-module="marketing"/);
  assert.match(html,/id="adminShellNavigation"/);
  assert.match(html,/admin-design-system-v2\.css/);
  assert.match(html,/admin-subpage-shell-v2\.css/);
  assert.match(html,/admin-subpage-shell-v2\.js/);
  assert.match(html,/marketing\.css/);
  assert.match(html,/marketing\.js/);
});

test('Marketing safety language and local draft controls remain present',()=>{
  assert.match(html,/FAIL-CLOSED/);
  assert.match(html,/Submit Meta OFF/);
  assert.match(html,/Nenhum template é submetido à Meta/);
  assert.match(html,/createDeterministicDraft/);
  assert.doesNotMatch(html,/publishing_enabled\s*=\s*true/i);
  assert.doesNotMatch(js,/publishing_enabled\s*:\s*true/i);
});
