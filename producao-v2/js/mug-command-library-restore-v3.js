import { DEFAULT_CONFIG, STORAGE_KEYS } from './config.js';
import { text } from './core/utils.js';

const BUILD='20260828-mug-command-restore-v3';
const NODE='canecas/comandos_criacao';
const CACHE='/site/canecas-comandos.json';
const SELECTED_KEY='da_admin_v2_mug_saved_commands_selected';
let syncing=false;

function config(){try{return {...DEFAULT_CONFIG,...JSON.parse(localStorage.getItem(STORAGE_KEYS.config)||'{}')}}catch{return {...DEFAULT_CONFIG}}}
function base(){return text(config().firebaseUrl||DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/,'')}
function selected(){try{const raw=JSON.parse(localStorage.getItem(SELECTED_KEY)||'[]');return new Set(Array.isArray(raw)?raw.map(String):[])}catch{return new Set()}}
function persist(set){localStorage.setItem(SELECTED_KEY,JSON.stringify([...set]))}
function normalize(data){if(!data||typeof data!=='object'||Array.isArray(data))return[];return Object.entries(data).filter(([,v])=>v&&typeof v==='object'&&!Array.isArray(v)).map(([k,v])=>({id:text(v.id||k),nome:text(v.nome),texto:text(v.texto),iniciar_ativo:v.iniciar_ativo===true,criado_em:text(v.criado_em),atualizado_em:text(v.atualizado_em)})).filter(x=>x.id&&x.nome&&x.texto).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR',{sensitivity:'base'}))}
async function fetchJson(url){const r=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
async function loadSource(){
 const fb=base();
 if(fb){try{const live=normalize(await fetchJson(`${fb}/${NODE}.json?_=${Date.now()}`));if(live.length)return live}catch(e){console.warn('[Comandos canecas] Firebase indisponível, usando cache:',e)}}
 try{return normalize(await fetchJson(`${CACHE}?_=${Date.now()}`))}catch(e){console.warn('[Comandos canecas] Cache indisponível:',e);return[]}
}
async function restoreIntoPanel(panel){
 if(!panel||syncing)return;const state=panel.__mugCommandState;if(!state)return;syncing=true;
 try{
  const items=await loadSource();
  if(items.length){state.commands=items;const defaults=items.filter(x=>x.iniciar_ativo).map(x=>x.id);const chosen=selected();defaults.forEach(id=>chosen.add(id));state.selected=chosen;persist(chosen);panel.querySelector('#mugCommandRefresh')?.click();}
  const library=panel.querySelector('#mugCommandLibrary');
  if(library){library.hidden=false;library.style.removeProperty('display');library.querySelector('.mug-command-form')?.removeAttribute('hidden');}
 }finally{syncing=false}
}
function ensureVisible(panel){
 const library=panel?.querySelector('#mugCommandLibrary');if(!library)return false;
 library.hidden=false;library.style.setProperty('display','grid','important');
 const form=library.querySelector('.mug-command-form');if(form){form.hidden=false;form.style.setProperty('display','grid','important')}
 const name=library.querySelector('#mugCommandName');const body=library.querySelector('#mugCommandText');const save=library.querySelector('#mugCommandSave');
 if(name)name.placeholder='Nome do comando · Ex.: Fundo branco';
 if(body)body.placeholder='Escreva aqui o comando que será reutilizado nas próximas artes.';
 if(save)save.textContent=panel.__mugCommandState?.editingId?'Salvar alteração':'Salvar comando';
 panel.dataset.commandRestore=BUILD;return true;
}
function activate(attempt=0){
 if(window.adminV2CurrentRoute?.()!=='mug-studio')return;
 const panel=document.getElementById('mugAutomationPanel');
 if(!panel)return attempt<50?setTimeout(()=>activate(attempt+1),100):undefined;
 if(!ensureVisible(panel))return attempt<50?setTimeout(()=>activate(attempt+1),100):undefined;
 restoreIntoPanel(panel).catch(e=>console.error('[Comandos canecas] falha ao restaurar:',e));
}
window.addEventListener('admin-v2-route-ready',e=>{if(e.detail?.route==='mug-studio')setTimeout(()=>activate(),0)});
window.addEventListener('admin-v2-route',e=>{if(e.detail?.route==='mug-studio')setTimeout(()=>activate(),0)});
window.addEventListener('mug-studio-model-applied',()=>setTimeout(()=>activate(),0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>activate(),0),{once:true});else setTimeout(()=>activate(),0);
export{BUILD,activate,loadSource};
