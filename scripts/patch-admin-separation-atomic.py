from pathlib import Path
import re

path = Path('vitrine/admin/index.html')
s = path.read_text(encoding='utf-8')

new_payment = '''  function canonicalOrderPayment(value){
    const raw=String(value||'').trim(),key=normalize(raw);
    const map={pix:'pix',dinheiro:'cash',cash:'cash','cartao de credito':'credit_card',credit:'credit_card',credit_card:'credit_card','cartao alimentacao':'food_card','cartao alimentacao/refeicao':'food_card',food_card:'food_card','cartao refeicao':'meal_card',meal_card:'meal_card'};
    return map[key]||map[raw]||'';
  }
  function paymentOptions(current){
    const selected=canonicalOrderPayment(current);
    const standard=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição']];
    return standard.map(([value,label])=>'<option value="'+value+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>').join('');
  }'''
s,n = re.subn(r"  function paymentOptions\(current\)\{\n.*?\n  \}", new_payment, s, count=1, flags=re.S)
if n != 1:
    raise SystemExit(f'paymentOptions marker count={n}')

lines=s.splitlines()
out=[]
removed=0
toasts=0
for line in lines:
    if "const consumed=await api('order_consume_stock'" in line:
        removed += 1
        continue
    if "toast(consumed.already_consumed?" in line:
        indent=line[:len(line)-len(line.lstrip())]
        if 'estoque já estava atualizado' in line:
            out.append(indent+"toast('Separação iniciada · estoque e status atualizados juntos');")
        else:
            out.append(indent+"toast('Separação iniciada');")
        toasts += 1
        continue
    out.append(line)
if removed != 2:
    raise SystemExit(f'expected 2 explicit consume calls, found {removed}')
if toasts != 2:
    raise SystemExit(f'expected 2 consumed toasts, found {toasts}')
s='\n'.join(out)+'\n'

path.write_text(s,encoding='utf-8')
print('admin atomic separation and canonical payment applied')
