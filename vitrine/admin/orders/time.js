// Calendário operacional America/Cuiaba e idade relativa, contratos preservados.
(function(global){
  function cuiabaDayKey(v){
    const d=v instanceof Date?v:new Date(v||Date.now());
    if(!Number.isFinite(d.getTime()))return '';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return map.year+'-'+map.month+'-'+map.day;
  }
  function deliveredToday(o){
    return o?.status==='delivered'&&Boolean(o?.delivered_at)&&cuiabaDayKey(o.delivered_at)===cuiabaDayKey(new Date());
  }
  function relativeAge(v){
    if(!v)return '';
    const ms=Date.now()-new Date(v).getTime();
    if(!Number.isFinite(ms)||ms<0)return '';
    const min=Math.floor(ms/60000);
    if(min<1)return 'agora';
    if(min<60)return 'há '+min+' min';
    const hours=Math.floor(min/60);
    if(hours<24)return 'há '+hours+' h';
    return 'há '+Math.floor(hours/24)+' d';
  }
  global.DonaAntoniaAdminOrderTime=Object.freeze({cuiabaDayKey,deliveredToday,relativeAge});
})(window);
