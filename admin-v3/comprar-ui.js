const BUY_URL='../comprar/';

function redirectLegacyHash(event){
  if(location.hash==='#storefront'){
    if(event)event.stopImmediatePropagation();
    location.replace(BUY_URL);
    return true;
  }
  return false;
}

redirectLegacyHash();
window.addEventListener('hashchange',event=>redirectLegacyHash(event),true);

const replacements=[
  ['Pedidos recentes da vitrine','Pedidos recentes do Comprar'],
  ['Nenhum pedido da vitrine ainda.','Nenhum pedido do Comprar ainda.'],
  ['Somente pedidos recebidos pela vitrine.','Somente pedidos recebidos pelo Comprar.'],
  ['Organize o que o cliente encontra na vitrine.','Organize as categorias do catálogo.'],
  ['Destaque na vitrine','Destaque no Comprar'],
  ['Abrir vitrine','Abrir Comprar'],
  ['Ver vitrine','Abrir Comprar'],
  ['Carregando controles da vitrine…','Carregando…'],
  ['Vitrine salva.','Configuração salva.'],
  ['Salvar vitrine','Salvar'],
  ['na vitrine','no Comprar'],
  ['da vitrine','do Comprar'],
  ['pela vitrine','pelo Comprar'],
  ['Vitrine','Comprar'],
  ['vitrine','Comprar']
];

function rewriteText(root=document){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const value=node.nodeValue||'';
    let next=value;
    for(const [from,to] of replacements)next=next.split(from).join(to);
    if(next!==value)node.nodeValue=next;
  }
}

function rewriteLinks(root=document){
  root.querySelectorAll?.('a[href]').forEach(link=>{
    const href=link.getAttribute('href')||'';
    if(href.includes('vitrine-v3')||href==='./#storefront'||href==='#storefront'){
      link.setAttribute('href',BUY_URL);
      link.setAttribute('target','_blank');
      link.setAttribute('rel','noopener');
      if(/vitrine|comprar/i.test(link.textContent||''))link.textContent=link.classList.contains('view-storefront')?'Abrir Comprar':'Comprar';
    }
  });
}

function apply(root=document){
  rewriteLinks(root);
  rewriteText(root);
}

const start=()=>{
  apply(document);
  const target=document.getElementById('app')||document.body;
  new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node.nodeType===Node.ELEMENT_NODE)apply(node);
        else if(node.nodeType===Node.TEXT_NODE)rewriteText(node.parentNode||document);
      }
    }
  }).observe(target,{childList:true,subtree:true});
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
