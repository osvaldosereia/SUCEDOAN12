function ensureTemplateCenterCss(){
  if(document.querySelector('link[data-da-marketing-template-center]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/vitrine/admin/marketing/template-center.css?v=meta-template-center-v1';
  link.dataset.daMarketingTemplateCenter='1';
  document.head.appendChild(link);
}

function loadModule(path,label){
  import(path).catch(error=>console.warn(label,String(error?.message||error).slice(0,160)));
}

ensureTemplateCenterCss();
loadModule('/vitrine/admin/marketing/template-center.js?v=marketing-template-center-v3','marketing-template-center-load');
loadModule('/vitrine/admin/marketing/campaign-entry.js?v=marketing-campaign-entry-v9','marketing-campaign-entry-load');