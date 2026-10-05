from pathlib import Path

p=Path('vitrine/admin/basket-guided-builder.js')
s=p.read_text(encoding='utf-8')

old="function bridge(){return window.DonaAntoniaGuidedBridge||{}}"
new="function bridge(){return window.DonaAntoniaAdminBridge||{}}"
if s.count(old)!=1: raise SystemExit(f'bridge match={s.count(old)}')
s=s.replace(old,new,1)

anchor="  async function open(basketId,options={}){"
idx=s.find(anchor)
if idx<0: raise SystemExit('open anchor missing')
helper="""  function applyDuplicateSeed(){
    const source=state?.duplicateLot;if(!source)return;
    const items=Array.isArray(source.items)?source.items:[];
    state.lotQuantity=Math.max(1,Number(source.quantity_built||1));
    items.forEach((item,itemIndex)=>{
      let i=state.positions.findIndex(p=>String(p.id||'')===String(item.kit_template_item_id||item.source_template_item_id||''));
      if(i<0&&Number.isInteger(Number(item.position_order)))i=Number(item.position_order);
      if(i<0)i=state.positions.findIndex(p=>String(p.product_id||'')===String(item.product_id||''));
      if(i<0||!state.positions[i])return;
      const pos=state.positions[i],prod=item.product||{};
      pos.product_id=item.product_id||prod.id||pos.product_id;
      pos.product_name=prod.name||pos.product_name;
      pos.quantity=Number(item.quantity_per_kit??item.quantity_per_basket??item.quantity??pos.quantity??1);
      pos.selectedProduct={id:pos.product_id,name:pos.product_name||prod.name||'',image_url:prod.image_url||'',packaging:prod.packaging||'',sku:prod.sku||'',gtin:prod.gtin||'',sale_price:Number(prod.price||0),cost_price:prod.cost==null?null:Number(prod.cost),effective_sellable_stock:null,basket_locked_quantity:null,loose_stock:null,is_active:prod.is_active!==false,template_product_id:pos.product_id};
      pos.catalog=null;pos.next_offset=null;
    });
    state.preview=null;
  }

"""
s=s[:idx]+helper+s[idx:]

old_open="  async function open(basketId,options={}){if(!basketId){toast('Cesta/Kit inválida.');return}ensureShell();state={basketId:String(basketId),mode:options.mode||'model',commercial:options.commercial||null,model:null,positions:[],lotQuantity:1,preview:null,lot:options.lot||null};const d=ensureShell();d.querySelector('#bgBody').innerHTML='<div style=\"padding:28px;text-align:center;color:#66716a\">Carregando editor guiado…</div>';if(!d.open)d.showModal();try{await loadModel();render()}catch(e){d.querySelector('#bgBody').innerHTML='<div class=\"bg-section\"><h3>Não foi possível abrir o editor</h3><p>'+esc(e.data?.message||e.message||'Falha ao carregar')+'</p></div>'}}"
new_open="  async function open(basketId,options={}){if(!basketId){toast('Cesta/Kit inválida.');return}ensureShell();state={basketId:String(basketId),mode:options.mode||'model',commercial:options.commercial||null,model:null,positions:[],lotQuantity:1,preview:null,lot:options.lot||null,duplicateLot:options.duplicateLot||null};const d=ensureShell();d.querySelector('#bgBody').innerHTML='<div style=\"padding:28px;text-align:center;color:#66716a\">Carregando editor guiado…</div>';if(!d.open)d.showModal();try{await loadModel();applyDuplicateSeed();render()}catch(e){d.querySelector('#bgBody').innerHTML='<div class=\"bg-section\"><h3>Não foi possível abrir o editor</h3><p>'+esc(e.data?.message||e.message||'Falha ao carregar')+'</p></div>'}}"
if s.count(old_open)!=1: raise SystemExit(f'open match={s.count(old_open)}')
s=s.replace(old_open,new_open,1)

old_lot="  function lotOpsHtml(){const l=state.lot;if(!l)return '';const assembly=l.assembly_status||'assembling',label=STATUS_LABELS[assembly]||STATUS_LABELS[l.status]||assembly;let actions='';if(assembly==='assembling')actions='<button type=\"button\" data-bg-edit-lot>Editar lote</button><button class=\"primary\" type=\"button\" data-bg-mount>Marcar como montado</button><button class=\"danger\" type=\"button\" data-bg-cancel>Cancelar lote</button>';else if(assembly==='mounted')actions='<button type=\"button\" data-bg-reopen>Reabrir para editar</button><button class=\"danger\" type=\"button\" data-bg-cancel>Cancelar lote</button>';return '<div class=\"bg-section\"><h3>Lote '+esc(l.short_code||l.lot_code||'')+'</h3><p><span class=\"bg-status '+(assembly==='cancelled'?'cancelled':'')+'\">'+esc(label)+'</span> · venda permanece desligada até uma ação separada.</p><div class=\"bg-actions\">'+actions+'<button type=\"button\" disabled>Ativar venda</button></div><div class=\"bg-legacy-note\">Duplicar lote · Imprimir lote · Ver composição continuam disponíveis na operação padrão do card.</div></div>'}"
new_lot="  function lotOpsHtml(){const l=state.lot;if(!l)return '';const assembly=l.assembly_status||'assembling',label=STATUS_LABELS[assembly]||STATUS_LABELS[l.status]||assembly;let actions='';if(assembly==='assembling')actions='<button type=\"button\" data-bg-edit-lot>Editar lote</button><button class=\"primary\" type=\"button\" data-bg-mount>Marcar como montado</button><button class=\"danger\" type=\"button\" data-bg-cancel>Cancelar lote</button>';else if(assembly==='mounted')actions='<button type=\"button\" data-bg-reopen>Reabrir para editar</button><button class=\"danger\" type=\"button\" data-bg-cancel>Cancelar lote</button><button class=\"primary\" type=\"button\" data-bg-sale-on>Ativar venda</button>';return '<div class=\"bg-section\"><h3>Lote '+esc(l.short_code||l.lot_code||'')+'</h3><p><span class=\"bg-status '+(assembly==='cancelled'?'cancelled':'')+'\">'+esc(label)+'</span> · montagem e venda são estados separados.</p><div class=\"bg-actions\">'+actions+'</div></div>'}"
if s.count(old_lot)!=1: raise SystemExit(f'lotOps match={s.count(old_lot)}')
s=s.replace(old_lot,new_lot,1)

old_bind="d.querySelector('[data-bg-reopen]')?.addEventListener('click',reopenLot);d.querySelector('[data-bg-edit-lot]')?.addEventListener('click',()=>d.querySelector('.bg-positions')?.scrollIntoView({behavior:'smooth',block:'start'}));"
new_bind="d.querySelector('[data-bg-reopen]')?.addEventListener('click',reopenLot);d.querySelector('[data-bg-sale-on]')?.addEventListener('click',async()=>{const id=state.lot?.lot_id||state.lot?.id;if(id&&window.DonaAntoniaBasketAdmin?.setSale){const ok=await window.DonaAntoniaBasketAdmin.setSale(id,true);if(ok){state.lot={...state.lot,sale_enabled:true};render()}}});d.querySelector('[data-bg-edit-lot]')?.addEventListener('click',()=>d.querySelector('.bg-positions')?.scrollIntoView({behavior:'smooth',block:'start'}));"
if s.count(old_bind)!=1: raise SystemExit(f'bind match={s.count(old_bind)}')
s=s.replace(old_bind,new_bind,1)

p.write_text(s,encoding='utf-8')
print('guided builder v2 patch applied')
