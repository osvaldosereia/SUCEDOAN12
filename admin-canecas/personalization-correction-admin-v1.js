import { text, nowIso, audit } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug, patchMug } from './mug-store-v2.js?v=20260829-1';

const BUILD='20260902-admin-canecas-personalization-correction-v1';
const $=(s,r=document)=>r.querySelector(s);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function waitSection(productKey){
  for(let i=0;i<20;i++){
    const root=$('#drawerContent');
    const section=$('#cfPersonalizationConfig',root||document);
    if(root&&section&&root.dataset.productKey===productKey)return {root,section};
    await sleep(80);
  }
  return null;
}

async function install(productKey){
  const found=await waitSection(productKey);
  if(!found)return;
  const {root,section}=found;
  if($('#cfPersonalizationAllowCorrection',section))return;
  const product=await getMug(productKey).catch(()=>null);
  if(!product||!section.isConnected)return;
  const cfg=product.personalizacao&&typeof product.personalizacao==='object'?product.personalizacao:{};
  const allowed=cfg.permitir_correcao_pos_geracao===true||product.personalizacao_permitir_correcao===true;
  const form=$('.form',section);
  if(!form)return;
  const label=document.createElement('label');
  label.innerHTML=`Permitir corrigir dados após gerar
    <select id="cfPersonalizationAllowCorrection">
      <option value="0" ${!allowed?'selected':''}>Não</option>
      <option value="1" ${allowed?'selected':''}>Sim</option>
    </select>`;
  label.title='Quando ativado, o cliente verá o botão CORRIGIR DADOS depois que a arte for gerada.';
  form.appendChild(label);
  const help=document.createElement('p');
  help.className='cf-personal-help';
  help.id='cfPersonalizationCorrectionHelp';
  help.textContent='Correção após gerar: deixe Não na maioria das canecas. Ative somente quando quiser permitir que o cliente volte aos campos e gere outra versão.';
  form.insertAdjacentElement('afterend',help);
  wrapSaveButtons(productKey,root);
}

function wrapSaveButtons(productKey,root){
  for(const id of ['cfSaveOnly','cfSaveSync','cfSyncNow']){
    const button=$(`#${id}`,root||document);
    if(!button||button.dataset.cfCorrectionWrapped==='1')continue;
    const previous=button.onclick;
    if(typeof previous!=='function')continue;
    button.dataset.cfCorrectionWrapped='1';
    button.onclick=async function(event){
      const allowed=$('#cfPersonalizationAllowCorrection',root||document)?.value==='1';
      const result=await previous.call(button,event);
      try{
        const latest=await getMug(productKey);
        if(!latest)return result;
        const personalizacao=latest.personalizacao&&typeof latest.personalizacao==='object'?latest.personalizacao:{};
        await patchMug(productKey,{
          personalizacao:{...personalizacao,permitir_correcao_pos_geracao:allowed,atualizado_em:nowIso()},
          personalizacao_permitir_correcao:allowed
        });
        await audit('caneca_personalizacao_correcao_config_v1',{
          produto_key:productKey,
          permitir_correcao_pos_geracao:allowed
        }).catch(()=>{});
      }catch(error){
        console.error('[Admin Canecas] correção pós-geração:',error);
      }
      return result;
    };
  }
}

window.addEventListener('admin-canecas:drawer',event=>{
  const detail=event.detail||{};
  if(detail.kind!=='mug'||!detail.id)return;
  install(text(detail.id)).catch(error=>console.error('[Admin Canecas] opção de correção:',error));
});

document.documentElement.dataset.cfPersonalizationCorrection=BUILD;
