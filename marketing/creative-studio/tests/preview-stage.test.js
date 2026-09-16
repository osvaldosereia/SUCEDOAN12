import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPreviewMarkup} from '../preview-stage.js';

const model={aspect:'9:16',duration:18,concept:'Um campo inteiro dentro do frasco',territory:'aroma floral',productName:'Desinfetante Flores do Campo',productImage:'https://example.com/p.webp',camera:'cinematic_push',assetReady:'3/3',scenes:[{start:0,end:6,summary:'Uma flor nasce'},{start:6,end:12,summary:'O campo cresce'},{start:12,end:18,summary:'Produto e oferta'}],close:{badge:'OFERTA',priceText:'R$ 9,90',compareAtText:'R$ 12,90',cta:'Peça pelo WhatsApp',serviceArea:'Cuiabá e Várzea Grande'}};

test('renders a vertical preview stage with real product and truthful close',()=>{
  const html=renderPreviewMarkup(model);
  assert.match(html,/creative-preview-stage/);
  assert.match(html,/Desinfetante Flores do Campo/);
  assert.match(html,/https:\/\/example\.com\/p\.webp/);
  assert.match(html,/OFERTA/);
  assert.match(html,/9,90/);
  assert.match(html,/Peça pelo WhatsApp/);
  assert.match(html,/cinematic_push/);
});

test('renders scene timeline segments and readiness metadata',()=>{
  const html=renderPreviewMarkup(model);
  assert.equal((html.match(/preview-scene/g)||[]).length,3);
  assert.match(html,/3\/3 elementos prontos/);
  assert.match(html,/0–6s/);
  assert.match(html,/12–18s/);
});

test('does not invent image or offer when absent',()=>{
  const html=renderPreviewMarkup({...model,productImage:null,close:{badge:null,priceText:'R$ 5,00',compareAtText:'',cta:'Peça pelo WhatsApp',serviceArea:'Cuiabá e Várzea Grande'}});
  assert.doesNotMatch(html,/<img/);
  assert.doesNotMatch(html,/OFERTA/);
  assert.match(html,/R\$.*5,00/);
});
