import assert from 'node:assert/strict';
import fs from 'node:fs';

const modulePath='supabase/functions/_shared/deterministic-query-engine.js';
assert.equal(fs.existsSync(modulePath),true,'deve existir módulo compartilhado do motor determinístico V2');
const engine=await import(`../${modulePath}`);
const {parseDeterministicQuery,filterAndRankBaskets,rankProducts}=engine;
assert.equal(typeof parseDeterministicQuery,'function');
assert.equal(typeof filterAndRankBaskets,'function');
assert.equal(typeof rankProducts,'function');

const p1=parseDeterministicQuery('Qual a maior cesta?',{});
assert.equal(p1.domain,'baskets');
assert.equal(p1.operation,'largest');

const p2=parseDeterministicQuery('Qual a mais cara?',{topic:'baskets'});
assert.equal(p2.domain,'baskets');
assert.equal(p2.operation,'most_expensive');

const p3=parseDeterministicQuery('Quero uma cesta com 2 arroz',{});
assert.equal(p3.domain,'baskets');
assert.equal(p3.quantity?.value,2);
assert.equal(p3.quantity?.mode,'exact');
assert.ok(p3.includeTerms.includes('arroz'));

const p4=parseDeterministicQuery('Tem cesta sem material de limpeza?',{});
assert.equal(p4.domain,'baskets');
assert.ok(p4.excludeCategories.includes('limpeza_lavanderia'));

const p5=parseDeterministicQuery('Qual café você tem?',{});
assert.equal(p5.domain,'products');
assert.ok(p5.productTerms.includes('cafe'));
assert.equal(p5.operation,'list_products');

const p6=parseDeterministicQuery('Quais cafés de 500g vocês têm?',{});
assert.ok(p6.productTerms.includes('cafe'));
assert.ok(p6.packageTerms.includes('500g'));

const p7=parseDeterministicQuery('Qual cesta tem mais arroz?',{});
assert.equal(p7.domain,'baskets');
assert.equal(p7.operation,'most_of_item');
assert.ok(p7.includeTerms.includes('arroz'));

const p8=parseDeterministicQuery('Qual cesta mais barata com pelo menos 3 arroz?',{});
assert.equal(p8.operation,'cheapest');
assert.equal(p8.quantity?.value,3);
assert.equal(p8.quantity?.mode,'min');
assert.ok(p8.includeTerms.includes('arroz'));

const p9=parseDeterministicQuery('Quero uma cesta até 300 reais sem produto de limpeza',{});
assert.equal(p9.budget,300);
assert.ok(p9.excludeCategories.includes('limpeza_lavanderia'));

const p10=parseDeterministicQuery('Qual amaciante Downy mais barato?',{});
assert.equal(p10.domain,'products');
assert.equal(p10.operation,'cheapest');
assert.ok(p10.productTerms.includes('amaciante'));
assert.ok(p10.productTerms.includes('downy'));

const basketFixtures=[
 {id:'econ',name:'Economica Bonini',base_price:92,items:[{name:'Arroz Branco 5kg',brand:'X',category:'MERCEARIA BÁSICA',sales_category:'mercearia',quantity:1}]},
 {id:'peq',name:'Pequena Bonini',base_price:230,items:[{name:'Arroz Branco 5kg',brand:'X',category:'MERCEARIA BÁSICA',sales_category:'mercearia',quantity:2},{name:'Detergente 500ml',brand:'Y',category:'LIMPEZA',sales_category:'limpeza_lavanderia',quantity:2}]},
 {id:'med',name:'Média Bonini',base_price:340,items:[{name:'Arroz Branco 5kg',brand:'X',category:'MERCEARIA BÁSICA',sales_category:'mercearia',quantity:3},{name:'Sabão em pó 1kg',brand:'Y',category:'LAVANDERIA',sales_category:'limpeza_lavanderia',quantity:2}]},
 {id:'gra',name:'Grande Koblenz',base_price:420,items:[{name:'Arroz Branco 5kg',brand:'X',category:'MERCEARIA BÁSICA',sales_category:'mercearia',quantity:4},{name:'Feijão 1kg',brand:'Z',category:'MERCEARIA BÁSICA',sales_category:'mercearia',quantity:48}]}
];
assert.equal(filterAndRankBaskets(basketFixtures,p1)[0].id,'gra');
assert.equal(filterAndRankBaskets(basketFixtures,p2)[0].id,'gra');
assert.deepEqual(filterAndRankBaskets(basketFixtures,p3).map(x=>x.id),['peq']);
assert.deepEqual(filterAndRankBaskets(basketFixtures,p4).map(x=>x.id),['gra','econ']);
assert.equal(filterAndRankBaskets(basketFixtures,p7)[0].id,'gra');
assert.deepEqual(filterAndRankBaskets(basketFixtures,p8).map(x=>x.id),['med','gra']);
assert.deepEqual(filterAndRankBaskets(basketFixtures,p9).map(x=>x.id),['econ']);

const productFixtures=[
 {id:'1',name:'Café Torrado e Moído Tradicional Pilão 500 g',brand:'Pilão',packaging:'500g',category:'CAFÉ DA MANHÃ',sales_category:'mercearia',price:28.90,stock:9},
 {id:'2',name:'Café Torrado e Moído 3 Fazendas 250 g',brand:'3 Fazendas',packaging:'250g',category:'CAFÉ DA MANHÃ',sales_category:'mercearia',price:14.90,stock:10},
 {id:'3',name:'Café Premiado Super Forte 500g',brand:'Premiado',packaging:'500g',category:'CAFÉ DA MANHÃ',sales_category:'mercearia',price:26.90,stock:2},
 {id:'4',name:'Amaciante Downy Concentrado 1L',brand:'Downy',packaging:'1L',category:'LAVANDERIA',sales_category:'limpeza_lavanderia',price:18.90,stock:4},
 {id:'5',name:'Amaciante Downy Concentrado 3L',brand:'Downy',packaging:'3L',category:'LAVANDERIA',sales_category:'limpeza_lavanderia',price:39.90,stock:2}
];
assert.deepEqual(rankProducts(productFixtures,p5).slice(0,3).map(x=>x.id),['2','3','1']);
assert.deepEqual(rankProducts(productFixtures,p6).map(x=>x.id),['3','1']);
assert.equal(rankProducts(productFixtures,p10)[0].id,'4');

