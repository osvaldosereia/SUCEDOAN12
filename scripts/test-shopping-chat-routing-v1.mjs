import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/shopping-chat-v1/index.ts','utf8');
const adminAi=fs.readFileSync('supabase/functions/admin-service-intelligence-simple-v1/index.ts','utf8');
const products=fs.readFileSync('supabase/functions/shopping-chat-products-v1/index.ts','utf8');
const menu=fs.readFileSync('supabase/functions/shopping-chat-menu-v1/index.ts','utf8');
const help=fs.readFileSync('comprar/help.js','utf8');
const productUi=fs.readFileSync('comprar/products.js','utf8');

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

// O composer recebe {reply, ui} do backend. A resposta textual deve aparecer e a ação deve ser entregue ao módulo visual correspondente.
assert.match(help,/app\.api\('send_text'/,'Ajuda deve enviar texto diretamente ao chat');
assert.match(help,/function applyReply\(data\)/,'Ajuda deve ter um único caminho para aplicar resposta');
assert.match(help,/data\?\.reply\|\|data\?\.message/,'Ajuda deve renderizar a resposta textual do backend');
assert.match(help,/data\?\.ui/,'Ajuda deve consumir a ação visual devolvida pelo backend');
assert.match(help,/product_lookup/,'Ajuda deve reconhecer consulta de produto');
assert.match(help,/openLookup/,'Consulta de produto deve abrir os resultados visuais');
assert.match(productUi,/function openLookup\(/,'Módulo de produtos deve oferecer abertura direta por consulta');
assert.match(productUi,/customerCategory:''/,'Consulta direta deve pesquisar em Para Você e Para Casa, sem prender a busca a uma seção');
assert.doesNotMatch(help,/startPolling|MutationObserver|window\.fetch\s*=/,'Ajuda não deve depender de polling ou interceptadores globais');
assert.doesNotMatch(help,/start_basket|set_quantity|productsApi/,'Ajuda não deve alterar carrinho diretamente; deve delegar aos módulos oficiais');

console.log('shopping_chat_routing_v1_contract_ok');
