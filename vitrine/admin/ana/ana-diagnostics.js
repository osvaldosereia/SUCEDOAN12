const normalize=value=>String(value??'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^\p{L}\p{N}]+/gu,' ')
  .trim()
  .replace(/\s+/g,' ');

const channelsOverlap=(a=[],b=[])=>a.includes('all')||b.includes('all')||a.some(channel=>b.includes(channel));

function mutuallyExclusiveConditions(a=[],b=[]){
  const left=new Map((Array.isArray(a)?a:[]).map(item=>[item?.type,Boolean(item?.value)]));
  const right=new Map((Array.isArray(b)?b:[]).map(item=>[item?.type,Boolean(item?.value)]));
  for(const [type,value] of left)if(right.has(type)&&right.get(type)!==value)return true;
  return false;
}

function actionSummary(trigger={}){
  const actions=Array.isArray(trigger.actions)?trigger.actions:(trigger.action?[{type:trigger.action,label_id:trigger.label_id}]:[]);
  return actions.map(action=>`${action?.type||'?'}:${action?.label_id||''}`).join('|');
}

export function analyzeAnaAutomationDraft(triggers=[]){
  const active=(Array.isArray(triggers)?triggers:[]).filter(item=>item?.enabled===true);
  const issues=[];

  for(const trigger of active){
    const include=(trigger.phrases||[]).map(normalize).filter(Boolean);
    const exclude=(trigger.exclude_phrases||[]).map(normalize).filter(Boolean);
    const seen=new Set();
    for(const phrase of include){
      if(seen.has(phrase))issues.push({severity:'warning',code:'duplicate_phrase',triggerKey:trigger.key,message:`A automação "${trigger.name||trigger.key}" repete a frase "${phrase}".`});
      seen.add(phrase);
    }
    const excluded=new Set(exclude);
    for(const phrase of new Set(include)){
      if(excluded.has(phrase))issues.push({severity:'critical',code:'include_exclude_conflict',triggerKey:trigger.key,message:`A frase "${phrase}" está ao mesmo tempo em disparar e não disparar.`});
    }

    const labelDirections=new Map();
    const actions=Array.isArray(trigger.actions)?trigger.actions:(trigger.action?[{type:trigger.action,label_id:trigger.label_id}]:[]);
    for(const action of actions){
      if(!['label','remove_label'].includes(action?.type)||!action?.label_id)continue;
      const previous=labelDirections.get(action.label_id);
      if(previous&&previous!==action.type)issues.push({severity:'critical',code:'label_direction_conflict',triggerKey:trigger.key,message:`A automação "${trigger.name||trigger.key}" aplica e remove a mesma etiqueta.`});
      labelDirections.set(action.label_id,action.type);
    }
  }

  for(let i=0;i<active.length;i++){
    const left=active[i],leftPhrases=[...new Set((left.phrases||[]).map(normalize).filter(Boolean))];
    for(let j=i+1;j<active.length;j++){
      const right=active[j];
      if(!channelsOverlap(left.channels||[],right.channels||[]))continue;
      if(mutuallyExclusiveConditions(left.conditions,right.conditions))continue;
      const rightPhrases=[...new Set((right.phrases||[]).map(normalize).filter(Boolean))];
      for(const a of leftPhrases){
        for(const b of rightPhrases){
          if(a===b){
            const samePriority=Number(left.priority)===Number(right.priority);
            const sameOutcome=actionSummary(left)===actionSummary(right);
            issues.push({
              severity:samePriority&&!sameOutcome?'critical':'warning',
              code:samePriority?'same_phrase_same_priority':'same_phrase_priority_resolved',
              triggerKey:left.key,
              relatedTriggerKey:right.key,
              message:samePriority
                ?`"${left.name||left.key}" e "${right.name||right.key}" usam a mesma frase "${a}" na mesma prioridade.`
                :`A frase "${a}" existe em duas automações; a prioridade define qual vence.`
            });
          }else if(Number(left.priority)===Number(right.priority)&&(a.includes(b)||b.includes(a))){
            const short=a.length<=b.length?a:b,long=a.length>b.length?a:b;
            issues.push({severity:'warning',code:'specificity_overlap',triggerKey:left.key,relatedTriggerKey:right.key,message:`As frases "${short}" e "${long}" se sobrepõem; a frase mais específica vence.`});
          }
        }
      }
    }
  }

  const unique=[];
  const signatures=new Set();
  for(const issue of issues){
    const key=[issue.severity,issue.code,issue.triggerKey,issue.relatedTriggerKey||'',issue.message].join('|');
    if(signatures.has(key))continue;
    signatures.add(key);unique.push(issue);
  }
  return {
    criticalCount:unique.filter(item=>item.severity==='critical').length,
    warningCount:unique.filter(item=>item.severity==='warning').length,
    issues:unique
  };
}
