from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text()
old="host.querySelectorAll('[data-commercial-print]').forEach(b=>b.onclick=async()=>{const m=find(b.dataset.commercialPrint);if(!m?.editor_kit_template_id||!m?.operational_lot_id)return;try{const data=await api('basket_kit_admin',{id:m.editor_kit_template_id});state.basketKitDetail=data;printBasketKitLot(m.operational_lot_id)}catch(e){toast('Não consegui preparar a impressão deste lote.')}});"
new="host.querySelectorAll('[data-commercial-print]').forEach(b=>b.onclick=async()=>{const m=find(b.dataset.commercialPrint);if(!m?.operational_lot_id)return;try{if(m.source_kind==='basket'){const data=await api('basket_admin',{id:m.commercial_id});const lot=(data.lots||[]).find(x=>String(x.id)===String(m.operational_lot_id));if(!lot)throw new Error('lot_not_found');const previous=state.basketKitDetail;state.basketKitDetail={lots:[lot]};printBasketKitLot(m.operational_lot_id);state.basketKitDetail=previous}else{if(!m.editor_kit_template_id)return;const data=await api('basket_kit_admin',{id:m.editor_kit_template_id});state.basketKitDetail=data;printBasketKitLot(m.operational_lot_id)}}catch(e){toast('Não consegui preparar a impressão deste lote.')}});"
if s.count(old)!=1:
    raise SystemExit(f'commercial print handler: expected 1 occurrence, got {s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s)
print('commercial print legacy-safe patch applied')
