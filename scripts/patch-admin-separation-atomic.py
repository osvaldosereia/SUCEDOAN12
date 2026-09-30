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

old1 = '''      const consumed=await api('order_consume_stock',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,operator:currentOperator()||'Operação'})});
      await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,status:'processing',operator:currentOperator()||'Operação'})});
      printSeparationOnly(detail,w);
      toast(consumed.already_consumed?'Separação retomada · estoque já estava atualizado':'Separação iniciada · estoque atualizado');'''
new1 = '''      await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,status:'processing',operator:currentOperator()||'Operação'})});
      printSeparationOnly(detail,w);
      toast('Separação iniciada · estoque e status atualizados juntos');'''
if old1 not in s:
    raise SystemExit('main separation consume marker not found')
s=s.replace(old1,new1,1)

old2 = '''      const consumed=await api('order_consume_stock',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Operação'})});
      await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:'processing',operator:currentOperator()||'Operação'})});
      printSeparationOnly(detail,w);
      toast(consumed.already_consumed?'Separação retomada':'Separação iniciada');'''
new2 = '''      await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:'processing',operator:currentOperator()||'Operação'})});
      printSeparationOnly(detail,w);
      toast('Separação iniciada');'''
if old2 not in s:
    raise SystemExit('tablet separation consume marker not found')
s=s.replace(old2,new2,1)

path.write_text(s,encoding='utf-8')
print('admin atomic separation and canonical payment applied')
