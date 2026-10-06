import { ANA_DRY_RUN_INSTRUCTIONS } from './ana-policy-v1.mjs';

const cleanText=(value,max=1600)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const isPlainObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const keyPattern=/^[a-z0-9][a-z0-9_-]{0,39}$/;
const allowedChannels=new Set(['all','0975','1018']);
const behaviorEnums={tone:new Set(['cordial','warm','neutral']),conciseness:new Set(['short','balanced']),emoji:new Set(['never','sparingly'])};

export function normalizeAnaMatchText(value=''){
  return cleanText(value,3000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

export function validateAnaConfiguration(configuration){
  const errors=[];
  if(!isPlainObject(configuration))return {ok:false,errors:['configuration_object_required']};
  const behavior=configuration.behavior;
  if(!isPlainObject(behavior))errors.push('behavior_object_required');
  else{
    for(const [key,choices] of Object.entries(behaviorEnums))if(!choices.has(behavior[key]))errors.push(`behavior_${key}_invalid`);
    if(typeof behavior.use_known_first_name_on_first_greeting!=='boolean')errors.push('behavior_first_name_flag_invalid');
  }
  for(const [field,max] of [['knowledge',30],['triggers',100],['test_cases',40]]){
    if(!Array.isArray(configuration[field])){errors.push(`${field}_array_required`);continue}
    if(configuration[field].length>max)errors.push(`${field}_limit_exceeded`);
  }
  const seen=new Set();
  for(const item of Array.isArray(configuration.knowledge)?configuration.knowledge:[]){
    if(!isPlainObject(item)||!keyPattern.test(String(item.key||''))||seen.has(`k:${item.key}`)){errors.push('knowledge_item_invalid');continue}
    seen.add(`k:${item.key}`);
    if(!cleanText(item.title,100)||!cleanText(item.content,1600))errors.push(`knowledge_${item.key}_content_required`);
    if(item.status!==undefined&&!['draft','published','archived'].includes(item.status))errors.push(`knowledge_${item.key}_status_invalid`);
    if(item.keywords!==undefined&&(!Array.isArray(item.keywords)||item.keywords.length>12||item.keywords.some(x=>!cleanText(x,60))))errors.push(`knowledge_${item.key}_keywords_invalid`);
  }
  for(const trigger of Array.isArray(configuration.triggers)?configuration.triggers:[]){
    if(!isPlainObject(trigger)||!keyPattern.test(String(trigger.key||''))||seen.has(`t:${trigger.key}`)){errors.push('trigger_invalid');continue}
    seen.add(`t:${trigger.key}`);
    if(typeof trigger.enabled!=='boolean'||!Number.isInteger(trigger.priority)||trigger.priority<0||trigger.priority>100)errors.push(`trigger_${trigger.key}_priority_invalid`);
    if(!Array.isArray(trigger.channels)||!trigger.channels.length||trigger.channels.some(channel=>!allowedChannels.has(channel)))errors.push(`trigger_${trigger.key}_channels_invalid`);
    if(!['phrase','exact'].includes(trigger.match)||!Array.isArray(trigger.phrases)||!trigger.phrases.length||trigger.phrases.length>20||trigger.phrases.some(x=>normalizeAnaMatchText(x).length<2))errors.push(`trigger_${trigger.key}_match_invalid`);
    if(!['fixed_reply','label','handoff'].includes(trigger.action))errors.push(`trigger_${trigger.key}_action_invalid`);
    if(trigger.action==='fixed_reply'&&(!cleanText(trigger.response_text,500)||String(trigger.response_text).length>500))errors.push(`trigger_${trigger.key}_reply_invalid`);
    if(trigger.action==='label'&&!keyPattern.test(String(trigger.label_key||'')))errors.push(`trigger_${trigger.key}_label_invalid`);
  }
  for(const item of Array.isArray(configuration.test_cases)?configuration.test_cases:[]){
    if(!isPlainObject(item)||!keyPattern.test(String(item.key||''))||!cleanText(item.input,500)||!['reply','handoff','no_reply','label'].includes(item.expected))errors.push('test_case_invalid');
  }
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}

export function evaluateAnaTriggers(configuration,inboundText,channel){
  const text=normalizeAnaMatchText(inboundText);const channelKey=cleanText(channel,16);
  if(!text||!Array.isArray(configuration?.triggers))return {matched:false};
  const candidates=configuration.triggers.filter(item=>item?.enabled===true&&Array.isArray(item.channels)&&
    (item.channels.includes('all')||item.channels.includes(channelKey)))
    .sort((a,b)=>Number(b.priority)-Number(a.priority)||String(a.key).localeCompare(String(b.key)));
  for(const trigger of candidates){
    const matched=(trigger.phrases||[]).some(phrase=>{
      const needle=normalizeAnaMatchText(phrase);if(!needle)return false;
      return trigger.match==='exact'?text===needle:` ${text} `.includes(` ${needle} `);
    });
    if(matched)return {matched:true,triggerKey:trigger.key,action:trigger.action,
      responseText:trigger.action==='fixed_reply'?cleanText(trigger.response_text,500):'',
      labelKey:trigger.action==='label'?trigger.label_key:null,priority:trigger.priority};
  }
  return {matched:false};
}

export function buildAnaRuntimeInstructions(configuration){
  const valid=validateAnaConfiguration(configuration);
  if(!valid.ok)throw new TypeError(`ana_configuration_invalid:${valid.errors.join(',')}`);
  const behavior=configuration.behavior;
  const tone=behavior.tone==='warm'?'acolhedora e gentil':behavior.tone==='neutral'?'neutra e profissional':'curta e cordial';
  const length=behavior.conciseness==='balanced'?'Use respostas objetivas, com contexto suficiente.':'Prefira respostas curtas, com uma ideia principal.';
  const emoji=behavior.emoji==='never'?'Não use emojis.':'Use emojis com moderação, somente quando ajudarem.';
  const facts=configuration.knowledge.filter(item=>item.status!=='draft'&&item.status!=='archived')
    .map(item=>`- ${cleanText(item.title,100)}: ${cleanText(item.content,900)}`).join('\n');
  return `${ANA_DRY_RUN_INSTRUCTIONS}\n\nPreferências de estilo permitidas: use linguagem ${tone}. ${length} ${emoji}\n\nFatos aprovados do conhecimento (fonte autorizada; não substituem confirmação de dados dinâmicos):\n${facts||'- Nenhum fato adicional publicado.'}`;
}
