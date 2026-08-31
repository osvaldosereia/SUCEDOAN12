const BUILD='20260831-admin-canecas-personalization-prompt-suggest-v1';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];

function selectedFields(){
  return $$('[data-cf-personal-field]').filter(row=>$('[data-enabled]',row)?.checked).map(row=>row.dataset.cfPersonalField);
}

function suggestion(fields=[]){
  const set=new Set(fields);
  if(set.has('logo')&&(set.has('endereco')||set.has('telefone')||set.has('site')))return'empresa';
  if(set.size===1&&set.has('logo'))return'logo';
  if(set.has('nome')&&set.has('foto')&&set.size===2)return'nome_foto';
  if(set.size===1&&set.has('foto'))return'foto';
  if(set.size===1&&set.has('nome'))return'nome';
  return'';
}

function maybeSuggest(){
  const select=$('#cfPersonalizationPrompt');
  if(!select)return;
  const next=suggestion(selectedFields());
  const canChange=!select.value||select.dataset.cfAutoPrompt==='1';
  if(!canChange)return;
  if(next&&[...select.options].some(option=>option.value===next)){
    select.value=next;
    select.dataset.cfAutoPrompt='1';
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }else if(select.dataset.cfAutoPrompt==='1'){
    select.value='';
    select.dataset.cfAutoPrompt='';
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }
}

document.addEventListener('change',event=>{
  const target=event.target;
  if(target?.matches?.('[data-cf-personal-field] [data-enabled]'))maybeSuggest();
  if(target?.id==='cfPersonalizationPrompt'&&target.dataset.cfAutoPrompt!=='1')target.dataset.cfAutoPrompt='';
});

document.addEventListener('pointerdown',event=>{
  if(event.target?.id==='cfPersonalizationPrompt')event.target.dataset.cfAutoPrompt='';
},{passive:true});

document.documentElement.dataset.cfPersonalizationPromptSuggest=BUILD;
