function renderVisualBible(){
  const el=document.getElementById('visualBibleStatus');if(!el)return;
  const locked=!!visualBible?.locked;
  el.textContent=locked?'Identidade visual aprovada. As próximas imagens usam esta referência + a imagem anterior aprovada.':'A primeira imagem aprovada definirá personagem, materiais, cenário, paleta e tratamento do produto.';
  el.className=`studio-search-status ${locked?'approved':''}`;
}

async function studioCopyText(text){
  try{await navigator.clipboard.writeText(text);return true}catch{
    const t=document.createElement('textarea');t.value=text;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();let ok=false;
    try{ok=document.execCommand('copy')}catch{}
    t.remove();return ok;
  }
}

renderPackages=function(){
  const el=$('geminiPackages');
  if(!plan?.gemini_packages){el.classList.add('empty');el.textContent='Aguardando aprovação da história e do plano visual.';return}
  el.classList.remove('empty');
  el.innerHTML=plan.gemini_packages.map(p=>{
    const ready=packageReady(p);
    const refNote=mode()==='full'?'A foto original do produto controla a embalagem. As duas imagens-chave aprovadas delimitam o início e o fim deste trecho.':mode()==='product_only'?'Use somente a foto original do produto como referência visual.':'Use a imagem institucional enviada como referência, se houver.';
    const products=selectedProducts.map((x,i)=>{const u=imageOf(x);return `<div class="package-product-ref">${u?`<img src="${esc(u)}" alt="${esc(x.name||'Produto')}">`:''}<div><strong>${esc(x.name||'Produto')}</strong><small>Referência original da embalagem</small><button type="button" data-pkg-product="${i}">Baixar foto original</button></div></div>`}).join('');
    const refSeconds=[p.start_second,p.end_second];
    const frameRefs=mode()==='full'?refSeconds.map(s=>frames.find(f=>+f.second_mark===+s)).filter((f,i,a)=>f?.status==='approved'&&f?.approved_image_url&&a.findIndex(x=>x?.second_mark===f.second_mark)===i).map(f=>`<div class="package-ref"><img src="${esc(f.approved_image_url)}" alt="Imagem-chave ${esc(f.image_index||'')}"><span>Imagem aprovada · ${f.second_mark}s</span><button type="button" data-pkg-frame="${f.second_mark}">Baixar imagem</button></div>`).join(''):'';
    return `<article class="gemini-package"><div class="package-head"><h3>${p.start_second}s → ${p.end_second}s · 10s</h3><span class="studio-badge">${ready?'Pronto':'Aguardando'}</span></div><p class="package-reference-note"><strong>Referências:</strong> ${esc(refNote)}</p>${products}${referenceUrl?`<div class="package-product-ref"><img src="${esc(referenceUrl)}" alt="Referência institucional"><div><strong>Imagem institucional</strong><small>Referência visual enviada</small><button type="button" data-pkg-reference>Baixar imagem</button></div></div>`:''}${frameRefs?`<div class="package-refs">${frameRefs}</div>`:''}${ready?`<div class="package-primary-actions"><button class="primary copy-prompt" data-i="${p.package_index}">Copiar prompt Gemini</button><button class="secondary toggle-prompt" data-i="${p.package_index}">Ver prompt completo</button></div><div class="prompt-box" data-prompt-box="${p.package_index}" hidden><pre>${esc(p.prompt)}</pre><button class="primary copy-prompt" data-i="${p.package_index}">Copiar este prompt</button></div>`:'<p class="muted">Aguardando as referências necessárias para este trecho.</p>'}</article>`;
  }).join('');
  el.querySelectorAll('[data-pkg-product]').forEach(b=>b.onclick=()=>{const x=selectedProducts[+b.dataset.pkgProduct];downloadAsset(imageOf(x),`produto-${x?.name||'original'}.webp`)});
  el.querySelectorAll('[data-pkg-reference]').forEach(b=>b.onclick=()=>downloadAsset(referenceUrl,referenceFile?.name||'referencia.png'));
  el.querySelectorAll('[data-pkg-frame]').forEach(b=>b.onclick=()=>{const f=frames.find(x=>+x.second_mark===+b.dataset.pkgFrame);downloadAsset(f?.approved_image_url,`imagem-${f?.image_index||'chave'}-${b.dataset.pkgFrame}s.webp`)});
  el.querySelectorAll('.copy-prompt').forEach(b=>b.onclick=async()=>{const p=plan.gemini_packages.find(x=>+x.package_index===+b.dataset.i),ok=await studioCopyText(p?.prompt||'');bToast(ok?'Prompt Gemini copiado.':'Não foi possível copiar automaticamente.')});
  el.querySelectorAll('.toggle-prompt').forEach(b=>b.onclick=()=>{const box=el.querySelector(`[data-prompt-box="${b.dataset.i}"]`);box.hidden=!box.hidden;b.textContent=box.hidden?'Ver prompt completo':'Ocultar prompt'});
};
