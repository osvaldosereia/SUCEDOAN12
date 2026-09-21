import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const js=read('admin/admin-r11-operations-v2.js'),css=read('admin/admin-r11-operations-v2.css');
test('R11 layer covers all four operational surfaces',()=>{for(const page of ['relacionamento.html','atendimento.html','inteligencia.html','aprendizados.html'])assert.match(js,new RegExp(page.replace('.','\\.')))});
test('R11 layer stays UI-only and guards human review',()=>{assert.doesNotMatch(js,/\bfetch\s*\(/);assert.doesNotMatch(js,/localStorage|sessionStorage/);assert.match(js,/alApprove/);assert.match(js,/alReject/);assert.match(js,/aria-busy/)});
test('R11 preserves mobile first-class ergonomics',()=>{assert.match(css,/min-height:44px/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/@media\(max-width:820px\)/)});
test('R11 is wired into all four surfaces',()=>{assert.match(read('admin/relationship-homologation-hardening.js'),/admin-r11-operations-v2\.js/);for(const p of ['admin/atendimento.html','admin/inteligencia.html','admin/aprendizados.html'])assert.match(read(p),/admin-r11-operations-v2\.js/)})