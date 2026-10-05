import {optimizeLibraryImage} from './attendance-library-image.js';
import {attendanceJsonApi} from './attendance-auth.js';

const FILES=[
  ['bom-dia.png','Bom dia'],['boa-tarde.png','Boa tarde'],['boa-noite.png','Boa noite'],
  ['muito-obrigada.png','Muito obrigada'],['obrigado.png','Obrigado'],['por-favor.png','Por favor'],
  ['a-disposicao.png','À disposição'],['tamo-junto.png','Tamo junto'],['ate-logo.png','Até logo']
];
const BASE='/vitrine/admin/atendimento/stickers/';
const row=(name)=>{const node=document.createElement('div');node.className='library-upload-row';node.dataset.seedSticker=name;const label=document.createElement('strong');label.textContent=name;const status=document.createElement('span');status.textContent='aguardando';node.append(label,status);document.querySelector('#libraryUploadQueue')?.append(node);return node};
const stage=(node,text,tone='neutral')=>{node.dataset.tone=tone;node.querySelector('span').textContent=text};
const api=async(action,payload={},method='GET')=>attendanceJsonApi(action,payload,method);

async function upload(name,title){
  const node=row(title);
  try{
    stage(node,'lendo arquivo');
    const response=await fetch(`${BASE}${name}`,{cache:'no-store'});if(!response.ok)throw new Error(`seed_asset_${response.status}`);
    const file=new File([await response.blob()],name,{type:'image/png',lastModified:Date.now()});
    const prepared=await optimizeLibraryImage(file,{sticker:true});
    stage(node,'reservando espaço');
    const reserved=await api('library_upload_prepare',{title,media_kind:'image',mime_type:prepared.mimeType,original_filename:name,original_size_bytes:prepared.originalBytes,category:'Figurinha',tags:['figurinha','transparente','dona-antonia']},'POST');
    stage(node,'enviando para Biblioteca');
    for(const [target,asset] of [[reserved.upload,prepared.file],[reserved.thumbnail_upload,prepared.thumbnail]]){
      if(!target?.signed_url||!asset)throw new Error('library_signed_upload_failed');
      const uploaded=await fetch(target.signed_url,{method:'PUT',headers:{'Content-Type':asset.type,'x-upsert':'false'},body:asset});if(!uploaded.ok)throw new Error(`storage_${uploaded.status}`);
    }
    stage(node,'confirmando');
    await api('library_upload_complete',{item_id:reserved.item_id,stored_size_bytes:prepared.file.size,width:prepared.width,height:prepared.height,duration_seconds:null},'POST');
    stage(node,'salva','success');return true;
  }catch(error){stage(node,`falha · ${String(error?.message||'erro').slice(0,70)}`,'error');return false}
}

async function install(){
  const button=document.querySelector('#installStarterStickersBtn');if(!button||button.disabled)return;
  button.disabled=true;let complete=0,alreadyPresent=0;
  try{
    const current=await api('library_list',{kind:'image',limit:100});
    const existing=new Set((current.items||[]).filter(item=>item.category==='Figurinha').map(item=>String(item.title||'').toLocaleLowerCase('pt-BR')));
    for(const [name,title] of FILES){if(existing.has(title.toLocaleLowerCase('pt-BR'))){alreadyPresent++;continue}if(await upload(name,title))complete++}
    const status=document.querySelector('#libraryStatus');if(status){status.textContent=`Pacote inicial: ${complete} novas, ${alreadyPresent} já salvas, ${FILES.length-complete-alreadyPresent} com falha.`;status.dataset.tone=complete+alreadyPresent===FILES.length?'success':'warning'}
    document.querySelector('#libraryKindSticker')?.click();
  }finally{button.disabled=false;}
}

function bind(){
  document.querySelector('#installStarterStickersBtn')?.addEventListener('click',()=>install().catch(()=>{}));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
