from pathlib import Path

path = Path('vitrine/admin/index.html')
s = path.read_text(encoding='utf-8')

old_payment = '''  function paymentOptions(current){
    const standard=['PIX','Dinheiro','Cartão de crédito','Cartão alimentação/refeição'];
    const values=current&&!standard.includes(current)?[current,...standard]:standard;
    return values.map(v=>'<option value="'+esc(v)+'" '+(v===current?'selected':'')+'>'+esc(v)+'</option>').join('');
  }'''
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
if old_payment not in s:
    raise SystemExit('paymentOptions marker not found')
s=s.replace(old_payment,new_payment,1)

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
