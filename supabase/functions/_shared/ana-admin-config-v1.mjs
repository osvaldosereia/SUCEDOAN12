import { ANA_DRY_RUN_INSTRUCTIONS } from './ana-policy-v1.mjs';

const cleanText=(value,max=1600)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const isPlainObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const keyPattern=/^[a-z0-9][a-z0-9_-]{0,39}$/;
const allowedChannels=new Set(['all','0975','1018']);
const behaviorEnums={tone:new Set(['cordial','warm','neutral']),conciseness:new Set(['short','balanced']),emoji:new Set(['never','sparingly'])};
const actionTypes=new Set(['fixed_reply','label','remove_label','handoff','continue_ai']);
const conditionTypes=new Set(['customer_linked','human_mode']);
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedTriggerActions(trigger){
  if(Array.isArray(trigger?.actions))return trigger.actions;
  if(trigger?.action)return [{type:trigger.action,response_text:trigger.response_text,label_id:trigger.label_id}];
  return [];
}
function validateTriggerAction(triggerKey,action,index,errors){
  if(!isPlainObject(action)||!actionTypes.has(action.type)){errors.push(`trigger_${triggerKey}_action_${index}_invalid`);return}
  if(action.type==='fixed_reply'&&(!cleanText(action.response_text,500)||String(action.response_text).length>500))errors.push(`trigger_${triggerKey}_reply_${index}_invalid`);
  if(['label','remove_label'].includes(action.type)&&!uuidPattern.test(String(action.label_id||'')))errors.push(`trigger_${triggerKey}_label_${index}_invalid`);
}
function actionSequenceErrors(triggerKey,actions){
  const errors=[];
  const terminalIndexes=actions.map((a,i)=>['fixed_reply','handoff','continue_ai'].includes(a?.type)?i:-1).filter(i=>i>=0);
  if(terminalIndexes.length>1)errors.push(`trigger_${triggerKey}_multiple_terminal_actions`);
  if(terminalIndexes.some(i=>i!==actions.length-1))errors.push(`trigger_${triggerKey}_terminal_action_must_be_last`);
  return errors;
}
function triggerSpecificity(trigger,text){
  const matches=(trigger.phrases||[]).map(phrase=>normalizeAnaMatchText(phrase)).filter(Boolean).filter(needle=>trigger.match==='exact'?text===needle:` ${text} `.includes(` ${needle} `));
  return matches.reduce((best,needle)=>Math.max(best,needle.split(' ').length*1000+needle.length),0)+(trigger.match==='exact'?1000000:0);
}
function conditionsMatch(conditions,context={}){
  if(!Array.isArray(conditions)||!conditions.length)return true;
  return conditions.every(condition=>{
    if(!isPlainObject(condition)||!conditionTypes.has(condition.type))return false;
    if(condition.type==='customer_linked')return Boolean(context.customerLinked)===Boolean(condition.value);
    if(condition.type==='human_mode')return Boolean(context.humanMode)===Boolean(condition.value);
    return false;
  });
}

