import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=read('admin/products-inline-controls-v4.js');
const backend=read('supabase/functions/admin-simple-v2/index.ts');
const comprar=read('supabase/functions/shopping-chat-products-v1/index.ts');

// A lista oficial precisa separar status comercial de conferência física.
assert.match(ui,/state=\{[^}]*verification:''[^}]*expiry:''[^}]*sort:/s);
assert.match(ui,/name="verification"/);
assert.match(ui,/>Verificados</);
assert.match(ui,/>Não verificados</);
assert.match(ui,/name="expiry"/);
assert.match(ui,/>Vencidos</);
assert.match(ui,/>Até 30 dias</);
assert.match(ui,/>31–60 dias</);
assert.match(ui,/>Sem validade</);
assert.match(ui,/name="sort"/);
assert.match(ui,/>Validade mais próxima</);

// Cada linha precisa mostrar/trocar verificação e expor validade/última contagem.
assert.match(ui,/data-inline-verified/);
assert.match(ui,/physically_verified:control\.checked/);
assert.match(ui,/validity_date/);
assert.match(ui,/last_counted_at/);
assert.match(ui,/Validade/);
assert.match(ui,/Verificado/);
assert.match(ui,/Data suspeita/);

// O editor individual também preserva a separação Ativo x Verificado.
assert.match(ui,/name="physically_verified"/);
assert.match(ui,/is_active:form\.elements\.is_active\.checked/);
assert.match(ui,/physically_verified:form\.elements\.physically_verified\.checked/);

// Filtros precisam chegar ao backend oficial usado pela lista.
assert.match(ui,/verification:state\.verification/);
assert.match(ui,/expiry:state\.expiry/);
assert.match(ui,/sort:state\.sort/);
assert.match(backend,/last_counted_at/);
assert.match(backend,/physically_verified_at/);
assert.match(backend,/verification=clean\(body\?\.verification/);
assert.match(backend,/expiry=clean\(body\?\.expiry/);
assert.match(backend,/verification==="verified"/);
assert.match(backend,/verification==="unverified"/);
assert.match(backend,/expiry==="expired"/);
assert.match(backend,/expiry==="30"/);
assert.match(backend,/expiry==="60"/);
assert.match(backend,/expiry==="missing"/);
assert.match(backend,/sort==="expiry"/);
assert.match(backend,/order\("validity_date",\{ascending:true,nullsFirst:false\}\)/);

// Verificação manual deve ser auditável sem fundir o conceito de ativo.
assert.match(backend,/typeof src\.physically_verified==="boolean"/);
assert.match(backend,/patch\.physically_verified=src\.physically_verified/);
assert.match(backend,/admin_manual_verified_at/);
assert.match(backend,/admin_manual_unverified_at/);
assert.match(backend,/verification_source/);
assert.match(backend,/last_counted_at/);
assert.match(backend,/if\(typeof src\.is_active==="boolean"\)patch\.is_active=src\.is_active/);

// O critério do Comprar não pode ser relaxado por esta mudança administrativa.
assert.match(comprar,/\.eq\('physically_verified',true\)/);
assert.match(comprar,/\.eq\('is_active',true\)/);
assert.match(comprar,/\.gt\('stock',0\)/);

console.log('admin product verification + expiry contract ok');
