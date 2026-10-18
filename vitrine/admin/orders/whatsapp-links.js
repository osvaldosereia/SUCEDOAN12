// Links diretos de WhatsApp; comportamento e normalização originais.
(function(global){
  function whatsappHref(value){
    const d=global.DonaAntoniaAdminIdentifiers.phoneDigits(value);
    return d.length>=12?'https://wa.me/'+d:'';
  }
  function whatsappMessageHref(value,message){
    const base=whatsappHref(value);
    return base?base+'?text='+encodeURIComponent(String(message||'')):'';
  }
  global.DonaAntoniaAdminWhatsappLinks=Object.freeze({whatsappHref,whatsappMessageHref});
})(window);
