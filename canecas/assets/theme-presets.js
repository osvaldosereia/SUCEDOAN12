(() => {
  'use strict';
  const scriptUrl=document.currentScript?.src||location.href;
  const DATA_URL=new URL('../data/temas-config.json?v=20260729-7',scriptUrl).href;
  let data=null;
  function $(s,p=document){return p.querySelector(s)}
  function ensureOption(select,value){if(!select||!value)return;if(![...select.options].some(o=>o.value===value))select.add(new Option(value,value))}
  function setValue(el,value){if(!el)return;if(el.tagName==='SELECT')ensureOption(el,value);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
  function hideAudience(slot){const field=$(`#a${slot}Audience`)?.closest('label.field');if(field){field.hidden=true;field.style.display='none'}}
  function applyPreset(slot,preset){
    if(!preset)return;
    setValue($(`#a${slot}Style`),preset.style);
    setValue($(`#a${slot}Palette`),preset.palette);
    setValue($(`#a${slot}Mood`),preset.mood);
    setValue($(`#a${slot}Amount`),preset.amount);
    setValue($(`#a${slot}Element`),preset.element);
    setValue($(`#a${slot}Extra`),preset.extra);
  }
  function configureSlot(slot){
    const theme=$(`#a${slot}Theme`);if(!theme||theme.dataset.themeGroups)return false;
    theme.dataset.themeGroups='1';hideAudience(slot);
    data.temas.forEach(item=>ensureOption(theme,item.tema));
    const field=theme.closest('label.field');
    const groupField=document.createElement('label');groupField.className='field theme-group-field';groupField.innerHTML=`Configuração do tema<select id="a${slot}ThemeGroup"></select><span class="help">Cada grupo ajusta estilo, paleta, clima e elementos para esse tema.</span>`;
    field.insertAdjacentElement('afterend',groupField);
    const group=$(`#a${slot}ThemeGroup`);
    const updateGroups=(apply=true)=>{
      const selected=data.temas.find(item=>item.tema===theme.value)||data.temas[0];
      group.innerHTML=selected.grupos.map((preset,index)=>`<option value="${index}">${preset.nome}</option>`).join('');
      if(apply)applyPreset(slot,selected.grupos[0]);
    };
    theme.addEventListener('change',()=>updateGroups(true));
    group.addEventListener('change',()=>{
      const selected=data.temas.find(item=>item.tema===theme.value)||data.temas[0];
      applyPreset(slot,selected.grupos[Number(group.value)]||selected.grupos[0]);
    });
    if(!data.temas.some(item=>item.tema===theme.value))setValue(theme,data.temas[0].tema);
    updateGroups(false);
    return true;
  }
  async function start(){
    const response=await fetch(DATA_URL,{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);data=await response.json();
    const timer=setInterval(()=>{configureSlot(1);configureSlot(2)},600);
    setTimeout(()=>clearInterval(timer),90000);
    const observer=new MutationObserver(()=>{configureSlot(1);configureSlot(2)});observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  start().catch(error=>console.warn('Configurações de tema não carregadas:',error));
})();
