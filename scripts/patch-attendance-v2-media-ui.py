from pathlib import Path

js_path=Path('vitrine/admin/atendimento/attendance.js')
css_path=Path('vitrine/admin/atendimento/attendance.css')
js=js_path.read_text()
old="function renderMessage(msg){const row=document.createElement('div');row.className=`message-row ${msg.direction==='outbound'?'outbound':'inbound'}`;const bubble=document.createElement('div');bubble.className='bubble';if(msg.message_type==='text'&&msg.text_body)bubble.textContent=msg.text_body;else{const holder=document.createElement('span');holder.className='media-placeholder';holder.textContent={audio:'🎤 Áudio',image:'🖼 Imagem',document:'📄 Documento'}[msg.message_type]||`Mensagem ${msg.message_type||'não suportada'}`;bubble.append(holder)}const meta=document.createElement('span');meta.className='message-meta';meta.textContent=fmtTime(msg.message_at);bubble.append(meta);row.append(bubble);return row}"
new=r'''async function resolveMedia(messageId){return await api('media',{message_id:messageId})}
function openImageViewer(url,alt='Imagem recebida'){
  const viewer=document.createElement('div');viewer.className='media-viewer';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');
  const frame=document.createElement('div');frame.className='media-viewer-frame';const close=document.createElement('button');close.type='button';close.className='media-viewer-close';close.textContent='×';close.setAttribute('aria-label','Fechar imagem');
  const img=document.createElement('img');img.src=url;img.alt=alt;frame.append(close,img);viewer.append(frame);document.body.append(viewer);
  const finish=()=>viewer.remove();close.addEventListener('click',finish);viewer.addEventListener('click',e=>{if(e.target===viewer)finish()});
}
function mediaUnavailable(holder){holder.className='media-unavailable';holder.textContent='Mídia indisponível'}
function renderMediaMessage(msg){
  const holder=document.createElement('div');holder.className='media-content';holder.textContent='Carregando mídia…';const conversationId=state.selected?.id;
  resolveMedia(msg.id).then(data=>{
    if(!holder.isConnected||state.selected?.id!==conversationId)return;holder.replaceChildren();
    if(msg.message_type==='image'){
      const img=document.createElement('img');img.className='message-media-image';img.src=data.url;img.alt=msg.text_body||'Imagem recebida';img.loading='lazy';img.addEventListener('click',()=>openImageViewer(data.url,img.alt));holder.append(img);
    }else if(msg.message_type==='audio'){
      const audio=document.createElement('audio');audio.className='message-audio';audio.controls=true;audio.preload='none';audio.src=data.url;holder.append(audio);
    }else if(msg.message_type==='document'){
      const file=document.createElement('div');file.className='media-file';const name=document.createElement('span');name.className='media-file-name';name.textContent=data.filename||msg.metadata?.media?.filename||'Arquivo';
      const actions=document.createElement('span');actions.className='media-file-actions';const open=document.createElement('a');open.href=data.url;open.target='_blank';open.rel='noopener noreferrer';open.textContent='Abrir';const download=document.createElement('a');download.href=data.url;download.download=data.filename||'arquivo';download.textContent='Baixar';actions.append(open,download);file.append(name,actions);holder.append(file);
    }else mediaUnavailable(holder);
    if(msg.text_body&&msg.message_type!=='audio'){const caption=document.createElement('div');caption.className='media-caption';caption.textContent=msg.text_body;holder.append(caption)}
  }).catch(()=>{if(holder.isConnected&&state.selected?.id===conversationId)mediaUnavailable(holder)});
  return holder;
}
function renderLocationMessage(msg){
  const loc=msg.metadata?.location||{};const latitude=Number(loc.latitude),longitude=Number(loc.longitude);const card=document.createElement('div');card.className='location-card';
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){mediaUnavailable(card);return card}
  const mapUrl=`https://www.google.com/maps?q=${latitude},${longitude}`;const title=document.createElement('strong');title.textContent=loc.name||'Localização compartilhada';card.append(title);
  if(loc.address){const address=document.createElement('span');address.textContent=loc.address;card.append(address)}const coords=document.createElement('small');coords.textContent=`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;card.append(coords);
  const actions=document.createElement('div');actions.className='location-actions';const open=document.createElement('a');open.href=mapUrl;open.target='_blank';open.rel='noopener noreferrer';open.textContent='Abrir no mapa';
  const copy=document.createElement('button');copy.type='button';copy.textContent='Copiar localização';copy.addEventListener('click',()=>navigator.clipboard?.writeText(`${latitude},${longitude}`).catch(()=>{}));
  const share=document.createElement('button');share.type='button';share.textContent='Compartilhar link';share.addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({url:mapUrl,title:loc.name||'Localização'});else await navigator.clipboard?.writeText(mapUrl)}catch{}});actions.append(open,copy,share);card.append(actions);return card;
}
function renderMessage(msg){const row=document.createElement('div');row.className=`message-row ${msg.direction==='outbound'?'outbound':'inbound'}`;const bubble=document.createElement('div');bubble.className='bubble';if(msg.message_type==='text'&&msg.text_body)bubble.textContent=msg.text_body;else if(msg.message_type==='location')bubble.append(renderLocationMessage(msg));else if(['image','audio','document'].includes(msg.message_type))bubble.append(renderMediaMessage(msg));else{const holder=document.createElement('span');holder.className='media-placeholder';holder.textContent=`Mensagem ${msg.message_type||'não suportada'}`;bubble.append(holder)}const meta=document.createElement('span');meta.className='message-meta';meta.textContent=fmtTime(msg.message_at);bubble.append(meta);row.append(bubble);return row}'''
if old not in js: raise SystemExit('renderMessage baseline not found')
js=js.replace(old,new)
js_path.write_text(js)

css=css_path.read_text()
styles='''.media-content{max-width:100%;display:grid;gap:6px}.message-media-image{display:block;max-width:100%;max-height:360px;border-radius:9px;object-fit:contain;cursor:zoom-in;background:#eef1f4}.message-audio{display:block;width:min(320px,100%);max-width:100%}.media-file{max-width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px;border:1px solid #d0d5dd;border-radius:8px;background:#f8fafc}.media-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:650}.media-file-actions{display:flex;gap:7px;flex-shrink:0}.media-file-actions a,.location-actions a,.location-actions button{border:1px solid #d0d5dd;border-radius:7px;background:#fff;color:#344054;padding:5px 7px;text-decoration:none;font-size:10px;cursor:pointer}.media-caption{font-size:12px;white-space:pre-wrap}.media-unavailable{max-width:100%;padding:8px;border:1px dashed #d0d5dd;border-radius:8px;color:#667085;font-size:11px}.location-card{max-width:100%;display:grid;gap:5px;min-width:min(300px,70vw);padding:9px;border:1px solid #d0d5dd;border-radius:9px;background:#f8fafc}.location-card strong{font-size:12px}.location-card span,.location-card small{font-size:10px;color:#667085}.location-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}.media-viewer{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:#101828cc}.media-viewer-frame{position:relative;max-width:min(1100px,96vw);max-height:94vh}.media-viewer-frame img{display:block;max-width:100%;max-height:90vh;object-fit:contain;border-radius:10px}.media-viewer-close{position:absolute;right:-10px;top:-14px;width:34px;height:34px;border:0;border-radius:99px;background:#fff;color:#344054;font-size:24px;cursor:pointer;box-shadow:0 3px 12px #0003}
'''
if '.message-media-image{' not in css: css=css+'\n'+styles
css_path.write_text(css)
print('patched attendance media ui')
