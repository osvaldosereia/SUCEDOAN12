/* DA6 — QR da etiqueta + marcações OMR, determinístico. */
(function(root){
'use strict';
function parseQR(raw){
 const match=/^DA6\|([0-9A-Z]{25})\|([0-9A-F]{10})$/.exec(String(raw||'').trim().toUpperCase());
 if(!match)throw Error('invalid_label_qr');
 let n=0n;for(const c of match[1])n=n*36n+BigInt(parseInt(c,36));
 if(n>=(1n<<128n))throw Error('invalid_product_id');
 const hex=n.toString(16).padStart(32,'0');
 return {product_id:[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'),label_serial:match[2]};
}
function process(img,qrDecoder,omrReader,threshold=105){
 if(typeof qrDecoder!=='function'||typeof omrReader!=='function')throw Error('decoder_required');
 const corners=root.DonaAntoniaPhotoMarkers.findMarkers(img,threshold);
 const warp=root.DonaAntoniaPhotoGeometry.warp;
 let selected=null;
 for(let orientation=0;orientation<4;orientation++){
  const points=corners.map((_,i)=>corners[(i+orientation)%4]);
  const preview=warp(img,points,500,750);
  const qr=qrDecoder(preview.data,500,750,{inversionAttempts:'attemptBoth'});
  if(!qr)continue;
  let identity;try{identity=parseQR(qr.data)}catch{continue}
  const loc=qr.location;
  if(!loc)continue;
  const positions=[loc.topLeftCorner,loc.topRightCorner,loc.bottomRightCorner,loc.bottomLeftCorner].filter(Boolean);
  if(positions.length!==4)continue;
  const x=positions.reduce((sum,p)=>sum+p.x,0)/4;
  const y=positions.reduce((sum,p)=>sum+p.y,0)/4;
  if(x<275||y>315)continue;
  selected={points,identity,orientation};break;
 }
 if(!selected)throw Error('label_qr_not_found');
 const rectified=warp(img,selected.points);
 const marks=omrReader(rectified);
 return {...selected.identity,readings:marks.readings||[],errors:marks.errors||[],
   needs_review:!!marks.needs_review||!marks.readings?.length,geometry:'DA6-100x150-v1'};
}
root.DonaAntoniaPhotoReader={parseQR,process};
})(typeof window==='undefined'?globalThis:window);
