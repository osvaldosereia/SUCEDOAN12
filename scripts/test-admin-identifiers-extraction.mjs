import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const source=fs.readFileSync('vitrine/admin/core/identifiers.js','utf8');
const runtime=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const tag='<script src="/vitrine/admin/core/identifiers.js?v=refactor-20261018"></script>';
assert.ok(html.includes(tag));
assert.ok(html.indexOf(tag)<html.indexOf('<script src="/vitrine/admin/admin-runtime.js?'));
assert.ok(runtime.includes('const {orderDisplayCode,phoneDigits,formatPhone,formatCpf}=window.DonaAntoniaAdminIdentifiers;'));
for(const name of ['orderDisplayCode','phoneDigits','formatPhone','formatCpf']){
  assert.equal(new RegExp('^  function '+name+'\\(', 'm').test(runtime),false);
}
const context={window:{},String,Object};
vm.runInNewContext(source,context);
const f=context.window.DonaAntoniaAdminIdentifiers;
assert.ok(Object.isFrozen(f));
assert.equal(f.orderDisplayCode({public_code:'ab123'}),'AB123');
assert.equal(f.orderDisplayCode({public_code:'invalid'}),'—');
assert.equal(f.phoneDigits('(65) 99999-1234'),'5565999991234');
assert.equal(f.phoneDigits('5565999991234'),'5565999991234');
assert.equal(f.formatPhone('5565999991234'),'(65) 99999-1234');
assert.equal(f.formatPhone('6533331234'),'(65) 3333-1234');
assert.equal(f.formatCpf('12345678901'),'123.456.789-01');
assert.equal(f.formatCpf('invalid'),'invalid');
console.log('Admin identifiers extraction: PASS');
