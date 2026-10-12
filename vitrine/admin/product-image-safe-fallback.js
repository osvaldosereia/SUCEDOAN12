/* Fallback fiel para foto de produto: somente reenquadramento, sem recriar embalagem. */
(function(){
  'use strict';
  const WIDTH=816;
  const BG='#ECECEC';
  const MAX_BYTES=6*1024*1024;

  async function prepare(originalUrl){
    const url=new URL(String(originalUrl||''),location.href);
    if(url.protocol!=='https:'||url.hostname!=='ssbesxgaijknwsjbsbcz.supabase.co'
       ||!url.pathname.startsWith('/storage/v1/object/public/product-images/')){
      throw new Error('Imagem original fora do armazenamento autorizado.');
    }
    const response=await fetch(url.href,{mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Não foi possível abrir a foto original (HTTP '+response.status+').');
    const input=await response.blob();
    if(!input.size||input.size>MAX_BYTES||!['image/png','image/jpeg','image/webp'].includes(input.type)){
      throw new Error('Foto original inválida para o reenquadramento seguro.');
    }
    const bitmap=await createImageBitmap(input);
    try{
      if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>36_000_000){
        throw new Error('Dimensões inválidas da foto original.');
      }
      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=WIDTH;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('O navegador não conseguiu preparar a imagem.');
      ctx.fillStyle=BG;
      ctx.fillRect(0,0,WIDTH,WIDTH);
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      // Jamais recortar ou remover pixels da embalagem: preservar 100% da foto.
      const scale=Math.min(WIDTH*0.8/bitmap.width,WIDTH*0.8/bitmap.height);
      const w=bitmap.width*scale,h=bitmap.height*scale;
      ctx.drawImage(bitmap,(WIDTH-w)/2,(WIDTH-h)/2,w,h);
      const output=await new Promise((resolve,reject)=>{
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao criar a imagem de catálogo.')),'image/jpeg',0.93);
      });
      if(output.size>MAX_BYTES)throw new Error('Imagem padronizada excede 6 MB.');
      return new File([output],'produto-padronizado-fiel.jpg',{type:'image/jpeg'});
    }finally{
      bitmap.close?.();
    }
  }
  window.DonaAntoniaProductImageSafe={prepare};
})();
