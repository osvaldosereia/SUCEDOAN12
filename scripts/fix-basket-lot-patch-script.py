from pathlib import Path
p=Path('scripts/patch-basket-lot-ops-rules.py')
s=p.read_text()
old='''admin=between(admin,"  function lotCompositionCards(items,qtyField='quantity_per_kit'){
","  function paintBasketKitAdmin(){
",lot_functions,'lot card/composition')'''
new='''admin=between(admin,"  function lotCompositionCards(items,qtyField='quantity_per_kit'){\\n","  function paintBasketKitAdmin(){\\n",lot_functions,'lot card/composition')'''
if old not in s:
    raise SystemExit('broken lot marker not found')
s=s.replace(old,new,1)
p.write_text(s)
print('patch helper syntax repaired')
