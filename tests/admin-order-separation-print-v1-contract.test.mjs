import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {groupForSeparation,separationDocument} from '../admin/order-separation-print-v1.js';

const app=fs.readFileSync(new URL('../admin/app.js',import.meta.url),'utf8');
const integrated=fs.readFileSync(new URL('../admin/orders-integrated-v2.js',import.meta.url),'utf8');
const dedicated=fs.readFileSync(new URL('../admin/pedidos-v2.js',import.meta.url),'utf8');
const backend=fs.readFileSync(new URL('../supabase/functions/admin-orders-comprar-v1/index.ts',import.meta.url),'utf8');
const menuCss=fs.readFileSync(new URL('../admin/order-print-menu-v1.css',import.meta.url),'utf8');

test('orders expose one print menu with Pedido, Etiqueta and Separação',()=>{
  assert.match(app,/order-print-menu/);
  assert.match(app,/data-print-full-integrated/);
  assert.match(app,/data-print-label-integrated/);
  assert.match(app,/data-print-separation-integrated/);
  assert.match(dedicated,/data-print-full-order/);
  assert.match(dedicated,/data-print-order/);
  assert.match(dedicated,/data-print-separation-order/);
  assert.match(menuCss,/order-print-menu-popover/);
});

test('separation groups by gondola naturally and leaves missing locations last',()=>{
  const groups=groupForSeparation([
    {id:'a',quantity:1,product_snapshot:{gtin:'10',gondola:'10',shelf:'B2',image_url:'a.webp'}},
    {id:'b',quantity:2,product_snapshot:{gtin:'2',gondola:'02',shelf:'A1',image_url:'b.webp'}},
    {id:'c',quantity:3,product_snapshot:{gtin:'1',gondola:'01',shelf:'A1',image_url:'c.webp'}},
    {id:'d',quantity:1,product_snapshot:{gtin:'99',gondola:'',shelf:'',image_url:''}}
  ]);
  assert.deepEqual(groups.map(group=>group.gondola),['01','02','10','']);
  assert.equal(groups.at(-1).label,'Sem localização');
});

test('thermal separation is 85mm, two columns and never prints product names',()=>{
  const html=separationDocument({order_number:'DA-TESTE',created_at:'2026-09-21T12:00:00Z'},[
    {id:'a',name_snapshot:'NOME QUE NÃO PODE SAIR',quantity:2,product_snapshot:{gtin:'7891234567890',gondola:'01',shelf:'A1',image_url:'https://example.com/p.webp'}}
  ]);
  assert.match(html,/width:85mm/);
  assert.match(html,/grid-template-columns:repeat\(2/);
  assert.match(html,/Gôndola 01/);
  assert.match(html,/7891234567890/);
  assert.match(html,/QTD/);
  assert.doesNotMatch(html,/NOME QUE NÃO PODE SAIR/);
});

test('order detail backend enriches read-only items without changing stored order items',()=>{
  assert.match(backend,/product_snapshot/);
  assert.match(backend,/gtin,image_url,image_ai_url,image_original_url,image_firebase_source_url,gondola,shelf,firebase_snapshot/);
  assert.match(backend,/product\?\.gondola\|\|legacy\?\.gondola/);
  assert.match(backend,/product\?\.shelf\|\|legacy\?\.prateleira/);
  assert.doesNotMatch(backend,/from\('order_items'\)\.update/);
  assert.match(integrated,/requestOrderSeparationPrint/);
});
