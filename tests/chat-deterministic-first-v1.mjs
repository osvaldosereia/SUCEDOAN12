import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatPath='supabase/functions/shopping-chat-v1/index.ts';
const migrationPath='supabase/migrations/20260914115000_chat_deterministic_first_v1.sql';
const edgeCasesPath='supabase/migrations/20260914154000_chat_launch_edge_cases_v1.sql';
const chat=fs.readFileSync(chatPath,'utf8');

assert.equal(fs.existsSync(migrationPath),true,'deve existir migration com regras comerciais e classificação de catálogo');
assert.equal(fs.existsSync(edgeCasesPath),true,'deve existir migration para casos reais encontrados no smoke de lançamento');
const migration=fs.readFileSync(migrationPath,'utf8');
const edgeCases=fs.readFileSync(edgeCasesPath,'utf8');

const routeStart=chat.indexOf('async function routeChatMessage');
assert.ok(routeStart>=0,'motor deve possuir routeChatMessage');
const route=chat.slice(routeStart,routeStart+4500);
const directPos=route.indexOf('directRule(message,rules)');
const detPos=route.indexOf('deterministic(message,flags)');
assert.ok(directPos>=0&&detPos>=0&&directPos<detPos,'regras específicas devem vencer atalhos genéricos');

assert.match(chat,/rankCandidateRules/,'IA deve receber candidatos ranqueados pela mensagem, não só por prioridade');
assert.match(chat,/resolveProductLookup/,'texto curto de produto deve ser resolvido no banco antes da IA');
assert.match(chat,/resolveBasketInsight/,'perguntas de preço\/orçamento de cesta devem usar dados reais antes da IA');
assert.match(chat,/generative_ai_enabled/,'motor deve respeitar IA generativa desligada');
assert.ok(chat.includes("if(!/\\b(cesta|bonini|koblenz|economica)/.test(s))return null;"),'comparações Bonini/Koblenz devem usar dados das cestas mesmo sem a palavra cesta');
assert.match(chat,/productLookupTerms/,'busca de produto deve tentar termos menores antes de recorrer à IA');
const deterministicBlock=chat.slice(chat.indexOf('function deterministic'),chat.indexOf('function ruleScore'));
for(const specific of ['amaciante','desinfetante','shampoo','sabonete','desodorante','fralda','racao','ração','tapete higienico','tapete higiênico']){
  assert.ok(!deterministicBlock.includes(specific),`produto específico ${specific} não deve abrir categoria inteira no atalho determinístico`);
}

for(const phrase of [
  '-- INTENT: downy_especifico',
  "'Quero amaciante Downy'",
  "'{\"query\":\"Downy\"}'::jsonb",
  '-- INTENT: abastecer_casa',
  'Preciso de uma opção simples para abastecer a casa',
  'Quero fazer a compra do mês',
  'Ver cestas',
  'Ver produtos'
]) assert.ok(edgeCases.includes(phrase),`caso de lançamento deve cobrir: ${phrase}`);

const intentCount=(migration.match(/-- INTENT:/g)||[]).length+(edgeCases.match(/-- INTENT:/g)||[]).length;
assert.ok(intentCount>=22&&intentCount<=37,`esperadas 22-37 intenções comerciais, encontradas ${intentCount}`);

for(const phrase of [
  'Aceita Alelo',
  'Posso trocar produtos da cesta',
  'Não trabalhamos com fiado',
  'Quero falar com uma pessoa',
  'Quero produtos de higiene e beleza',
  'Quero produtos para meu pet',
  'Quero finalizar minha compra'
]) assert.ok(migration.includes(phrase),`migration deve cobrir: ${phrase}`);

for(const category of [
  'BELEZA','SHAMPOO E CONDICIONADOR','HIGIENE','SABONETE','BEBÊ','DESODORANTE',
  'LIMPEZA','LAVANDERIA','PETS','UTENSÍLIOS E UTILIDADES','TEMPEROS','CAFÉ DA MANHÃ',
  'BOLACHAS E BISCOITOS','MACARRÃO E MOLHOS','MERCEARIA BÁSICA','MOLHOS E CONDIMENTOS',
  'CONFEITARIA','BALAS E CHICLETES','SUCOS, REFRI E ENERGÉTICOS','CHOCOLATES E DOCES','SALGADINHOS E PETISCOS'
]) assert.ok(migration.includes(category),`classificação comercial deve cobrir categoria ${category}`);

assert.match(migration,/generative_ai_enabled\s*=\s*false/i,'IA generativa deve ficar desligada');
assert.match(migration,/classifier_ai_enabled\s*=\s*true/i,'classificador semântico deve permanecer disponível como fallback');

const simulations=[
 'Oi','Bom dia','Quero comprar','O que vocês vendem?','Como funciona?','Me ajuda a fazer uma compra','Quero montar meu pedido','Não sei o que comprar',
 'Quais cestas vocês têm?','Me mostra as cestas básicas','Quanto custa uma cesta?','Qual é a cesta mais barata?','Qual é a cesta mais completa?','Quero uma cesta pequena','Quero uma cesta grande','Tem cesta de uns 200 reais?','Tenho 250 reais, qual cesta dá?','Qual cesta compensa mais?','Qual diferença da Bonini pra Koblenz?','O que vem na cesta Grande Bonini?',
 'O que vem na Média Koblenz?','Essa cesta tem arroz e feijão?','Tem óleo nessa cesta?','Qual cesta tem mais produtos?','Posso trocar produto da cesta?','Posso tirar um produto que não gosto?','Posso colocar mais arroz?','Quero essa cesta do jeito que está',
 'Tem arroz?','Vocês vendem leite?','Tem leite sem lactose?','Quanto está o leite Piracanjuba?','Tem leite de 1 litro?','Tem maionese Hellmann’s?','Quanto custa a Nutella?','Tem chocolate Laka?','Tem biscoito?','Quero produtos para café da manhã','Tem creme de leite?','Qual creme de leite é mais barato?',
 'Tem sabão em pó?','Quanto custa OMO?','Tem OMO líquido grande?','Quero amaciante Downy','Qual Downy vocês têm?','Tem amaciante barato?','Quero alguma coisa para tirar manchas','Tem produto para roupa branca?','Quero detergente de louça','Tem desinfetante de 2 litros?','Quero produtos de limpeza','Mostra lavanderia','Quero coisas para limpar a casa','Preciso fazer uma compra de limpeza completa',
 'Quero produtos de higiene','Tem papel higiênico?','Tem fralda tamanho M?','Tem alguma coisa para cachorro?','Tem ração para cachorro?','Tem alguma coisa para gato?','Tem tapete higiênico?','Quais produtos estão em promoção?','Tem alguma oferta hoje?','O que está mais barato hoje?','Tem promoção de cesta?',
 'Como posso pagar?','Aceita PIX?','Aceita cartão?','Parcela no cartão?','Aceita Alelo?','Aceita cartão alimentação?','Posso pagar quando receber?','Vocês entregam?','Entrega em Cuiabá?','Entrega em Várzea Grande?','Entrega hoje?','Quero fechar meu pedido','Pode finalizar pra mim','Quanto ficou minha compra?','Quero falar com uma pessoa'
];
assert.equal(simulations.length,80,'matriz de regressão deve manter 80 perguntas simuladas');

console.log('chat_deterministic_first_v1_contract_ok');