export function normalizeAnaMatchText(value=''){
  return cleanText(value,3000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

export function requiresDynamicOperationalContext(value=''){
  const text=normalizeAnaMatchText(value);
  if(!text)return false;
  const patterns=[
    /\b(preco|precos|valor|valores|quanto custa|quanto esta|quanto ta|custa)\b/,
    /\b(estoque|disponivel|disponibilidade|tem em estoque)\b/,
    /\b(meu pedido|minha compra|status do pedido|acompanhar pedido|rastrear pedido|numero do pedido)\b/,
    /\b(quando entrega|prazo de entrega|que dia entrega|horario da entrega|entrega hoje|entrega amanha)\b/,
    /\b(meu endereco|alterar endereco|endereco da entrega|endereco cadastrado)\b/,
    /\b(meu pagamento|pagamento recusado|pagamento aprovado|cobranca|cobrou|troco)\b/
  ];
  return patterns.some(pattern=>pattern.test(text));
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
  for(const [field,max] of [['knowledge',30],['triggers',100],['test_cases',20]]){
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
    const phrasesValid=Array.isArray(trigger.phrases)&&trigger.phrases.length<=20&&trigger.phrases.every(x=>normalizeAnaMatchText(x).length>=2);
    if(!['phrase','exact'].includes(trigger.match)||!phrasesValid||(trigger.enabled===true&&trigger.phrases.length===0))errors.push(`trigger_${trigger.key}_match_invalid`);
    if(trigger.exclude_phrases!==undefined&&(!Array.isArray(trigger.exclude_phrases)||trigger.exclude_phrases.length>20||trigger.exclude_phrases.some(x=>normalizeAnaMatchText(x).length<2)))errors.push(`trigger_${trigger.key}_exclude_phrases_invalid`);
    const includeSet=new Set((trigger.phrases||[]).map(normalizeAnaMatchText).filter(Boolean));
    const excludeSet=new Set((trigger.exclude_phrases||[]).map(normalizeAnaMatchText).filter(Boolean));
    if([...includeSet].some(phrase=>excludeSet.has(phrase)))errors.push(`trigger_${trigger.key}_include_exclude_conflict`);
    const actions=normalizedTriggerActions(trigger);
    if(!actions.length||actions.length>5)errors.push(`trigger_${trigger.key}_actions_invalid`);
    else{
      actions.forEach((action,index)=>validateTriggerAction(trigger.key,action,index,errors));
      errors.push(...actionSequenceErrors(trigger.key,actions));
      const labelDirections=new Map();
      for(const action of actions){
        if(!['label','remove_label'].includes(action?.type)||!action?.label_id)continue;
        const previous=labelDirections.get(action.label_id);
        if(previous&&previous!==action.type)errors.push(`trigger_${trigger.key}_label_action_contradictory`);
        labelDirections.set(action.label_id,action.type);
      }
    }
    if(trigger.conditions!==undefined){
      if(!Array.isArray(trigger.conditions)||trigger.conditions.length>5)errors.push(`trigger_${trigger.key}_conditions_invalid`);
      else{
        const conditionSeen=new Map();
        trigger.conditions.forEach((condition,index)=>{
          if(!isPlainObject(condition)||!conditionTypes.has(condition.type)||typeof condition.value!=='boolean'){errors.push(`trigger_${trigger.key}_condition_${index}_invalid`);return}
          if(conditionSeen.has(condition.type)){
            if(conditionSeen.get(condition.type)!==condition.value)errors.push(`trigger_${trigger.key}_condition_${condition.type}_contradictory`);
            else errors.push(`trigger_${trigger.key}_condition_${condition.type}_duplicate`);
          }
          conditionSeen.set(condition.type,condition.value);
        });
      }
    }
  }
  for(const item of Array.isArray(configuration.test_cases)?configuration.test_cases:[]){
    if(!isPlainObject(item)||!keyPattern.test(String(item.key||''))||!cleanText(item.input,500)||!['reply','handoff','no_reply','label'].includes(item.expected))errors.push('test_case_invalid');
    if(item?.channel!==undefined&&!allowedChannels.has(item.channel))errors.push(`test_case_${item.key}_channel_invalid`);
  }
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}

export function evaluateAnaTriggers(configuration,inboundText,channel,context={}){
  const text=normalizeAnaMatchText(inboundText);const channelKey=cleanText(channel,16);
  if(!text||!Array.isArray(configuration?.triggers))return {matched:false};
  const candidates=configuration.triggers.filter(item=>item?.enabled===true&&Array.isArray(item.channels)&&
    (item.channels.includes('all')||item.channels.includes(channelKey))&&conditionsMatch(item.conditions,context))
    .map(item=>({item,specificity:triggerSpecificity(item,text)}))
    .filter(candidate=>candidate.specificity>0)
    .filter(candidate=>!(candidate.item.exclude_phrases||[]).some(phrase=>{const needle=normalizeAnaMatchText(phrase);return needle&&` ${text} `.includes(` ${needle} `)}))
    .sort((a,b)=>Number(b.item.priority)-Number(a.item.priority)||b.specificity-a.specificity||String(a.item.key).localeCompare(String(b.item.key)));
  for(const candidate of candidates){
    const trigger=candidate.item;
    {
      const actions=normalizedTriggerActions(trigger).map(action=>({
        type:action.type,
        responseText:action.type==='fixed_reply'?cleanText(action.response_text,500):'',
        labelId:['label','remove_label'].includes(action.type)?action.label_id:null
      }));
      const first=actions[0]||{};
      return {matched:true,triggerKey:trigger.key,actions,action:first.type,responseText:first.responseText||'',labelId:first.labelId||null,priority:trigger.priority};
    }
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
  const firstName=behavior.use_known_first_name_on_first_greeting?'Use o primeiro nome conhecido somente no primeiro cumprimento do dia.':'Não use o nome do cadastro na resposta.';
  const facts=configuration.knowledge.filter(item=>item.status!=='draft'&&item.status!=='archived')
    .map(item=>`- ${cleanText(item.title,100)}: ${cleanText(item.content,900)}`).join('\n');
  return `${ANA_DRY_RUN_INSTRUCTIONS}\n\nPreferências de estilo permitidas: use linguagem ${tone}. ${length} ${emoji} ${firstName}\n\nFatos aprovados do conhecimento (fonte autorizada; não substituem confirmação de dados dinâmicos):\n${facts||'- Nenhum fato adicional publicado.'}`;
}

function requiresDynamicConfirmation(inboundText=''){
  const text=normalizeAnaMatchText(inboundText);
  if(!text)return false;
  const phrases=['preco','qual o preco','quanto custa','valor','qual o valor','estoque','tem estoque','tem em estoque'];
  return phrases.some(phrase=>` ${text} `.includes(` ${phrase} `));
}

export function routeAnaMessage(configuration,inboundText,channel,context={}){
  const validation=validateAnaConfiguration(configuration);
  if(!validation.ok)return {path:'handoff',reason:'active_config_invalid'};
  const trigger=evaluateAnaTriggers(configuration,inboundText,channel,context);
  if(!trigger.matched){
    if(requiresDynamicConfirmation(inboundText))return {path:'handoff',reason:'dynamic_data_requires_confirmation'};
    return {path:'ai'};
  }
  if(Array.isArray(trigger.actions)&&trigger.actions.length>1)return {path:'actions',triggerKey:trigger.triggerKey,actions:trigger.actions};
  if(trigger.action==='fixed_reply')return {path:'fixed_reply',triggerKey:trigger.triggerKey,responseText:trigger.responseText};
  if(trigger.action==='label')return {path:'label',triggerKey:trigger.triggerKey,labelId:trigger.labelId};
  if(trigger.action==='remove_label')return {path:'remove_label',triggerKey:trigger.triggerKey,labelId:trigger.labelId};
  if(trigger.action==='continue_ai')return {path:'ai',triggerKey:trigger.triggerKey};
  return {path:'handoff',triggerKey:trigger.triggerKey,reason:'admin_trigger_handoff'};
}

