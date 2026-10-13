import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const preview=new URL('../preview/index.html',import.meta.url);
const html=readFileSync(preview,'utf8');
const click=(doc,selector)=>{
 const target=doc.querySelector(selector);
 assert.ok(target,'Missing clickable UI: '+selector);
 assert.equal(target.disabled,false,'Disabled control: '+selector);
 target.click();return target;
};
const screen=(doc)=>doc.querySelector('#flowBody')?.textContent||'';

test('Native WhatsApp-like mobile simulator renders full editable journey without undefined text',async t=>{
 const dom=new JSDOM(html,{url:'https://lab.invalid/',pretendToBeVisual:true});
 const previous={window:globalThis.window,document:globalThis.document};
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 t.after(()=>{
  globalThis.window=previous.window;
  globalThis.document=previous.document;
  dom.window.close();
 });
 await import('../preview/app.mjs');
 const d=dom.window.document;
 assert.match(d.querySelector('.chat')?.textContent||'',/Ver cestas/);
 assert.equal(d.querySelectorAll('.msg .native-row').length,0);
 click(d,'#openList');
 assert.ok(!d.querySelector('#basketSheet').classList.contains('hidden'));
 assert.equal(d.querySelectorAll('#basketRows .sheet-row').length,5,
  'Five baskets must be a native-like modal LIST, not five reply buttons inside chat');
 click(d,'#basketRows .sheet-row:nth-child(2)');
 assert.ok(d.querySelector('#basketSheet').classList.contains('hidden'));
 assert.match(d.querySelector('#chat').textContent,/Mini Completa/);
 click(d,'#chat .msg:last-child .chat-button');
 assert.ok(!d.querySelector('#flow').classList.contains('hidden'));
 assert.match(screen(d),/Mini Completa/);
 assert.doesNotMatch(screen(d),/\bundefined\b|\[object Object\]/);
 assert.equal(d.querySelectorAll('#modeOptions .native-row').length,2);
 click(d,'#modeOptions .native-row:nth-child(2)');
 click(d,'#flowNext');
 assert.match(screen(d),/Produto 1 de 23/);
 assert.equal(d.querySelectorAll('#productOptions .native-row').length,5,
  'Three brands, conditional option and remove; radio-style rows');
 const initialTotal=d.querySelector('.total strong').textContent;
 click(d,'#productOptions .native-row:nth-child(2)');
 assert.notEqual(d.querySelector('.total strong').textContent,initialTotal,
  'Selecting a brand should immediately reprice the current basket');
 assert.doesNotMatch(screen(d),/\bundefined\b|\[object Object\]/);
 for(let i=0;i<23;i++){
  assert.match(screen(d),new RegExp('Produto '+(i+1)+' de 23'));
  click(d,'#flowNext');
 }
 assert.match(screen(d),/Deseja acrescentar outros produtos/);
 assert.equal(d.querySelectorAll('#extraOptions .native-row').length,2);
 click(d,'#extraOptions .native-row:first-child');
 click(d,'#flowNext');
 assert.match(screen(d),/Entrega e pagamento/);
 assert.ok(d.querySelector('#customerName'));
 assert.ok(d.querySelector('#address'));
 assert.equal(d.querySelectorAll('#paymentOptions .native-row').length,4);
 click(d,'#flowNext');
 assert.match(screen(d),/Confira sua cesta/);
 click(d,'#flowNext');
 assert.match(screen(d),/Simulação concluída/);
 assert.doesNotMatch(screen(d),/\bundefined\b|\[object Object\]/);
 click(d,'#flowNext');
 assert.ok(d.querySelector('#flow').classList.contains('hidden'));
 assert.match(d.querySelector('#chat').textContent,/Nenhum pedido real foi gerado/);
 // A second, "buy ready" journey must not force product-by-product selection.
 click(d,'#openList');
 click(d,'#basketRows .sheet-row:nth-child(1)');
 click(d,'#chat .msg:last-child .chat-button');
 click(d,'#modeOptions .native-row:first-child');
 click(d,'#flowNext');
 assert.match(screen(d),/Sua cesta está pronta/);
 assert.doesNotMatch(screen(d),/\bundefined\b/);
});
test('Preview never gives an impression of unsupported WhatsApp message components',()=>{
 assert.match(html,/Ver cestas/);
 assert.match(html,/SIMULAÇÃO · NÃO É O WHATSAPP REAL/);
 assert.match(html,/basketSheet/);
 assert.match(html,/flowBody/);
 assert.match(html,/script type="module" src="\.\/app\.mjs"/);
 assert.match(html,/connect-src 'none'/);
 assert.doesNotMatch(html,/https?:\/\/|sendBeacon\(|fetch\(/i);
 const app=readFileSync(new URL('../preview/app.mjs',import.meta.url),'utf8');
 assert.match(app,/import \{createLabSession/);
 assert.match(app,/checkoutBack/);
 assert.doesNotMatch(app,/fetch\(|WebSocket\(|navigator\.sendBeacon\(/);
});
