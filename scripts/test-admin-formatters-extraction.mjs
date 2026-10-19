import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const moduleSource=fs.readFileSync('vitrine/admin/core/formatters.js','utf8');
const runtime=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const moduleTag='<script src="/vitrine/admin/core/formatters.js?v=refactor-20261018"></script>';
const mainTag='<script src="/vitrine/admin/admin-runtime.js?v=runtime-extraction-20261018"></script>';
assert.ok(html.includes(moduleTag),'formatter module must be loaded');
assert.ok(html.indexOf(moduleTag)<html.indexOf(mainTag),'formatter module must load before main IIFE');
assert.ok(runtime.includes('const {esc,money,cents,fmtQty,dateTime,dateOnly,normalize}=window.DonaAntoniaAdminFormatters;'));
for(const name of ['esc','money','cents','fmtQty','dateTime','dateOnly','normalize']){
  assert.equal(new RegExp('^  const '+name+'=', 'm').test(runtime),false,name+' must not remain as an original top-level declaration');
}
const context={window:{},Number,Date,String,Object};
vm.runInNewContext(moduleSource,context);
const f=context.window.DonaAntoniaAdminFormatters;
assert.ok(Object.isFrozen(f));
assert.equal(f.esc('<b class="x">&'), '&lt;b class=&quot;x&quot;&gt;&amp;');
assert.equal(f.cents(12.345),1235);
assert.equal(f.fmtQty(2),'2');
assert.equal(f.fmtQty(1.25),'1.25');
assert.equal(f.dateOnly('2026-10-18'),'18/10/2026');
assert.equal(f.dateOnly(''),'—');
assert.equal(f.normalize('  AÇÃO  '),'acao');
assert.equal(f.money(12345),new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(123.45));
console.log('Admin formatter extraction: PASS');
