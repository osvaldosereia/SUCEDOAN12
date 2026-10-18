// Formatação de identificadores e dados de contato; contratos preservados.
(function(global){
  function orderDisplayCode(o){const code=String(o?.public_code||o?.public_order_code||'').trim().toUpperCase();return /^[A-Z]{2}\d{3}$/.test(code)?code:'—'}
  function phoneDigits(v){
    let d=String(v||'').replace(/\D/g,'');
    if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;
    return d;
  }
  function formatPhone(v){
    const d=String(v||'').replace(/\D/g,'');
    const local=d.startsWith('55')?d.slice(2):d;
    if(local.length===11)return '('+local.slice(0,2)+') '+local.slice(2,7)+'-'+local.slice(7);
    if(local.length===10)return '('+local.slice(0,2)+') '+local.slice(2,6)+'-'+local.slice(6);
    return v||'';
  }
  function formatCpf(v){const d=String(v||'').replace(/\D/g,'');return d.length===11?d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9):v||''}
  global.DonaAntoniaAdminIdentifiers=Object.freeze({orderDisplayCode,phoneDigits,formatPhone,formatCpf});
})(window);
