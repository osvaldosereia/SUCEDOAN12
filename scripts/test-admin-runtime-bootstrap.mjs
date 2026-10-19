import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const nodes=new Map();
for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))nodes.set('#'+id,{
  onclick:null,innerHTML:'',dataset:{},
  classList:{add(){},remove(){},toggle(){},contains:()=>false},
  setAttribute(){},removeAttribute(){},addEventListener(){},close(){}
});
const redirects=[];
const location={search:'?montar=1',pathname:'/vitrine/admin/',hash:'',replace:url=>redirects.push(url)};
const sandbox={
  window:{addEventListener(){},matchMedia:()=>({matches:false})},
  document:{querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({dataset:{}}),head:{appendChild(){}}},
  confirm:()=>assert.fail('unexpected confirmation during bootstrap'),prompt:()=>assert.fail('unexpected prompt during bootstrap'),location,history:{replaceState(){}},URL,URLSearchParams,console:{...console,warn:()=>{}},setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},
  fetch:()=>{throw new Error('bootstrap must not make external requests in this fixture')}
};
vm.createContext(sandbox);
const sources=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
for(const url of sources){
  if(!url.startsWith('/vitrine/admin/'))continue;
  const source=fs.readFileSync(url.slice(1),'utf8');
  assert.doesNotThrow(()=>vm.runInContext(source,sandbox,{filename:url}), 'Admin must initialize providers before consumers: '+url);
  if(url==='/vitrine/admin/admin-runtime.js')break;
}
assert.deepEqual(redirects,['/montar/?erro=pedido_invalido']);
assert.equal(typeof sandbox.window.DonaAntoniaAdminBridge?.api,'function');
console.log('Admin runtime full bootstrap: PASS');
