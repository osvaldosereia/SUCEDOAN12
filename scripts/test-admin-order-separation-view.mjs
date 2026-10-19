import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{},String,Boolean};
vm.createContext(context);
vm.runInContext(fs.readFileSync('vitrine/admin/orders/separation-view.js','utf8'),context);
let closeCalls=0,action=null;
const nodes={
  '.orders-sheet-close':{onclick:null},
  '.orders-sheet-body':{},
  '.orders-sheet-foot':{hidden:false}
};
const backdrop={
  className:'',innerHTML:'',dataset:{},
  querySelector(selector){return nodes[selector]},
  contains(target){return target.inside===true},
  onclick:null
};
const document={createElement(tag){assert.equal(tag,'div');return backdrop}};
const view=context.window.DonaAntoniaAdminOrderSeparationView.create({
  document,escapeHtml:value=>String(value).replaceAll('<','&lt;').replaceAll('>','&gt;')
});
const rendered=view.createShell('<pedido>');
assert.equal(rendered,backdrop);
assert.equal(backdrop.className,'orders-bottom-sheet-backdrop');
assert.match(backdrop.innerHTML,/Separação do pedido #&lt;pedido&gt;/);
assert.match(backdrop.innerHTML,/Marque cada produto como SEPARADO ou FALTOU/);
assert.match(backdrop.innerHTML,/<footer class="orders-sheet-foot" hidden><\/footer>/);

const actionEvent={target:null,prevented:false,preventDefault(){this.prevented=true}};
const button={inside:true,disabled:false,dataset:{orderItem:'item-1',separationState:'missing'}};
view.bindInteractions({backdrop,orderId:'order-1',close:()=>closeCalls++,onItem:(...args)=>action=args});
nodes['.orders-sheet-close'].onclick();
assert.equal(closeCalls,1);
backdrop.onclick({target:backdrop,preventDefault(){}});
assert.equal(closeCalls,2);
actionEvent.target={inside:true,closest:()=>button};
backdrop.onclick(actionEvent);
assert.equal(actionEvent.prevented,true);
assert.deepEqual(action,['order-1','item-1','missing',backdrop,button]);
backdrop.dataset.separationBusy='1';
action=null;
backdrop.onclick({target:{inside:true,closest:()=>button},preventDefault(){}});
assert.equal(action,null,'busy sheet ignores repeated product actions');

console.log('Admin order separation view shell and delegated actions: PASS');