const index=fs.readFileSync('supabase/functions/shopping-chat-v1/index.ts','utf8');
for(const token of ['parseDeterministicQuery','resolveBasketQuery','resolveCatalogQuery','readRecentRoutingContext','ai_used:false']) assert.ok(index.includes(token),`shopping-chat deve integrar ${token}`);
const routeStart=index.indexOf('async function routeChatMessage');
assert.ok(routeStart>=0);
const route=index.slice(routeStart,routeStart+7000);
assert.ok(route.indexOf('directRule(message,rules)')<route.indexOf('resolveBasketQuery'),'regra explícita deve vir antes do motor V2');
assert.ok(route.indexOf('resolveBasketQuery')<route.indexOf('aiChoose'),'consulta de cesta deve vir antes da IA');
assert.ok(route.indexOf('resolveCatalogQuery')<route.indexOf('aiChoose'),'consulta de produto deve vir antes da IA');
assert.ok(!index.includes("opção${ranked.length===1?'':'ões'}"),'plural de opção deve ser formado como opção/opções, nunca opçãoões');

const simulations=[
'Qual a maior cesta?','Qual a menor cesta?','Qual a mais cara?','Qual a mais barata?','Qual cesta tem mais itens?','Qual cesta tem menos itens?','Quero uma cesta com 2 arroz','Tem cesta com 1 arroz?','Tem cesta com 3 arroz?','Tem cesta com 4 arroz?','Qual cesta tem mais arroz?','Qual cesta mais barata com pelo menos 3 arroz?','Quero cesta com pelo menos 2 arroz','Tem cesta sem material de limpeza?','Tem cesta sem produto de limpeza?','Tem cesta sem sabão?','Tem cesta sem detergente?','Tem cesta sem lavanderia?','Quero cesta até 200 reais','Quero cesta até 250 reais','Quero cesta até 300 reais','Tenho 350 reais para uma cesta','Quero cesta até 300 sem limpeza','Qual cesta até 250 tem 2 arroz?','Qual cesta mais barata com arroz?','Qual cesta mais cara com arroz?','A cesta Econômica tem limpeza?','A Pequena Bonini tem 2 arroz?','A Média Bonini tem quantos arroz?','A Grande Koblenz tem material de limpeza?',
'Qual café você tem?','Quais cafés vocês têm?','Tem café Pilão?','Tem Pilão?','Qual café mais barato?','Qual café mais caro?','Quais cafés de 500g vocês têm?','Tem café de 250g?','Tem Café Brasileiro?','Tem Café Premiado?','Tem café tradicional?','Tem café extraforte?','Tem café a vácuo?','Quanto custa o café Pilão?','Qual Pilão de 500g vocês têm?','Qual café 500g mais barato?','Quero café de 500g','Quero café barato','Quero café Pilão 500g','Qual amaciante Downy mais barato?','Quais Downy vocês têm?','Tem Downy de 3L?','Tem amaciante de 1L?','Qual detergente mais barato?','Tem detergente de 500ml?','Quais sabões em pó vocês têm?','Tem OMO?','Tem OMO líquido?','Tem desinfetante de 2 litros?','Qual desinfetante mais barato?','Tem água sanitária?','Tem alvejante?','Quero produto para lavar roupa','Quero produto para tirar manchas','Tem Vanish?','Quero shampoo','Qual shampoo mais barato?','Tem sabonete?','Tem desodorante?','Tem fralda tamanho M?','Quais fraldas vocês têm?','Tem papel higiênico?','Tem ração para cachorro?','Tem ração para gato?','Tem tapete higiênico?',
'Tem arroz?','Qual arroz mais barato?','Tem arroz de 5kg?','Tem feijão?','Qual feijão mais barato?','Tem leite?','Tem leite Piracanjuba 1L?','Qual leite mais barato?','Tem leite em pó?','Tem macarrão?','Qual macarrão mais barato?','Tem molho de tomate?','Tem maionese Hellmanns?','Tem Nutella?','Tem chocolate Laka?','Tem biscoito?','Quais produtos para café da manhã?','Tem açúcar?','Tem óleo?','Tem farinha?','Tem sal?','Tem tempero?','Tem refrigerante?','Tem suco?','Tem energético?',
'Quais cestas vocês têm?','E qual a mais cara?','E a maior?','Qual tem mais arroz?','Quais cafés vocês têm?','E qual o mais barato?','Tem de 500g?','Quais Downy vocês têm?','E qual o mais barato?','Tem de 3 litros?','Me mostra produtos de limpeza','Tem algo mais barato?','Quero uma cesta sem limpeza e até 250','Quero uma cesta com 2 arroz e sem limpeza','Qual cesta cabe em 240 reais?','Qual cesta tem exatamente 2 arroz?','Tem cesta com pelo menos 2 arroz e até 350?','Qual cesta sem limpeza é mais barata?','Qual café Pilão é mais barato?','Qual produto Downy tem menor preço?'
];
assert.ok(simulations.length>=100,`esperadas pelo menos 100 perguntas, encontradas ${simulations.length}`);
console.log(`chat_deterministic_query_engine_v2_contract_ok:${simulations.length}`);
