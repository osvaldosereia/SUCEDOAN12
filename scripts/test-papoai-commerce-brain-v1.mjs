import assert from 'node:assert/strict';
import {
  formatBasketCatalog,formatBasketDetail,formatCartState,formatProductResults,
  parseDeterministicIntent,chooseExactProduct
} from '../supabase/functions/_shared/papoai-commerce-brain-v1.mjs';

const baskets=[
  {name:'Mini Bonini',display_name:'Mini Bonini',commercial_price:175},
  {name:'Grande Bonini',display_name:'Grande Bonini',commercial_price:410}
];
assert.match(formatBasketCatalog(baskets),/Mini Bonini/);
assert.match(formatBasketCatalog(baskets),/R\$\s*175,00/);

const detail={found:true,basket:{name:'Mini Bonini',display_name:'Mini Bonini',commercial_price:175},items:[
  {name:'Arroz Tio Bonini 5 kg',quantity:1,category:'MERCEARIA BÁSICA'},
  {name:'Feijão Carioca 1 kg',quantity:2,category:'MERCEARIA BÁSICA'},
  {name:'Sabonete Farnese',quantity:2,category:'SABONETE'},
  {name:'Detergente Minuano',quantity:1,category:'LIMPEZA'}
]};
const formatted=formatBasketDetail(detail);
for(const name of ['Arroz Tio Bonini 5 kg','Feijão Carioca 1 kg','Sabonete Farnese','Detergente Minuano']){
  assert.ok(formatted.includes(name),'full basket must include every item');
}
assert.equal((formatted.match(/Arroz Tio/g)||[]).length,1);
assert.match(formatted,/\*Alimentos\*/);
assert.match(formatted,/\*Higiene\*/);
assert.match(formatted,/\*Limpeza e lavanderia\*/);
assert.doesNotMatch(formatted,/unit_price|hidden_adjustment|custo|R\$.*Feijão/);

assert.deepEqual(parseDeterministicIntent('Quais cestas vocês têm?',baskets,false),{intent:'list_baskets'});
assert.deepEqual(parseDeterministicIntent('O que vem na Mini Bonini?',baskets,false),{intent:'basket_contents',basketQuery:'Mini Bonini'});
assert.deepEqual(parseDeterministicIntent('Quero a Mini Bonini',baskets,false),{intent:'choose_basket',basketQuery:'Mini Bonini'});
assert.equal(parseDeterministicIntent('tira o açúcar',baskets,true).intent,'remove_item');
const swap=parseDeterministicIntent('troca açúcar por açúcar refinado',baskets,true);
assert.equal(swap.intent,'replace_item'); assert.equal(swap.sourceQuery,'acucar'); assert.equal(swap.targetQuery,'acucar refinado');
const add=parseDeterministicIntent('coloca 2 óleo',baskets,true);
assert.equal(add.intent,'add_or_increase'); assert.equal(add.quantity,2);
assert.equal(parseDeterministicIntent('quais ofertas tem hoje?',baskets,false).intent,'offers');
assert.equal(parseDeterministicIntent('quero falar com uma pessoa',baskets,false).intent,'handoff');

const offer=formatProductResults([{name:'Amido Apti 200 g',price:4.9,offer_price:3.9,is_offer:true,image_url:'https://example.com/a.webp'}],{spotlight:true});
assert.equal(offer.media_url,'https://example.com/a.webp'); assert.match(offer.text,/3,90/);

const exact=chooseExactProduct('açúcar refinado',[{name:'Açúcar Refinado Itamarati 1 kg'},{name:'Açúcar Demerara Itamarati 1 kg'}]);
assert.equal(exact?.name,'Açúcar Refinado Itamarati 1 kg');

const cartText=formatCartState({has_cart:true,total:172,basket:{name:'Mini Bonini'},items:[
  {name:'Açúcar Refinado',source:'substitution',quantity:1,changed:true},
  {name:'Amido Apti',source:'addon',quantity:1}
]});
assert.match(cartText,/R\$\s*172,00/);
assert.doesNotMatch(cartText,/hidden|other_expenses|fiscal/i);
console.log('PASS: PapoAI Commerce Brain pure conversation contract');
