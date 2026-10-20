import {attendanceAuthorizedFetch} from '../atendimento/attendance-auth.js?v=auth-refresh-v2';

const MEDIA_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-whatsapp-template-carousel-v1';
const ADMIN_PUBLIC_KEY=['sb','publishable','tFXHtH0HCXZepVtwgKElIg','DxS76Gu8'].join('_');
export const MARKETING_IMAGE_LIBRARY=Object.freeze([
  {id:'economica',name:'Cesta Econômica',src:'/img/cesta-basica-cuiaba-varzea-grande-economica.avif'},
  {id:'grande-koblenz',name:'Cesta Grande · Koblenz',src:'/site/img/CESTA-GRANDE-KOBLENZ.webp'},
  {id:'grande-alvino',name:'Cesta Grande · Alvino',src:'/site/img/CESTA-GRANDE-ALVINO.webp'},
  {id:'media-bonini',name:'Cesta Média · Bonini',src:'/site/img/CESTA-MEDIA-BONINI.webp'},
  {id:'pequena-bonini',name:'Cesta Pequena · Bonini',src:'/site/img/CESTA-PEQUENA-BONINI.webp'},
  {id:'pequena-koblenz',name:'Cesta Pequena · Koblenz',src:'/site/img/CESTA-PEQUENA-KOBLENZ.webp'},
  {id:'media-koblenz',name:'Cesta Média · Koblenz',src:'/site/img/CESTA-MEDIA-KOBLENZ.webp'},
  {id:'mini-bonini',name:'Cesta Mini · Bonini',src:'/site/img/CESTA-MINI-BONINI.webp'},
  {id:'mini-koblenz',name:'Cesta Mini · Koblenz',src:'/site/img/CESTA-MINI-KOBLENZ.webp'}
]);
const STAGED_IMAGE_KEY='da_marketing_staged_image_v1';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function ensureCss(){if(document.querySelector('link[data-da-marketing-image-library]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/vitrine/admin/marketing/marketing-image-library.css?v=marketing-image-bank-v1';link.dataset.daMarketingImageLibrary='1';document.head.appendChild(link)}

export function openMarketingImageBank({onSelect,selectedId=null}={}){
  ensureCss();
  const dialog=document.createElement('dialog');dialog.className='marketing-image-bank-dialog';
  dialog.innerHTML=`<div class="marketing-image-bank-head"><div><strong>Banco de imagens</strong><p>Imagens das cestas já usadas na vitrine. Selecione uma para o template.</p></div><button type="button" aria-label="Fechar" data-image-bank-close>×</button></div><div class="marketing-image-bank-grid">${MARKETING_IMAGE_LIBRARY.map(image=>`<button type="button" class="marketing-image-bank-card" data-image-id="${image.id}" aria-pressed="${image.id===selectedId?'true':'false'}"><img src="${image.src}" alt="${esc(image.name)}" loading="lazy"><span>${esc(image.name)}</span><b>Usar imagem</b></button>`).join('')}</div>`;
  dialog.querySelector('[data-image-bank-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.querySelectorAll('[data-image-id]').forEach(button=>button.addEventListener('click',()=>{const image=MARKETING_IMAGE_LIBRARY.find(item=>item.id===button.dataset.imageId);if(image)onSelect?.(image);dialog.close()}));
  document.body.appendChild(dialog);dialog.showModal();return dialog;
}

export function stageMarketingImage(image){if(!MARKETING_IMAGE_LIBRARY.some(item=>item.id===image?.id))return false;try{sessionStorage.setItem(STAGED_IMAGE_KEY,image.id);return true}catch{return false}}
export function getStagedMarketingImage(){try{return MARKETING_IMAGE_LIBRARY.find(item=>item.id===sessionStorage.getItem(STAGED_IMAGE_KEY))||null}catch{return null}}
export function clearStagedMarketingImage(){try{sessionStorage.removeItem(STAGED_IMAGE_KEY)}catch{}}

export async function createMarketingImageFile(image){
  const asset=MARKETING_IMAGE_LIBRARY.find(item=>item.id===image?.id);
  if(!asset)throw new Error('marketing_image_not_in_library');
  const response=await fetch(asset.src,{cache:'force-cache'});
  if(!response.ok)throw new Error(`marketing_image_load_${response.status}`);
  const blob=await response.blob();
  const bitmap=await createImageBitmap(blob);
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');if(!context){bitmap.close();throw new Error('marketing_image_conversion_failed')}
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('marketing_image_conversion_failed')),'image/jpeg',.9));
  return new File([jpeg],`${asset.id}.jpg`,{type:'image/jpeg'});
}

export async function uploadMarketingTemplateMedia(accountId,file){
  if(!accountId||!(file instanceof File))throw new Error('invalid_upload_payload');
  if(!['image/jpeg','image/png','video/mp4'].includes(file.type))throw new Error('unsupported_media_type');
  if(!file.size||file.size>18*1024*1024)throw new Error('media_size_out_of_range');
  const form=new FormData();form.append('account_id',String(accountId));form.append('file',file,file.name||'marketing-media');
  const url=new URL(MEDIA_API);url.searchParams.set('action','upload_media');
  const response=await attendanceAuthorizedFetch(url,{method:'POST',headers:{apikey:ADMIN_PUBLIC_KEY},body:form,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok===false){const error=new Error(data?.error||`media_upload_${response.status}`);error.payload=data;throw error}
  if(!data.handle)throw new Error('meta_media_handle_missing');
  return data;
}

window.DAMarketingImageLibrary={images:MARKETING_IMAGE_LIBRARY,open:openMarketingImageBank,stage:stageMarketingImage,getStaged:getStagedMarketingImage,clear:clearStagedMarketingImage,createFile:createMarketingImageFile,upload:uploadMarketingTemplateMedia};
