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
async function verifyImageSignature(file){
 if(typeof file?.slice!=='function')throw Error('Arquivo não é uma fotografia válida.');
 const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const jpeg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x);
 const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!((file.type==='image/jpeg'&&jpeg)||(file.type==='image/png'&&png)||(file.type==='image/webp'&&webp)))
  throw Error('Conteúdo da fotografia não corresponde ao formato informado.');
 return true;
}
async function sha256(file){
 if(!root.crypto?.subtle)throw Error('A conexão HTTPS é necessária para validar a foto.');
 const d=await root.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(d),x=>x.toString(16).padStart(2,'0')).join('');
}
async function uploadSigned({signed_url,file}){
 const u=new URL(String(signed_url||''));
 const official=u.protocol==='https:'&&u.hostname==='ssbesxgaijknwsjbsbcz.supabase.co'&&u.port==='';
 // Integração local descartável para testes: somente o próprio localhost/porta.
 // Em produção, location não é localhost e o destino permanece restrito ao projeto canônico.
 const location=root.location;
 const local=location&&['127.0.0.1','localhost'].includes(location.hostname)
  &&u.hostname===location.hostname&&u.host===location.host&&u.protocol==='http:';
 if(!(official||local)||
  !u.pathname.startsWith('/storage/v1/object/upload/sign/inventory-label-photos/')||
  !u.searchParams.get('token'))
  throw Error('Endereço de upload inválido');
 // O Storage JS envia arquivos Blob em multipart PUT, com cacheControl; siga o mesmo contrato.
 const form=new FormData();
 form.append('cacheControl','3600');
 form.append('',file);
 const r=await fetch(u.toString(),{method:'PUT',headers:{'x-upsert':'false'},body:form});
 if(!r.ok)throw Error('Armazenamento não confirmou o upload (HTTP '+r.status+').');
}
async function submit(files,services,options={}){
 const selected=validate(files);
 for(const key of ['createBatch','reserve','confirm'])
  if(typeof services?.[key]!=='function')throw Error('Integração incompleta: '+key);
 const state={batch_id:null,total:selected.length,uploaded:0,failed:0,duplicates:0,items:[]};
 const report=()=>services.onProgress?.({...state,items:state.items.map(x=>({...x}))});
 let batchId=options?.batch_id||null;
 if(batchId!==null&&!/^[0-9a-f-]{36}$/i.test(String(batchId)))
  throw Error('Identificador do lote inválido.');
 if(!batchId){
  const batch=await services.createBatch({total_files:selected.length});
  if(!batch?.batch_id)throw Error('Servidor não confirmou a criação do lote.');
  batchId=batch.batch_id;
 }
 state.batch_id=batchId;report();
 for(const file of selected){
  const item={file_name:file.name,status:'hashing'};state.items.push(item);report();
  try{
   await (services.inspect||verifyImageSignature)(file);
   const hash=await (services.hash||sha256)(file);
   if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Hash inválido');
   item.status='reserving';report();
   const reservation=await services.reserve({batch_id:state.batch_id,file_name:file.name,mime_type:file.type,size_bytes:file.size,sha256:hash});
   if(reservation?.duplicate){item.status='duplicate';state.duplicates++;report();continue}
   if(!reservation?.photo_id||(!reservation?.signed_url&&!reservation?.needs_confirmation))
    throw Error('Servidor não autorizou o upload.');
   if(!reservation.needs_confirmation){
    item.status='uploading';report();
    await (services.upload||uploadSigned)({signed_url:reservation.signed_url,file});
   }
   item.status='confirming';report();
   const ack=await services.confirm({photo_id:reservation.photo_id,sha256:hash});
   if(ack?.queued!==true)throw Error('Arquivo enviado, mas ainda não confirmado pelo servidor.');
   item.status='queued';state.uploaded++;
  }catch(e){item.status='error';item.error=String(e?.message||e).slice(0,200);state.failed++}
  report();
 }
 return state;
}
root.DonaAntoniaLabelUpload={validate,verifyImageSignature,sha256,uploadSigned,submit,version:'DA6-R3'};
})(typeof globalThis!=='undefined'?globalThis:this);
