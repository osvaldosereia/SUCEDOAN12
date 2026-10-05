import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const guidedApi=fs.readFileSync('supabase/functions/admin-basket-guided-v1/index.ts','utf8');
const guided=fs.readFileSync('vitrine/admin/basket-guided-builder.js','utf8');
const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');

// Família configurada é uma propriedade da posição e alimenta o catálogo protegido.
assert.ok(guided.includes('family_key'),'editor guiado deve preservar família configurada');
assert.ok(guided.includes("call('position_products'"),'editor guiado deve buscar sugestões pela API protegida');
assert.ok(guided.includes('IntersectionObserver')||guided.includes('Carregar produtos'),'carrosséis devem carregar sob demanda');
for(const label of ['Total','Reservado','Avulso'])assert.ok(guided.includes(label),`card do carrossel deve mostrar ${label}`);
for(const field of ['packaging','cost_price','sale_price','loose_stock'])assert.ok(guided.includes(field),`carrossel deve consumir ${field}`);
assert.match(guidedApi,/basket_lot_substitution_products/i,'catálogo guiado deve reutilizar membros explícitos da família');
assert.match(guidedApi,/ops2_loose_sellable_stock_v1/i,'catálogo guiado deve usar estoque avulso canônico');
assert.doesNotMatch(guidedApi,/slice\(0,7\)/,'família não pode ser truncada arbitrariamente');

// Não existem dois pickers/editores concorrentes no runtime do Admin.
assert.doesNotMatch(admin,/id="basketProductSuggestions"|Sugestões configuradas|data-basket-auto-family-pick/,'picker legado não deve coexistir com editor guiado');
assert.doesNotMatch(admin,/function\s+(?:paintBasketKitLotComposer|startBasketKitLotDraft|openBasketKitAdmin|paintBasketSubstitutionFamilyEditor)\s*\(/,'funções do compositor/picker legado não devem coexistir no runtime');
assert.doesNotMatch(admin,/Sugestões automáticas de lotes|Gerar sugestões agora|Automação segura/,'automação antiga de sugestões deve permanecer fora do Admin');
assert.doesNotMatch(section,/basket_lot_suggestion_generate_now_v1|basket_lot_suggestions_admin_v1/,'seção canônica não deve chamar geradores antigos');

console.log('BASKET_FAMILY_PICKER_UX_V1_OK');
