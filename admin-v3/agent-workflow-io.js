(()=>{
  'use strict';
  const C=window.DA_ADMIN_V3_CONFIG||{};
  const AUTH_KEY='da_admin_v3_auth';
  const MARKER='<!-- DA_AGENT_WORKFLOW_MD_V1 -->';
  const BEGIN='DA_STAGE_BEGIN';
  const END='<!-- DA_STAGE_END -->';
  const auth=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
  const clean=v=>String(v??'').replace(/\r/g,'').trim();

  async function rpc(fn,args={}){
    const a=auth();if(!a?.access_token)throw new Error('Sessão do Admin indisponível.');
    const r=await fetch(`${C.supabaseUrl}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${a.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store'});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||`Erro ${r.status}`);return d;
  }
  const yes=v=>v?'sim':'não';
  const fileSafe=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'etapa';

  function stageMarkdown(s,index,total){
    return `<!-- ${BEGIN}:${s.stage_key} -->\n## Etapa ${index+1} de ${total}: ${s.name}\n\n- Chave: \`${s.stage_key}\`\n- Ativa: ${yes(s.enabled)}\n- IA autônoma: ${yes(s.autonomous)}\n- Máximo de ofertas: ${Number(s.max_offers||0)}\n- Chamar humano quando não souber: ${yes(s.human_on_unknown)}\n\n### Orientação\n${clean(s.instructions)||'Sem orientação específica.'}\n\n### Ferramentas permitidas\n${(s.allowed_tools||[]).map(x=>`- \`${x}\``).join('\n')||'- Nenhuma'}\n\n### Próximas etapas\n${(s.next_stages||[]).map(x=>`- \`${x}\``).join('\n')||'- Nenhuma'}\n${END}\n`;
  }
  function toolCatalog(data){
    const tools=data?.tools||[];
    if(!tools.length)return '';
    return `\n## Catálogo de ferramentas disponíveis\n\nA IA revisora pode mover estas ferramentas entre etapas, mas não pode inventar outras:\n\n${tools.map(t=>`- \`${t.action_key}\` — ${clean(t.risk_class||'')}`).join('\n')}\n`;
  }
  function documentMarkdown(data,stages,title){
    const exportedAt=new Date().toISOString();
    const body=stages.map((s,i)=>stageMarkdown(s,i,stages.length)).join('\n');
    return `# ${title}\n\n${MARKER}\n\nExportado em: ${exportedAt}\nMotor do fluxo: ${data?.settings?.enabled?'ligado':'desligado'} · versão ${Number(data?.settings?.version||1)}\n\n## Instruções para a IA que vai configurar este arquivo\n\nEste Markdown representa o fluxo operacional real do atendimento da Dona Antônia. A configuração oficial continua salva no Supabase; este arquivo serve para revisão humana/por IA e posterior importação no Admin.\n\nAo editar:\n- mantenha cada **Chave** exatamente como está;\n- use somente ferramentas existentes no **Catálogo de ferramentas disponíveis**;\n- pode melhorar a **Orientação**, ativar/desativar etapa, definir autonomia, limite de ofertas, ferramentas e próximas etapas;\n- não crie preço, estoque, política comercial ou promessa de entrega; essas verdades vêm do backend;\n- preserve os marcadores \`${BEGIN}\` e \`DA_STAGE_END\`;\n- devolva o arquivo Markdown completo.\n\n${body}${toolCatalog(data)}`;
  }

  function download(name,text){
    const blob=new Blob([text],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function activeStageKey(){return document.querySelector('#agentWorkflowPanel .aw-node.active')?.dataset?.awStage||document.querySelector('#agentWorkflowPanel [data-aw-stage]')?.dataset?.awStage||''}
  function toast(message,kind=''){const host=document.getElementById('toastRegion');if(host){const n=document.createElement('div');n.className=`toast ${kind}`.trim();n.textContent=message;host.appendChild(n);setTimeout(()=>n.remove(),kind==='error'?6000:3200);return}const s=document.querySelector('#awStatus');if(s){s.textContent=message;s.className=`aw-status ${kind}`}}

  async function exportOne(){
    try{
      const data=await rpc('get_agent_workflow_admin_v1'),key=activeStageKey(),s=(data.stages||[]).find(x=>x.stage_key===key);
      if(!s)throw new Error('Selecione uma etapa do fluxo.');
      download(`dona-antonia-fluxo-${fileSafe(s.stage_key)}.md`,documentMarkdown(data,[s],`Dona Antônia — ${s.name}`));
      toast('Etapa baixada em Markdown.','success');
    }catch(e){toast(e.message||'Não consegui baixar a etapa.','error')}
  }
  async function exportAll(){
    try{
      const data=await rpc('get_agent_workflow_admin_v1'),stages=(data.stages||[]).filter(x=>x.enabled);
      if(!stages.length)throw new Error('Não há etapas ativas para exportar.');
      const stamp=new Date().toISOString().slice(0,10);
      download(`dona-antonia-fluxo-ia-completo-${stamp}.md`,documentMarkdown(data,stages,'Dona Antônia — Fluxo completo da IA'));
      toast('Fluxo completo baixado em Markdown.','success');
    }catch(e){toast(e.message||'Não consegui baixar o fluxo.','error')}
  }

  function boolField(block,label,fallback){const m=block.match(new RegExp(`^- ${label}:\\s*(sim|não|nao)\\s*$`,'im'));return m?m[1].toLowerCase()==='sim':fallback}
  function numField(block,label,fallback){const m=block.match(new RegExp(`^- ${label}:\\s*(\\d+)\\s*$`,'im'));return m?Math.max(0,Math.min(5,Number(m[1]))):fallback}
  function section(block,title,nextTitle){
    const start=block.indexOf(`### ${title}`);if(start<0)return '';
    const from=start+(`### ${title}`).length;const end=nextTitle?block.indexOf(`### ${nextTitle}`,from):block.length;
    return clean(block.slice(from,end<0?block.length:end));
  }
  function listCodes(text){return [...text.matchAll(/^-\s+`([^`]+)`\s*$/gm)].map(m=>clean(m[1])).filter(Boolean)}
  function parseMarkdown(text,current){
    if(!text.includes(MARKER))throw new Error('Arquivo de fluxo não reconhecido.');
    const stages=current.stages||[],stageKeys=new Set(stages.map(x=>x.stage_key)),toolKeys=new Set((current.tools||[]).map(x=>x.action_key));
    const blocks=[];const re=/<!-- DA_STAGE_BEGIN:([a-z0-9_]+) -->([\s\S]*?)<!-- DA_STAGE_END -->/g;let m;
    while((m=re.exec(text))){
      const key=m[1],block=m[2],base=stages.find(x=>x.stage_key===key);if(!base)throw new Error(`Etapa desconhecida: ${key}`);
      const heading=block.match(/^##\s+Etapa(?:\s+\d+\s+de\s+\d+)?:\s*(.+)$/mi);const name=clean(heading?.[1]||base.name).slice(0,100);
      const instructions=section(block,'Orientação','Ferramentas permitidas').slice(0,5000);
      const tools=listCodes(section(block,'Ferramentas permitidas','Próximas etapas'));
      const next=listCodes(section(block,'Próximas etapas',''));
      const invalidTool=tools.find(x=>!toolKeys.has(x));if(invalidTool)throw new Error(`Ferramenta não cadastrada: ${invalidTool}`);
      const invalidNext=next.find(x=>!stageKeys.has(x));if(invalidNext)throw new Error(`Próxima etapa inválida: ${invalidNext}`);
      blocks.push({stage_key:key,name,instructions,allowed_tools:tools,next_stages:next,enabled:boolField(block,'Ativa',base.enabled),autonomous:boolField(block,'IA autônoma',base.autonomous),max_offers:numField(block,'Máximo de ofertas',base.max_offers),human_on_unknown:boolField(block,'Chamar humano quando não souber',base.human_on_unknown)});
    }
    if(!blocks.length)throw new Error('Nenhuma etapa válida encontrada no arquivo.');
    return blocks;
  }
  async function importFile(file){
    if(!file||file.size>512*1024)throw new Error('Use um arquivo .md de até 512 KB.');
    const [text,current]=await Promise.all([file.text(),rpc('get_agent_workflow_admin_v1')]);
    const stages=parseMarkdown(text,current);
    if(!confirm(`Aplicar ${stages.length} etapa(s) ao fluxo da IA? A configuração atual continuará salva no Supabase.`))return;
    for(const s of stages){await rpc('save_agent_workflow_stage_v1',{p_stage_key:s.stage_key,p_name:s.name,p_instructions:s.instructions,p_allowed_tools:s.allowed_tools,p_next_stages:s.next_stages,p_enabled:s.enabled,p_autonomous:s.autonomous,p_max_offers:s.max_offers,p_human_on_unknown:s.human_on_unknown})}
    await window.DAAgentWorkflow?.reload?.();toast(`${stages.length} etapa(s) atualizada(s).`,'success');
  }

  function mount(){
    const panel=document.getElementById('agentWorkflowPanel');if(!panel||panel.querySelector('.aw-file-actions'))return;
    const head=panel.querySelector('.aw-head');if(!head)return;
    const actions=document.createElement('div');actions.className='aw-file-actions';actions.innerHTML=`<button class="button secondary" type="button" data-aw-export-one>Baixar etapa</button><button class="button secondary" type="button" data-aw-export-all>Baixar fluxo completo</button><button class="button secondary" type="button" data-aw-import>Importar .md</button><input class="hidden" type="file" accept=".md,text/markdown,text/plain" data-aw-file>`;
    head.insertAdjacentElement('afterend',actions);
    actions.querySelector('[data-aw-export-one]').onclick=exportOne;actions.querySelector('[data-aw-export-all]').onclick=exportAll;
    const input=actions.querySelector('[data-aw-file]');actions.querySelector('[data-aw-import]').onclick=()=>{input.value='';input.click()};
    input.onchange=async()=>{try{await importFile(input.files?.[0])}catch(e){toast(e.message||'Não consegui importar o arquivo.','error')}};
  }
  const observer=new MutationObserver(()=>{if(document.getElementById('agentWorkflowPanel')){mount();observer.disconnect()}});observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
