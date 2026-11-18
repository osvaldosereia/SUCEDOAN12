(() => {
  "use strict";
  const config=window.DONA_SITE_CONFIG||{}, supabase=String(config.supabaseUrl||"").replace(/\/$/,""), publishableKey=config.publishableKey||"";
  const $=(id)=>document.getElementById(id);
  const esc=(value)=>String(value==null?"":value).replace(/[&<>"']/g,(ch)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  let categories=[],loading=false,saving=false;
  async function adminRequest(action,values){
    if(!supabase||!publishableKey)throw new Error("A configuração do Admin está incompleta.");
    const response=await fetch(supabase+"/functions/v1/site-admin-v1",{method:"POST",headers:{apikey:publishableKey,"x-admin-code":window.DonaAdminAuth?.getCode?.()||"","Content-Type":"application/json"},body:JSON.stringify(Object.assign({action},values||{})),cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false){
      const messages={admin_code_invalid:"O acesso ao Admin expirou. Entre novamente.",builder_categories_invalid:"A lista de categorias mudou. Atualize e tente novamente.",builder_categories_stale:"A lista mudou em outro acesso. Atualize e tente novamente.",builder_category_label_required:"Informe um nome com pelo menos 2 caracteres."};
      throw new Error(messages[data.error]||data.message||"Não foi possível salvar as categorias.");
    }
    return data;
  }
  function setStatus(message,error){const node=$("builder-categories-status");if(!node)return;node.textContent=message||"";node.classList.toggle("error",!!error);node.classList.toggle("success",!!message&&!error);}
  function collectFromDom(){
    const host=$("builder-category-list");
    return Array.from(host?.querySelectorAll("[data-builder-category-id]")||[]).map(card=>({
      id:card.dataset.builderCategoryId,
      category_key:categories.find(item=>String(item.id)===card.dataset.builderCategoryId)?.category_key,
      label:card.querySelector("[data-category-label]")?.value.trim()||"",
      is_active:card.querySelector("[data-category-active]")?.checked===true
    }));
  }
  function render(){
    const host=$("builder-category-list");if(!host)return;
    if(!categories.length){host.innerHTML='<p class="builder-categories-empty">Nenhuma categoria cadastrada.</p>';return;}
    host.innerHTML=categories.map((item,index)=>
      '<article class="builder-category-card'+(item.is_active?"":" is-inactive")+'" data-builder-category-id="'+esc(item.id)+'">'+
      '<div class="builder-category-order" aria-label="Posição '+(index+1)+' de '+categories.length+'"><button class="builder-category-move" type="button" data-move="up" aria-label="Mover '+esc(item.label)+' para cima"'+(index===0?" disabled":"")+'>↑</button><span>'+(index+1)+'</span>'+
      '<button class="builder-category-move" type="button" data-move="down" aria-label="Mover '+esc(item.label)+' para baixo"'+(index===categories.length-1?" disabled":"")+'>↓</button></div>'+
      '<div class="builder-category-main"><label>Nome exibido no site<input type="text" maxlength="80" value="'+esc(item.label)+'" data-category-label></label><small>Identificador do catálogo: '+esc(item.category_key)+'</small></div>'+
      '<label class="builder-category-active"><input type="checkbox" data-category-active'+(item.is_active?" checked":"")+'>Exibir no Monte sua Cesta</label></article>'
    ).join("");
  }
  function moveCategory(id,direction){
    const values=collectFromDom(),byId=new Map(categories.map(item=>[String(item.id),item]));
    categories=values.map(value=>Object.assign(byId.get(value.id),value));
    const from=categories.findIndex(item=>String(item.id)===String(id)),to=from+(direction==="up"?-1:1);
    if(from<0||to<0||to>=categories.length)return;
    const next=categories.slice(),[moving]=next.splice(from,1);next.splice(to,0,moving);categories=next;render();setStatus("Ordem alterada. Salve para aplicar no site.",false);
  }
  async function load(){
    if(loading||saving)return;const host=$("builder-category-list");if(!host)return;
    loading=true;setStatus("",false);host.innerHTML='<p class="admin-muted">Carregando categorias…</p>';
    try{const data=await adminRequest("builder_categories_admin_list");categories=Array.isArray(data.categories)?data.categories:[];render();}
    catch(error){host.innerHTML='<p class="form-message error">'+esc(error instanceof Error?error.message:"Não foi possível carregar as categorias.")+'</p>';setStatus(error instanceof Error?error.message:"Não foi possível carregar as categorias.",true);}
    finally{loading=false;}
  }
  async function save(){
    if(saving||loading)return;const button=$("save-builder-categories");if(!button)return;
    saving=true;button.disabled=true;button.textContent="Salvando…";setStatus("Salvando as categorias…",false);
    try{const data=await adminRequest("builder_categories_admin_save",{categories:collectFromDom()});categories=Array.isArray(data.categories)?data.categories:[];render();setStatus("Categorias atualizadas.",false);}
    catch(error){setStatus(error instanceof Error?error.message:"Não foi possível salvar as categorias.",true);}
    finally{saving=false;button.disabled=false;button.textContent="Salvar alterações";}
  }
  document.addEventListener("click",event=>{const button=event.target instanceof Element?event.target.closest("#builder-category-list [data-move]"):null;const card=button?.closest("[data-builder-category-id]");if(card)moveCategory(card.dataset.builderCategoryId,button.dataset.move);});
  $("save-builder-categories")?.addEventListener("click",save);
  window.DonaBuilderCategoriesAdmin={load};
})();
