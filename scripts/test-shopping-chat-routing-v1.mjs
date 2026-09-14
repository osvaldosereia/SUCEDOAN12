import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/shopping-chat-v1/index.ts','utf8');
const adminAi=fs.readFileSync('supabase/functions/admin-service-intelligence-simple-v1/index.ts','utf8');
const products=fs.readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');
const menu=fs.readFileSync('supabase/functions/shopping-chat-menu-v1/index.ts','utf8');
const client=fs.readFileSync('comprar/chat-light-v2.js','utf8');
const adminController=fs.readFileSync('admin-v3/service-strategy.js','utf8');

for(const forbidden of ['automation_config','queue_ai_job_for_message','whatsapp_sales_state','queue_human_handoff_v1','queue_whatsapp_sales_reply_v1','queue_whatsapp_simple_rich_interactive_v1']){
  assert.ok(!edge.includes(forbidden),`Chat Comprar não deve depender de ${forbidden}`);
}
assert.match(edge,/service_simple_runtime_config/,'Chat Comprar deve usar configuração própria de regras');
assert.match(edge,/service_simple_rules/,'Chat Comprar deve consultar regras publicadas diretamente');
assert.match(edge,/OPENAI_API_KEY/,'IA opcional deve ficar somente no backend');
assert.match(edge,/get_conversation_worker_provider_secret_v1/,'Chat Comprar deve buscar a chave segura no cofre do Supabase quando a variável de ambiente não existir');
assert.match(adminAi,/get_conversation_worker_provider_secret_v1/,'simulador do Admin deve usar o mesmo fallback seguro de chave da produção');
assert.match(edge,/routeChatMessage/,'deve existir um roteador próprio do Chat Comprar');
assert.match(edge,/source:'shopping_room'/,'mensagens devem permanecer identificadas como shopping_room');
assert.match(edge,/direction:'outbound'/,'resposta direta deve ser persistida sem transporte WhatsApp');

for(const [label,pattern] of [
  ['pagamento',/Você pode pagar na entrega por PIX/],
  ['entrega',/Entregamos em Cuiabá e Várzea Grande/]
]){
  assert.match(edge,pattern,`produção deve responder ${label} sem IA`);
  assert.match(adminAi,pattern,`simulador do Admin deve reproduzir ${label} igual à produção`);
}

assert.ok(!edge.includes(".eq('is_whatsapp_active',true)"),'shopping-chat-v1 não deve filtrar catálogo por flag do WhatsApp');
assert.ok(!products.includes(".eq('is_whatsapp_active',true)"),'shopping-chat-products-v1 não deve filtrar catálogo por flag do WhatsApp');
assert.ok(!menu.includes('is_whatsapp_active'),'shopping-chat-menu-v1 não deve filtrar cesta por flag do WhatsApp');

// A categoria oficial é products.category, preservada da importação original.
// Chat Comprar não pode manter uma taxonomia comercial paralela.
assert.doesNotMatch(products,/sales_category/,'feed do Chat Comprar não deve depender de sales_category');
assert.doesNotMatch(products,/physically_verified/,'todo produto ativo deve poder aparecer no Chat Comprar, mesmo sem conferência física');
assert.doesNotMatch(products,/\.gt\('stock',0\)/,'produto ativo sem estoque deve continuar visível no Chat Comprar');
assert.match(products,/body\?\.categories/,'feed deve aceitar apenas categorias oficiais selecionadas');
assert.match(products,/\.in\('category',categories\)/,'filtro deve usar products.category');
assert.doesNotMatch(edge,/\.eq\('sales_category'/,'roteador principal não deve filtrar produtos por sales_category');
assert.doesNotMatch(client,/sales_categories/,'frontend não deve enviar categorias comerciais paralelas');
assert.doesNotMatch(client,/limpeza_lavanderia|higiene_beleza|casa_pet/,'frontend não deve inventar agrupamentos de categoria');
assert.match(client,/\['Cestas','Ofertas','Produtos'\]/,'entrada do chat deve abrir Produtos e deixar as categorias reais virem do catálogo');
assert.match(adminController,/productCategories/,'editor de regras deve receber as categorias oficiais do catálogo');
assert.doesNotMatch(adminController,/limpeza_lavanderia|higiene_beleza|casa_pet/,'editor não deve oferecer categorias artificiais');

for(const ui of ["ui.type==='chips'","ui.type==='link'","ui.type==='product_lookup'"]){
  assert.ok(client.includes(ui),`frontend deve renderizar ${ui}`);
}
assert.doesNotMatch(client,/startPolling\(\)/,'resposta de texto não deve depender de polling de worker');

console.log('shopping_chat_routing_v1_contract_ok');