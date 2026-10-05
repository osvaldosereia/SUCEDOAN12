from pathlib import Path
p=Path('vitrine/admin/basket-guided-builder.js')
s=p.read_text(encoding='utf-8')
old="d.querySelector('#bgLotLinkedType')?.addEventListener('change',e=>{state.lotLinkedType=String(e.target.value||'');const linked=currentLinkedLot();if(linked&&String(linked.business_type||'')!==state.lotLinkedType)state.lotLinkedLotId=null;if(!state.lotLinkedType)state.lotLinkedLotId=null;state.preview=null;render()});d.querySelector('#bgLotLinkedLot')?.addEventListener('change',e=>{state.lotLinkedLotId=String(e.target.value||'')||null;const linked=currentLinkedLot();if(linked?.business_type)state.lotLinkedType=String(linked.business_type);state.preview=null;render()});"
new="d.querySelector('#bgLotLinkedType')?.addEventListener('change',e=>{syncLotForm();state.lotLinkedType=String(e.target.value||'');const linked=currentLinkedLot();if(linked&&String(linked.business_type||'')!==state.lotLinkedType)state.lotLinkedLotId=null;if(!state.lotLinkedType)state.lotLinkedLotId=null;state.preview=null;render()});d.querySelector('#bgLotLinkedLot')?.addEventListener('change',e=>{syncLotForm();state.lotLinkedLotId=String(e.target.value||'')||null;const linked=currentLinkedLot();if(linked?.business_type)state.lotLinkedType=String(linked.business_type);state.preview=null;render()});"
if s.count(old)!=1: raise SystemExit(f'linked listeners match={s.count(old)}')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('basket lot rerender state fix applied')
