import fs from 'node:fs';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');

const checks=[
  ['carrega 5 produtos por vez',html.includes('const limit=5;')],
  ['botao explicito ver mais 5',html.includes('Ver mais 5')],
  ['edicao rapida preco venda',html.includes('data-mobile-product-field="price"')],
  ['edicao rapida preco custo',html.includes('data-mobile-product-field="cost"')],
  ['edicao rapida estoque',html.includes('data-mobile-product-field="stock"')],
  ['validade operacional na linha',html.includes('Próxima validade')&&html.includes('data-mobile-product-field="expiration"')],
  ['atalho kits na linha',html.includes('data-open-product-kit')&&html.includes('product-kit-menu')],
  ['acoes visuais compactas',html.includes('product-action-btn')&&html.includes('product-operational-row')],
  ['backend retorna custo',edge.includes('cost_cents:Math.round(Number(p.cost||0)*100)')],
  ['backend aceita custo rapido',edge.includes('cost_cents')&&edge.includes('patch.cost=Math.round(cents)/100')],
  ['backend enriquece lotes e kits',edge.includes('async function productOperationalMetaMap')&&edge.includes('linked_kits')&&edge.includes('next_expiration_date')],
  ['backend enriquece somente pagina atual',edge.includes('productOperationalMetaMap(rows.map((x:any)=>x.id))')]
];

let fail=0;
for(const [name,ok] of checks){
  if(ok) console.log('OK',name);
  else { console.error('FAIL',name); fail++; }
}
if(fail) process.exit(1);
