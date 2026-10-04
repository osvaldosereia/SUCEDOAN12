import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../vitrine/admin/index.html', import.meta.url),'utf8');
const edge=readFileSync(new URL('../supabase/functions/admin-products-live-v1/index.ts', import.meta.url),'utf8');

const requiredEditorFields=[
  'name="cost"','name="brand"','name="supplier"','name="unit"','name="min_stock"',
  'name="subsubcategory"','name="gondola"','name="shelf"','name="tags"',
  'name="customer_category"','name="customer_subcategory"','name="customer_subsubcategory"',
  'name="storefront_featured"','name="is_upsell"','name="is_whatsapp_active"','name="whatsapp_category"',
  'name="additional_gtins"','name="fiscal_ncm"','name="fiscal_cest"','name="fiscal_origin_code"',
  'name="fiscal_commercial_gtin"','name="fiscal_tax_gtin"','name="fiscal_commercial_unit"','name="fiscal_tax_unit"',
  'name="fiscal_description"'
];

assert.match(html,/PRODUCT_EDITOR_COMPLETE_V1/,'editor precisa declarar o contrato completo v1');
assert.match(html,/api\('product_detail',\{id:/,'Editar completo deve carregar detalhe somente ao abrir o modal');
assert.match(html,/data-product-editor-section/,'editor deve organizar dados em blocos recolhíveis');
for(const field of requiredEditorFields) assert.ok(html.includes(field),`campo ausente no editor completo: ${field}`);
assert.match(html,/form\.get\('cost'\)/,'salvamento precisa enviar custo');
assert.match(html,/additional_gtins:/,'salvamento precisa enviar EANs adicionais');
assert.match(html,/fiscalDraft/,'editor deve montar rascunho fiscal separado');
assert.match(html,/fiscalChanged/,'editor só deve enviar bloco fiscal quando houver alteração');
assert.match(html,/fiscalOriginal/,'editor deve guardar a referência fiscal originalmente carregada');
assert.match(html,/api\('product_stock_set'/,'estoque deve continuar pelo fluxo oficial do Bling');
assert.match(html,/const limit=5;/,'listagem deve continuar leve, 5 produtos por vez');

assert.match(edge,/"product_detail"/,'backend precisa expor product_detail');
assert.match(edge,/async function productDetail\(/,'backend precisa carregar detalhe completo sob demanda');
assert.match(edge,/product_identifiers/,'detalhe/salvamento precisa tratar identificadores adicionais');
assert.match(edge,/product_fiscal_profiles/,'detalhe/salvamento precisa tratar perfil fiscal');
for(const key of ['brand','supplier','unit','min_stock','subsubcategory','gondola','shelf','storefront_featured','is_upsell','is_whatsapp_active','whatsapp_category','customer_category','customer_subcategory','customer_subsubcategory']){
  assert.ok(edge.includes(key),`backend sem suporte ao campo ${key}`);
}
assert.match(edge,/identifier_already_linked/,'EAN adicional conflitante deve falhar de forma explícita');
assert.match(edge,/\.in\("identifier_kind",\["base_gtin","package_gtin"\]\)/,'pré-validação deve considerar EAN base e EAN de embalagem confirmados');
assert.match(edge,/fiscalChanged/,'backend deve comparar o fiscal atual antes de marcar revisão humana');
assert.match(edge,/if\(!fiscalChanged\)return \{ok:true,changed:false\}/,'salvar outro campo não pode alterar auditoria fiscal');
assert.match(edge,/human_validated/,'edição fiscal realmente alterada deve registrar revisão humana');
assert.match(edge,/authority==="bling"&&pid/,'product_save não pode voltar a sobrescrever products.stock sob autoridade Bling');

console.log('OK product editor complete contract');
