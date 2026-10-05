const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const code=fs.readFileSync('vitrine/instagram-resilience.js','utf8');

async function run(initialText){
  let fetchCount=0,reloadCount=0,lastObserver=null;
  const store=new Map(),session=new Map(),content={textContent:initialText};
  class MutationObserver{
    constructor(cb){this.cb=cb;lastObserver=this}
    observe(){}
    disconnect(){this.disconnected=true}
  }
  const context={
    console,Date,URL,
    setTimeout:(fn)=>setTimeout(fn,0),clearTimeout,
    AbortController:class{constructor(){this.signal={}}abort(){}},
    fetch:async()=>{fetchCount++;return {ok:true,json:async()=>({ok:true,baskets:[{id:'x'}]})}},
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
    sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v)},
    location:{reload:()=>reloadCount++,href:'https://donaantonia.com.br/'},
    document:{readyState:'complete',getElementById:id=>id==='content'?content:null,addEventListener:()=>{}},
    MutationObserver,
  };
  context.window=context;
  vm.runInNewContext(code,context);
  await new Promise(r=>setImmediate(r));
  return {
    get fetchCount(){return fetchCount},get reloadCount(){return reloadCount},
    content,get observer(){return lastObserver},flush:()=>new Promise(r=>setImmediate(r))
  };
}

(async()=>{
  const initial=await run('Não consegui abrir a vitrine agora.');
  assert.equal(initial.fetchCount,1,'hard error must trigger exactly one recovery fetch');
  assert.equal(initial.reloadCount,1,'successful recovery must reload exactly once');

  const mutation=await run('Vitrine carregando');
  assert.equal(mutation.fetchCount,0,'healthy render must not prefetch home');
  mutation.content.textContent='Não consegui abrir a vitrine agora.';
  mutation.observer.cb();mutation.observer.cb();mutation.observer.cb();
  await mutation.flush();
  assert.equal(mutation.fetchCount,1,'repeated DOM mutations must still trigger one recovery fetch');
  assert.equal(mutation.reloadCount,1,'mutation recovery must reload once');
  console.log('storefront recovery: ok');
})().catch(err=>{console.error(err);process.exit(1)});
