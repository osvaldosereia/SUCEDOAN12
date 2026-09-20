const HUB_ID='adminCatalogQualityV2';

function enhance(){
  const app=document.getElementById('app');
  if(!app||location.hash!=='#products'||document.getElementById(HUB_ID))return;
  const heading=app.querySelector('.page-head, h1')?.closest('.page-head')||app.querySelector('h1');
  if(!heading)return;
  const hub=document.createElement('section');
  hub.id=HUB_ID;
  hub.className='da-catalog-quality';
  hub.setAttribute('aria-label','Qualidade do catálogo');
  hub.innerHTML=`<div class="da-catalog-quality__head"><div><span class="eyebrow">Qualidade do catálogo</span><h2>Revisar antes de publicar melhor</h2><p>Nomes, fotos e cadastro continuam em ferramentas próprias. Esta central apenas organiza o caminho e não executa IA automaticamente.</p></div></div><div class="da-catalog-quality__grid"><a href="./nomes-produtos.html"><strong>Nomes dos produtos</strong><span>Padronizar, revisar conflitos e comparar nome atual com sugestão.</span><b>Revisar nomes →</b></a><a href="./imagens-ia.html"><strong>Imagens dos produtos</strong><span>Revisar imagens ruins, comparar origem e candidata e decidir manualmente.</span><b>Revisar imagens →</b></a><button type="button" data-quality-products><strong>Cadastro do produto</strong><span>Nome, EAN, marca, embalagem, foto, descrição e dados comerciais permanecem no cadastro oficial.</span><b>Continuar em Produtos ↓</b></button></div><p class="da-catalog-quality__note">Ações que geram IA, alteram nome ou substituem imagem continuam exigindo comando explícito nas respectivas ferramentas.</p>`;
  heading.after(hub);
  hub.querySelector('[data-quality-products]')?.addEventListener('click',()=>app.querySelector('.toolbar, .products-toolbar, form')?.scrollIntoView({behavior:'smooth',block:'start'}));
}

const observer=new MutationObserver(enhance);
observer.observe(document.getElementById('app'),{childList:true,subtree:true});
window.addEventListener('hashchange',enhance);
enhance();
