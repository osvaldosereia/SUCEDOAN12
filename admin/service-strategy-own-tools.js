const OWN_MODES=[
  ['text','Texto','Respostas'],
  ['audio_ai','Áudio da IA','Respostas'],
  ['image','Imagem','Respostas'],
  ['reply_buttons','Botões do nosso chat','Interação'],
  ['cta_url','Abrir link','Interação'],
  ['list_view','Lista para visualizar','Interação'],
  ['list_select','Lista para escolher','Interação'],
  ['product_lookup','Consultar produto / preço / estoque','Consulta'],
  ['human','Chamar pessoa','Controle'],
  ['silence','Não responder','Controle']
];

const ALLOWED=new Set(OWN_MODES.map(([id])=>id));
const LABELS=new Map(OWN_MODES.map(([id,label])=>[id,label]));
const GROUPS=new Map(OWN_MODES.map(([id,,group])=>[id,group]));
const LEGACY_MAP=new Map([
  ['basket_flow','cta_url'],
  ['registration_flow','cta_url'],
  ['address_flow','cta_url'],
  ['custom_flow','cta_url'],
  ['catalog_message','product_lookup'],
  ['single_product','product_lookup'],
  ['product_list','product_lookup'],
  ['video','text'],
  ['document','text'],
  ['location','text'],
  ['contact','text'],
  ['template_quick_reply','text'],
  ['template_cta','text'],
  ['template_carousel','text'],
  ['template_catalog','text'],
  ['template_multi_product','text']
]);

let scheduled=false;

function fillLegacyLink(select,legacy){
  if(!['basket_flow','registration_flow','address_flow','custom_flow'].includes(legacy))return;
  queueMicrotask(()=>{
    const stage=select.closest('.strategy-stage');
    if(!stage)return;
    const label=stage.querySelector('[data-cfg="label"]');
    const url=stage.querySelector('[data-cfg="url"]');
    if(label&&!label.value)label.value=legacy==='basket_flow'?'Ver cestas':'Continuar';
    if(url&&!url.value)url.value='https://donaantonia.com.br/comprar/';
  });
}

function sanitizeSelect(select){
  const previous=select.value;
  for(const option of [...select.options]){
    if(!ALLOWED.has(option.value))option.remove();
    else option.textContent=LABELS.get(option.value)||option.textContent;
  }
  for(const group of [...select.querySelectorAll('optgroup')]){
    const first=group.querySelector('option');
    if(!first)group.remove();
    else group.label=GROUPS.get(first.value)||'Ferramentas';
  }
  if(!ALLOWED.has(previous)){
    const replacement=LEGACY_MAP.get(previous)||'text';
    select.value=ALLOWED.has(replacement)?replacement:'text';
    select.dispatchEvent(new Event('change',{bubbles:true}));
    fillLegacyLink(select,previous);
  }
}

function sanitizeEditor(){
  document.querySelectorAll('#ruleEditor select[name="response_mode"]').forEach(sanitizeSelect);
}

function scheduleSanitize(){
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{scheduled=false;sanitizeEditor()});
}

function start(){
  sanitizeEditor();
  const root=document.getElementById('ruleEditor');
  if(!root)return;
  new MutationObserver(scheduleSanitize).observe(root,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
