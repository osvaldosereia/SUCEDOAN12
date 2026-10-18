// Links diretos de WhatsApp; comportamento e normalização originais.
(function(global){
  function whatsappHref(value){
    let d=String(value||'').replace(/\D/g,'');
    if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;
    return d.length>=12?'https://wa.me/'+d:'';
  }
  function whatsappMessageHref(value,message){
    const base=whatsappHref(value);
    return base?base+'?text='+encodeURIComponent(String(message||'')):'';
  }
  global.DonaAntoniaAdminWhatsappLinks=Object.freeze({whatsappHref,whatsappMessageHref});
})(window);
