from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text()
old="  const money=c=>(Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});\n  const fmtQty="
new="  const money=c=>(Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});\n  const cents=v=>Math.round(Number(v||0)*100);\n  const fmtQty="
if old not in s:
    raise SystemExit('money helper anchor not found')
s=s.replace(old,new,1)
p.write_text(s)
