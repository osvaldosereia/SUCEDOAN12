import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const candidates=['pilot.draft.flow.json','dynamic-paging.candidate.flow.json'];
function walk(value,cb,path='root'){
 if(Array.isArray(value)){value.forEach((x,i)=>walk(x,cb,path+'['+i+']'));return}
 if(value&&typeof value==='object'){
  for(const [key,x] of Object.entries(value)){
   cb(key,x,path);
   walk(x,cb,path+'.'+key);
  }
 }
}
const ref=/\$\{(data|form)\.([A-Za-z_][A-Za-z_0-9]*)\}/g;
test('WhatsApp Flow dynamic text is a full binding, not unsupported interpolation',()=>{
 for(const name of candidates){
  const flow=JSON.parse(readFileSync(new URL('../flows/'+name,import.meta.url),'utf8'));
  for(const screen of flow.screens){
   walk(screen.layout,(key,value,path)=>{
    if(typeof value!=='string'||!value.includes('$'+'{'))return;
    if(!['text','description','label'].includes(key))return;
    assert.match(value,/^\$\{(?:data|form)\.[A-Za-z_][A-Za-z_0-9]*\}$/,
      name+' / '+screen.id+' / '+path+'.'+key);
   });
  }
 }
});
test('Every Flow data reference used on a screen is declared in its screen schema',()=>{
 for(const name of candidates){
  const flow=JSON.parse(readFileSync(new URL('../flows/'+name,import.meta.url),'utf8'));
  for(const screen of flow.screens){
   const raw=JSON.stringify(screen.layout),references=[...raw.matchAll(ref)];
   const fields=new Set(Object.keys(screen.data||{}));
   for(const m of references){
    if(m[1]!=='data')continue;
    assert.ok(fields.has(m[2]),name+' / '+screen.id+' missing '+m[2]);
   }
  }
 }
});
test('Product option schema supports image thumbnails and disabled options',()=>{
 for(const name of candidates){
  const flow=JSON.parse(readFileSync(new URL('../flows/'+name,import.meta.url),'utf8'));
  const product=flow.screens.find(x=>x.id==='PRODUCT_PILOT');
  const p=product.data.options.items.properties;
  for(const field of ['id','title','description','image','alt-text','enabled'])
    assert.ok(p[field],name+' missing '+field);
 }
});
