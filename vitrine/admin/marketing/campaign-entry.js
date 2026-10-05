let campaignModulePromise=null;
let marketingPolishPromise=null;
let campaignSimplePromise=null;
let campaignListPromise=null;
let carouselEditorPromise=null;
const PREFILL_KEY='da_marketing_campaign_prefill_v1';

function ensureMarketingPolish(){
  if(!document.querySelector('link[data-da-marketing-polish]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/vitrine/admin/marketing/marketing-polish.css?v=marketing-polish-v1';link.dataset.daMarketingPolish='1';document.head.appendChild(link);
  }
  if(!marketingPolishPromise)marketingPolishPromise=import('/vitrine/admin/marketing/marketing-polish.js?v=marketing-polish-v1').catch(error=>{console.warn('marketing-polish-load',String(error?.message||error).slice(0,160));return null});
  return marketingPolishPromise;
}
function ensureCampaignSimple(){if(!campaignSimplePromise)campaignSimplePromise=import('/vitrine/admin/marketing/campaign-simple-ui.js?v=marketing-campaign-simple-v1').catch(error=>{console.warn('marketing-campaign-simple-load',String(error?.message||error).slice(0,160));return null});return campaignSimplePromise}
function ensureCampaignList(){if(!campaignListPromise)campaignListPromise=import('/vitrine/admin/marketing/campaign-list-simple.js?v=marketing-campaign-list-v1').catch(error=>{console.warn('marketing-campaign-list-load',String(error?.message||error).slice(0,160));return null});return campaignListPromise}
function ensureCarouselEditor(){if(!carouselEditorPromise)carouselEditorPromise=import('/vitrine/admin/marketing/template-carousel-editor.js?v=marketing-carousel-v1').catch(error=>{console.warn('marketing-carousel-load',String(error?.message||error).slice(0,160));return null});return carouselEditorPromise}
function loadCampaignModule(){if(!campaignModulePromise)campaignModulePromise=import('/vitrine/admin/marketing/campaign-center.js?v=marketing-campaign-v1');return campaignModulePromise}

function collectAudienceFilters(form){const filters={};for(const name of ['search','city','neighborhood','brand','category','last_purchase_after','last_purchase_before']){const value=String(form.elements[name]?.value||'').trim();if(value)filters[name]=value}for(const name of ['inactive_days','min_order_count','max_order_count','min_lifetime_value','max_lifetime_value']){const raw=String(form.elements[name]?.value||'').trim();if(raw!=='')filters[name]=Number(raw)}const labels=[...form.querySelectorAll('select[name="label_ids"] option:checked')].map(option=>option.value).filter(Boolean);if(labels.length)filters.label_ids=labels;const products=String(form.elements.product_ids?.value||'').split(/[\s,;]+/).map(value=>value.trim()).filter(Boolean);if(products.length)filters.product_ids=products;return filters}

async function openCampaigns(prefill=null){const root=document.querySelector('#content');if(!root)return;if(prefill){try{sessionStorage.setItem(PREFILL_KEY,JSON.stringify(prefill))}catch{}}const module=await loadCampaignModule();await Promise.allSettled([ensureCampaignSimple(),ensureCampaignList(),ensureCarouselEditor()]);return module.mountCampaignView(root,prefill?{prefill}:{})}

function enhanceMarketingNav(root=document){root.querySelectorAll('[data-marketing-subnav]').forEach(nav=>{if(nav.querySelector('[data-marketing-view="campaigns"]'))return;const button=document.createElement('button');button.type='button';button.dataset.marketingView='campaigns';button.textContent='Campanhas';const consent=nav.querySelector('[data-marketing-view="consents"]');if(consent)nav.insertBefore(button,consent);else nav.appendChild(button);button.addEventListener('click',()=>openCampaigns().catch(error=>console.warn('marketing-campaign-load',String(error?.message||error).slice(0,160))))})}
function enhanceAudienceHandoff(root=document){root.querySelectorAll('[data-audience-form]').forEach(form=>{const actions=form.querySelector('.marketing-audience-form-actions');if(!actions||actions.querySelector('[data-create-campaign-from-audience]'))return;const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.createCampaignFromAudience='1';button.textContent='Criar campanha com este público';button.addEventListener('click',()=>openCampaigns({filters:collectAudienceFilters(form)}).catch(error=>console.warn('marketing-campaign-prefill',String(error?.message||error).slice(0,160))));actions.insertBefore(button,actions.firstChild)})}
function enhance(){enhanceMarketingNav(document);enhanceAudienceHandoff(document);window.DAMarketingPolish?.apply?.();window.DAMarketingCampaignSimple?.enhanceCampaignCenter?.();window.DAMarketingCampaignListSimple?.enhanceCampaignList?.()}
const observer=new MutationObserver(()=>enhance());observer.observe(document.documentElement,{subtree:true,childList:true});
Promise.allSettled([ensureMarketingPolish(),ensureCampaignSimple(),ensureCampaignList(),ensureCarouselEditor()]).finally(enhance);enhance();
window.DAMarketingCampaignEntry={openCampaigns,collectAudienceFilters};
export {openCampaigns,collectAudienceFilters,PREFILL_KEY};
