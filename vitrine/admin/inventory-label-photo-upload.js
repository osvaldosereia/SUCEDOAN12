/* DA6 — envio seguro de fotos, sem IA. O navegador só pode encerrar após todas as confirmações de upload. */
(function(root){
'use strict';
const TYPES=new Set(['image/jpeg','image/png','image/webp']);
const MAX_FILES=100,MAX_BYTES=10*1024*1024;
function validate(files){
 const selected=Array.from(files||[]);
 if(!selected.length||selected.length>MAX_FILES)throw Error('Selecione entre 1 e 100 fotos.');
 for(const f of selected){
  if(!TYPES.has(f.type))throw Error('Formato não permitido: '+f.name);
  if(!Number.isFinite(f.size)||f.size<1||f.size>MAX_BYTES)throw Error('Foto vazia ou maior que 10 MB: '+f.name);
 }
 return selected;
}
async function sha256(file){
 if(!root.crypto?.subtle)throw Error('A conexão HTTPS é necessária para validar a foto.');
 const d=await root.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(d),x=>x.toString(16).padStart(2,'0')).join('');
}
async function uploadSigned({signed_url,file}){
 if(!/^https:\/\//i.test(String(signed_url||'')))throw Error('Endereço de upload inválido');
 const r=await fetch(signed_url,{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
 if(!r.ok)throw Error('Armazenamento não confirmou o upload (HTTP '+r.status+').');
}
async function submit(files,services){
 const selected=validate(files);
 for(const key of ['createBatch','reserve','confirm'])
  if(typeof services?.[key]!=='function')throw Error('Integração incompleta: '+key);
 const state={batch_id:null,total:selected.length,uploaded:0,failed:0,duplicates:0,items:[]};
 const report=()=>services.onProgress?.({...state,items:state.items.map(x=>({...x}))});
 const batch=await services.createBatch({total_files:selected.length});
 if(!batch?.batch_id)throw Error('Servidor não confirmou a criação do lote.');
 state.batch_id=batch.batch_id;
 for(const file of selected){
  const item={file_name:file.name,status:'hashing'};state.items.push(item);report();
  try{
   const hash=await (services.hash||sha256)(file);
   if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Hash inválido');
   item.status='reserving';report();
   const reservation=await services.reserve({batch_id:state.batch_id,file_name:file.name,mime_type:file.type,size_bytes:file.size,sha256:hash});
   if(reservation?.duplicate){item.status='duplicate';state.duplicates++;report();continue}
   if(!reservation?.photo_id||!reservation?.signed_url)throw Error('Servidor não autorizou o upload.');
   item.status='uploading';report();
   await (services.upload||uploadSigned)({signed_url:reservation.signed_url,file});
   item.status='confirming';report();
   const ack=await services.confirm({photo_id:reservation.photo_id,sha256:hash});
   if(ack?.queued!==true)throw Error('Arquivo enviado, mas ainda não confirmado pelo servidor.');
   item.status='queued';state.uploaded++;
  }catch(e){item.status='error';item.error=String(e?.message||e).slice(0,200);state.failed++}
  report();
 }
 return state;
}
root.DonaAntoniaLabelUpload={validate,sha256,uploadSigned,submit,version:'DA6'};
})(typeof globalThis!=='undefined'?globalThis:this);
