// Shared payment method normalization and option rendering for Admin order flows.
((root)=>{
  const fullOptions=[
    ['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],
    ['food_card','Cartão alimentação'],['meal_card','Cartão refeição'],['other','Outro']
  ];
  const orderOptions=fullOptions.filter(([value])=>value!=='other');
  function create(normalize){
    const normalizeText=typeof normalize==='function'?normalize:value=>String(value||'').toLowerCase();
    function deliveryMethodV3(value){
      const text=normalizeText(value||'');
      if(text.includes('pix'))return 'pix';
      if(text.includes('dinheiro')||text==='cash')return 'cash';
      if(text.includes('credito')||text.includes('crédito')||text.includes('credit'))return 'credit_card';
      if(text.includes('refeicao')||text.includes('refeição')||text.includes('meal'))return 'meal_card';
      if(text.includes('alimentacao')||text.includes('alimentação')||text.includes('food'))return 'food_card';
      return 'other';
    }
    function renderOptions(rows,current){
      return rows.map(([value,label])=>'<option value="'+value+'" '+(value===current?'selected':'')+'>'+label+'</option>').join('');
    }
    function deliveryMethodOptionsV3(current){return renderOptions(fullOptions,current)}
    function orderV3PaymentOptions(current){return renderOptions(orderOptions,deliveryMethodV3(current))}
    return Object.freeze({deliveryMethodV3,deliveryMethodOptionsV3,orderV3PaymentOptions});
  }
  root.DonaAntoniaAdminOrderPaymentMethod=Object.freeze({create});
})(window);
