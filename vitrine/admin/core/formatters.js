// Funções de apresentação extraídas sem alterar regras ou formatos.
// Carregar antes do script principal do Admin.
(function(global){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>(Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const cents=v=>Math.round(Number(v||0)*100);
  const fmtQty=n=>Number.isInteger(Number(n))?String(Number(n)):String(Number(n).toFixed(3)).replace(/\.?0+$/,'');
  const dateTime=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
  const dateOnly=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:(v||'—')};
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  global.DonaAntoniaAdminFormatters=Object.freeze({esc,money,cents,fmtQty,dateTime,dateOnly,normalize});
})(window);
