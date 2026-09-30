from pathlib import Path

path=Path('orcamento/app-original.html')
s=path.read_text(encoding='utf-8')

old="""    async function fetchAdminProducts(){const rows=[];let offset=0;for(let page=0;page<100;page++){const data=await adminGet('products',{limit:100,offset,active:'true'});const part=Array.isArray(data.products)?data.products:[];rows.push(...part);if(data.next_offset===null||data.next_offset===undefined||!part.length)break;const next=Number(data.next_offset);if(!Number.isFinite(next)||next<=offset)break;offset=next}return rows}
    async function loadCatalog(){$('reloadCatalog').disabled=true;setCatalogStatus('Conectando ao catálogo do Supabase...');try{const rows=adminToken()?await fetchAdminProducts():await fetchCanonicalProducts();state.products=normalizeProducts(rows);state.source=adminToken()?'Supabase/Admin':'Supabase/Vitrine';setCatalogStatus(`Catálogo atualizado pelo ${state.source}: ${state.products.length} produtos ativos.`,'ok')}catch{try{state.products=normalizeProducts(await fetchCanonicalProducts());state.source='Supabase/Vitrine';setCatalogStatus(`Catálogo público carregado como contingência: ${state.products.length} produtos disponíveis.`,'ok')}catch{state.products=[];state.source='';setCatalogStatus('Não foi possível carregar o catálogo do Supabase. Verifique a conexão e tente novamente.','error')}}finally{$('reloadCatalog').disabled=false;$('catalogCount').textContent=state.products.length?`${state.products.length} produtos`:'Catálogo indisponível';renderSearchResults()}}
"""
new="""    let productSearchTimer=null,productSearchSeq=0;
    async function fetchAdminProducts(q){const query=String(q||'').trim();if(query.length<2)return[];const data=await adminGet('products',{limit:40,offset:0,active:'true',q:query});return Array.isArray(data.products)?data.products:[]}
    async function loadCatalog(){$('reloadCatalog').disabled=true;try{const token=adminToken()||await ensureAdminToken().catch(()=>'');if(token){state.products=[];state.source='Supabase/Admin';setCatalogStatus('Catálogo conectado ao Supabase. Digite pelo menos 2 caracteres para buscar produtos.','ok');$('catalogCount').textContent='Busca sob demanda';renderSearchResults();return}setCatalogStatus('Conectando ao catálogo público do Supabase...');state.products=normalizeProducts(await fetchCanonicalProducts());state.source='Supabase/Vitrine';setCatalogStatus(`Catálogo público carregado como contingência: ${state.products.length} produtos disponíveis.`,'ok');$('catalogCount').textContent=`${state.products.length} produtos`;renderSearchResults()}catch{state.products=[];state.source='';setCatalogStatus('Não foi possível conectar ao catálogo do Supabase. Tente novamente.','error');$('catalogCount').textContent='Catálogo indisponível';renderSearchResults()}finally{$('reloadCatalog').disabled=false}}
    async function searchProductsOnDemand(){const raw=$('productSearch').value.trim(),box=$('searchResults');if(raw.length<2){productSearchSeq++;state.products=[];renderSearchResults();return}if(!adminToken()){renderSearchResults();return}const seq=++productSearchSeq;box.innerHTML='<div class=\"empty\">Buscando produtos…</div>';try{const rows=await fetchAdminProducts(raw);if(seq!==productSearchSeq)return;state.products=normalizeProducts(rows);state.source='Supabase/Admin';setCatalogStatus(`Busca no Supabase/Admin: ${state.products.length} resultado(s).`,'ok');$('catalogCount').textContent=`${state.products.length} resultado(s)`;renderSearchResults()}catch{if(seq!==productSearchSeq)return;state.products=[];setCatalogStatus('Não foi possível buscar produtos agora. Tente novamente.','error');$('catalogCount').textContent='Busca indisponível';renderSearchResults()}}
    function scheduleProductSearch(){clearTimeout(productSearchTimer);const raw=$('productSearch').value.trim();if(raw.length<2){productSearchSeq++;state.products=[];renderSearchResults();return}productSearchTimer=setTimeout(searchProductsOnDemand,180)}
"""
if old not in s:
    raise SystemExit('catalog block anchor not found')
s=s.replace(old,new,1)

old_event="$('productSearch').addEventListener('input',renderSearchResults);$('reloadCatalog').addEventListener('click',loadCatalog);"
new_event="$('productSearch').addEventListener('input',scheduleProductSearch);$('reloadCatalog').addEventListener('click',async()=>{await loadCatalog();if($('productSearch').value.trim().length>=2)await searchProductsOnDemand()});"
if old_event not in s:
    raise SystemExit('product search event anchor not found')
s=s.replace(old_event,new_event,1)

path.write_text(s,encoding='utf-8')
print('patched orcamento lazy product search')
