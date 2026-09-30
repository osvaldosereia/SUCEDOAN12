from pathlib import Path
import re
p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
# operador fixo, sem prompt
s=re.sub(r"function currentOperator\(\)\{[^}]*\}","function currentOperator(){return 'Operação'}",s,count=1)
a=s.find('  function changeOperator(){')
b=s.find('  function requireOperator(){',a)
if a<0 or b<0: raise SystemExit('operator markers missing')
s=s[:a]+"  function changeOperator(){return 'Operação'}\n"+s[b:]
a=s.find('  function requireOperator(){')
b=s.find("  if($('#operatorBadge'))",a)
if a<0 or b<0: raise SystemExit('requireOperator markers missing')
s=s[:a]+"  function requireOperator(){return 'Operação'}\n"+s[b:]
# esconder badge e estabilizar cards mobile
anchor='    .mobile-product-card{display:none}'
css="""    .operator-badge{display:none!important}\n"""
if css.strip() not in s:s=s.replace(anchor,css+anchor,1)
s=s.replace(".mobile-product-card{display:block;min-width:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px;box-shadow:0 1px 2px rgba(0,0,0,.03)}", ".mobile-product-card{display:block;min-width:0;height:372px;overflow:hidden;overflow-anchor:none;background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px;box-shadow:0 1px 2px rgba(0,0,0,.03)}",1)
s=s.replace("#productRows.mobile-product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px;background:var(--soft)}", "#productRows.mobile-product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px;background:var(--soft);align-items:start;overflow-anchor:none}",1)
s=s.replace(".mobile-product-card-head{display:grid;grid-template-columns:44px minmax(0,1fr);gap:7px;align-items:start}", ".mobile-product-card-head{display:grid;grid-template-columns:1fr;gap:6px;align-items:start}",1)
s=s.replace(".mobile-product-card .mobile-product-thumb{width:44px;height:44px;border:1px solid var(--line);border-radius:8px;object-fit:contain;background:#fff}", ".mobile-product-card .mobile-product-thumb{width:100%;height:132px;border:1px solid var(--line);border-radius:10px;object-fit:contain;background:#fff}",1)
s=s.replace(".mobile-product-card-foot{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:6px;min-height:26px}", ".mobile-product-card-foot{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:6px;height:32px;min-height:32px;overflow:hidden}",1)
s=s.replace(".mobile-product-save-status{font-size:9px;color:var(--muted);font-weight:750;line-height:1.1}", ".mobile-product-save-status{font-size:9px;color:var(--muted);font-weight:750;line-height:1.1;min-height:20px;display:flex;align-items:center}",1)
p.write_text(s,encoding='utf-8')
print('patched')
