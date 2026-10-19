(()=>{
  window.DonaAntoniaAdminProductListView=Object.freeze({
    create({escapeHtml,formatQuantity,categoryLabel}){
      const esc=value=>escapeHtml(value==null?'':String(value));
      function linkedKits(product){return Array.isArray(product?.linked_kits)?product.linked_kits:[]}
      function expiryLabel(product){const date=product?.next_expiration_date||product?.expiration_date||null;return date?new Date(date+'T12:00:00').toLocaleDateString('pt-BR'):'Sem validade'}
      function kitLinks(product,compact=false){
        const kits=linkedKits(product);if(!kits.length)return '<span class="product-no-kits">Sem kits</span>';
        return '<details class="product-kit-menu '+(compact?'mobile-product-kit-count':'')+'"><summary>'+esc(kits.length)+' '+(kits.length===1?'cesta/kit':'cestas/kits')+'</summary><div class="product-kit-popover">'+kits.map(kit=>kit.basket_id?'<button type="button" class="product-kit-link" data-open-product-basket="'+esc(kit.basket_id)+'">'+esc(kit.name||'Cesta/Kit')+'</button>':'<span class="product-kit-link" aria-disabled="true">'+esc(kit.name||'Cesta/Kit')+'</span>').join('')+'</div></details>';
      }
      function mobileCard(p){
        const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),cost=(Number(p.cost_cents||0)/100).toFixed(2).replace('.',','),g=Number(p.gondola_number||0),identity=p.gtin||p.sku||'Sem EAN';
        const gondolas='<option value="">—</option>'+Array.from({length:30},(_,i)=>i+1).map(n=>'<option value="'+n+'" '+(g===n?'selected':'')+'>'+n+'</option>').join('');
        return '<article class="mobile-product-card" data-mobile-product-card="'+esc(p.id)+'">'+
          '<div class="mobile-product-card-head"><img class="mobile-product-thumb" src="'+esc(p.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy"><div><div class="mobile-product-card-name">'+esc(p.name)+'</div><span class="mobile-product-card-id">'+esc(identity)+'</span></div></div>'+
          '<label class="mobile-product-switch"><input type="checkbox" data-mobile-product-active="'+esc(p.id)+'" '+(p.active!==false?'checked':'')+'><span class="mobile-product-switch-track"><span class="mobile-product-switch-knob"></span></span><b data-mobile-product-active-label="'+esc(p.id)+'">'+(p.active!==false?'ATIVO':'INATIVO')+'</b></label>'+
          '<div class="mobile-product-quick-grid">'+
            '<label class="mobile-product-field"><span>Venda</span><input data-mobile-product-field="price" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(price)+'"></label>'+
            '<label class="mobile-product-field"><span>Custo</span><input data-mobile-product-field="cost" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(cost)+'"></label>'+
            '<label class="mobile-product-field"><span>Estoque</span><input data-mobile-product-field="stock" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(formatQuantity(p.stock_quantity||0))+'"></label>'+
            '<label class="mobile-product-field"><span>Gôndola</span><select data-mobile-product-field="gondola" data-product-id="'+esc(p.id)+'">'+gondolas+'</select></label>'+
            '<label class="mobile-product-field full"><span>Validade</span><input data-mobile-product-field="expiration" data-product-id="'+esc(p.id)+'" type="date" value="'+esc(p.expiration_date||'')+'"></label>'+
          '</div>'+kitLinks(p,true)+'<div class="mobile-product-card-foot"><span class="mobile-product-save-status saved" data-mobile-product-status="'+esc(p.id)+'">✓ Salvo</span><button class="mobile-product-detail mobile-product-zero-btn" type="button" data-zero-product-stock="'+esc(p.id)+'">Zerar estoque</button><button class="mobile-product-detail" type="button" data-edit-product="'+esc(p.id)+'">Detalhes</button></div></article>';
      }
      function row(p){
        const classification=[categoryLabel(p.category),p.detailed_subcategory||p.subcategory].filter(Boolean).join(' › ');
        const identity=[p.sku,p.gtin,p.packaging].filter(Boolean).join(' · ');
        const expiredInactive=p.active===false&&p.deactivation_reason==='expired';
        const statusTitle=p.active?'Clique para desativar':expiredInactive?'Vencido: corrija a validade antes de ativar':'Clique para ativar';
        const desktopStatus=p.active?'Ativo':expiredInactive?'Vencido · inativo':'Inativo';
        const price=(Number(p.sale_price_cents||0)/100).toFixed(2).replace('.',','),cost=(Number(p.cost_cents||0)/100).toFixed(2).replace('.',',');
        const expiry=p.next_expiration_date||p.expiration_date||'';
        const validity=p.lot_tracking_complete
          ?'<div class="product-validity-summary"><span>Próxima validade</span><strong>'+esc(expiryLabel(p))+'</strong><small>'+esc(p.active_lot_count||0)+' lotes · editar em Lotes</small></div>'
          :'<label class="product-inline-field"><span>Validade</span><input data-mobile-product-field="expiration" data-product-id="'+esc(p.id)+'" type="date" value="'+esc(expiry)+'"></label>';
        return '<div class="list-row products-layout product-operational-row">'+
          '<img class="thumb" src="'+esc(p.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy">'+
          '<div class="product-main"><span class="row-title">'+esc(p.name)+'</span><span class="sub">'+esc(classification)+'</span>'+(identity?'<span class="sub">'+esc(identity)+'</span>':'')+'<span class="sub"><span class="pill '+(p.lot_tracking_complete?'':'warn')+'">'+(p.lot_tracking_complete?'Lotes controlados':'Validade simples')+'</span></span></div>'+
          '<div class="product-quick-fields"><label class="product-inline-field"><span>Venda</span><input data-mobile-product-field="price" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(price)+'"></label><label class="product-inline-field"><span>Custo</span><input data-mobile-product-field="cost" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(cost)+'"></label><span class="mobile-product-save-status saved product-save-inline" data-mobile-product-status="'+esc(p.id)+'">✓ Salvo</span></div>'+
          '<div class="product-stock-validity"><label class="product-inline-field"><span>Estoque total</span><input data-mobile-product-field="stock" data-product-id="'+esc(p.id)+'" inputmode="decimal" value="'+esc(formatQuantity(p.stock_quantity||0))+'"></label>'+validity+'<span class="product-stock-breakdown-inline">'+esc(formatQuantity(p.loose_stock_quantity??p.stock_quantity??0))+' avulso · '+esc(formatQuantity(p.basket_locked_quantity||0))+' em cestas/kits</span></div>'+
          '<div class="product-operational-status"><button class="pill product-active-toggle '+(p.active?'':'off')+'" type="button" data-product-active="'+esc(p.id)+'" title="'+esc(statusTitle)+'">'+esc(desktopStatus)+'</button>'+kitLinks(p)+'</div>'+
          '<div class="product-row-actions"><button class="product-action-btn product-zero-stock-btn" type="button" data-zero-product-stock="'+esc(p.id)+'">Zerar estoque</button><button class="product-action-btn" data-product-lots="'+esc(p.id)+'">Lotes</button><button class="product-action-btn" data-duplicate-product="'+esc(p.id)+'">Duplicar</button><button class="product-action-btn primary-action" data-edit-product="'+esc(p.id)+'">Editar completo</button></div></div>';
      }
      return Object.freeze({mobileCard,row,linkedKits,expiryLabel,kitLinks});
    }
  });
})();
