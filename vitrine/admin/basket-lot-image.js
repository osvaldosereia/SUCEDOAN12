/* Real product photographs and deterministic unit tags; AI generates only the scene. */
window.BasketLotImage={
  layout(count,size=768){
    const cols=count<=6?3:count<=16?4:6,rows=Math.ceil(count/cols);
    const margin=size*.045,top=size*.12,bottom=size*.07;
    const w=(size-margin*2)/cols,h=(size-top-bottom)/rows;
    return Array.from({length:count},(_,i)=>({x:margin+(i%cols)*w,y:top+Math.floor(i/cols)*h,w,h}));
  },
  async load(url){const image=new Image();image.src=url;await image.decode();return image},
  productCanvas(image){
    const c=document.createElement('canvas');const scale=Math.min(1,256/Math.max(image.naturalWidth,image.naturalHeight));
    c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);
    // Remove only a uniform pale background connected to the image borders.
    // Non-uniform source photographs are retained intact for operator review.
    const d=ctx.getImageData(0,0,c.width,c.height),a=d.data,w=c.width,h=c.height;
    const corners=[0,w-1,w*(h-1),w*h-1];
    const pale=p=>a[p*4+3]<10||(Math.min(a[p*4],a[p*4+1],a[p*4+2])>215&&Math.max(a[p*4],a[p*4+1],a[p*4+2])-Math.min(a[p*4],a[p*4+1],a[p*4+2])<18);
    if(corners.every(pale)){
      const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let n=0;
      const add=p=>{if(!seen[p]&&pale(p)){seen[p]=1;queue[n++]=p}};
      for(let x=0;x<w;x++){add(x);add((h-1)*w+x)}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1)}
      for(let i=0;i<n;i++){const p=queue[i],x=p%w,y=Math.floor(p/w);a[p*4+3]=0;if(x)add(p-1);if(x<w-1)add(p+1);if(y)add(p-w);if(y<h-1)add(p+w)}
      ctx.putImageData(d,0,0);
    }
    return c;
  },
  async render(assets,size=768){
    const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');
    const scene=await this.load(assets.scene);ctx.drawImage(scene,0,0,size,size);
    const slots=this.layout(assets.items.length,size);let i=0;
    for(const item of assets.items){
      const slot=slots[i++],image=this.productCanvas(await this.load(item.data_url));
      const maxW=slot.w*.77,maxH=slot.h*.72,scale=Math.min(maxW/image.width,maxH/image.height);
      const w=image.width*scale,h=image.height*scale,x=slot.x+(slot.w-w)/2,y=slot.y+slot.h*.73-h;
      ctx.save();ctx.fillStyle='rgba(40,30,20,.16)';ctx.filter='blur(4px)';ctx.beginPath();ctx.ellipse(x+w/2,y+h+2,w*.45,Math.max(3,slot.h*.025),0,0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.drawImage(image,x,y,w,h);
      const label=item.quantity+' un.',font=Math.max(15,Math.round(size*.022));ctx.font='bold '+font+'px Arial';
      const tagW=ctx.measureText(label).width+18,tagH=font+12,tagX=slot.x+(slot.w-tagW)/2,tagY=slot.y+slot.h*.76;
      ctx.fillStyle='#176a43';ctx.beginPath();ctx.roundRect(tagX,tagY,tagW,tagH,7);ctx.fill();
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,tagX+tagW/2,tagY+tagH/2);
    }
    ctx.font=Math.max(12,Math.round(size*.019))+'px Arial';ctx.fillStyle='#17372c';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('Quantidades por cesta indicadas nas etiquetas.',size/2,size*.97);
    return c;
  },
  async compress(canvas,maxBytes=50000){
    for(const width of [768,640,512]){
      const c=document.createElement('canvas');c.width=c.height=width;c.getContext('2d').drawImage(canvas,0,0,width,width);
      for(const quality of [.78,.66,.54,.42]){
        const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',quality));
        if(!blob||blob.type!=='image/webp')throw new Error('Este navegador não permite exportar WebP.');
        if(blob.size<=maxBytes)return {blob,width};
      }
    }
    throw new Error('Não foi possível manter a imagem abaixo de 50 KB com qualidade legível.');
  },
  async base64(blob){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob)})},
  error(e){
    const value=String(e?.message||e),messages={hygiene_lot_required:'Selecione o lote de limpeza e higiene.',product_image_unavailable:'Uma foto não pôde ser carregada. Confira as fotos dos produtos.',composition_changed:'A composição ou as fotos mudaram. Gere uma nova prévia.',openai_key_missing:'O serviço de imagem ainda não está configurado.',generation_attempt_limit:'Limite de três tentativas atingido. Confira o erro antes de continuar.',generation_interrupted:'A geração foi interrompida. Você pode tentar novamente.',lot_not_mounted:'Confirme a montagem antes de gerar a imagem.',invalid_unit_quantity:'As etiquetas exigem quantidade inteira por produto.'};
    return messages[value]||(value.startsWith('product_image_missing')?'Há produto sem foto. Cadastre a foto antes de gerar.':value.startsWith('openai_http')?'O provedor não conseguiu gerar o cenário. Tente novamente mais tarde.':'Não foi possível concluir a imagem. '+value);
  },
  async open(lotId,api,esc){
    const $=s=>document.querySelector(s),session=Symbol();this.session=session;
    const active=()=>this.session===session&&$('#editor').open;
    $('#editor').addEventListener('close',()=>{if(this.session===session&&!$('#editor').open)this.session=null},{once:true});
    const close=()=>{$('#editor').close();this.session=null};
    $('#editorTitle').textContent='Imagem do lote';$('#editorBody').innerHTML='<p>Carregando composição…</p>';
    $('#editorActions').innerHTML='<button class="secondary" id="lotImageClose" type="button">Fechar</button>';$('#lotImageClose').onclick=close;
    if(!$('#editor').open)$('#editor').showModal();
    let context;try{context=await api('context',{lot_id:lotId})}catch(e){if(active())$('#editorBody').textContent=this.error(e);return}
    if(!active())return;
    $('#editorBody').innerHTML='<p>Uma foto de cada produto, com quantidade por cesta na etiqueta. Confira as embalagens antes de usar no site.</p>'+
      (context.needs_hygiene?'<label>Incluir limpeza e higiene<select id="lotImageHygiene">'+(context.hygiene_lots||[]).map(h=>'<option value="'+esc(h.id)+'">'+esc(h.short_code)+(h.sale_enabled?' · ativo no site':' · fora do site')+'</option>').join('')+'</select></label>':'')+
      '<div id="lotImageProgress" class="sub" role="status" aria-live="polite"></div><div id="lotImagePreview"></div><p class="sub">WebP quadrado, até 50 KB. Gerar a imagem não altera estoque nem ativa a venda.</p>';
    $('#editorActions').innerHTML='<button class="secondary" id="lotImageClose" type="button">Fechar</button><button class="primary" id="lotImageStart" type="button">Gerar prévia</button><button class="primary" id="lotImagePublish" type="button" hidden>Usar imagem no site</button>';
    $('#lotImageClose').onclick=close;
    const progress=$('#lotImageProgress'),start=$('#lotImageStart'),publish=$('#lotImagePublish');
    const show=job=>{
      if(!active())return;
      $('#lotImagePreview').innerHTML=job.image_url?'<img src="'+esc(job.image_url)+'" alt="Prévia da composição do lote" style="display:block;width:100%;max-width:520px;aspect-ratio:1;object-fit:contain;margin:12px auto;border-radius:12px"><ul>'+job.manifest.map(x=>'<li>'+esc(x.quantity)+' un. · '+esc(x.name)+'</li>').join('')+'</ul>':'';
      progress.textContent=job.status==='published'?'Imagem aprovada. O site a usará quando oferecer esta composição.':job.status==='preview'?'Prévia pronta · '+(Number(job.byte_size)/1000).toFixed(1)+' KB · '+job.width+' × '+job.width+' px. Confira os produtos e as etiquetas.':'';
      publish.hidden=job.status!=='preview';start.hidden=false;start.textContent=['preview','published'].includes(job.status)?'Gerar ou retomar prévia':'Gerar prévia';
      publish.onclick=async()=>{publish.disabled=true;start.disabled=true;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=true;try{const data=await api('publish',{job_id:job.id});show(data.job)}catch(e){if(active())progress.textContent=this.error(e)}finally{if(active()){publish.disabled=false;start.disabled=false;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=false}}};
    };
    const process=async job=>{
      start.disabled=true;publish.hidden=true;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=true;
      try{
        const deadline=Date.now()+260000;
        while(job.status==='generating'){
          if(!active())return;progress.textContent='Gerando cenário. Você pode fechar e retomar a prévia depois.';
          if(Date.now()>deadline)throw new Error('generation_interrupted');
          await new Promise(resolve=>setTimeout(resolve,3000));if(!active())return;
          job=(await api('status',{job_id:job.id})).job;
        }
        if(!active())return;if(job.status==='failed')throw new Error(job.error);
        if(job.status==='scene_ready'){
          progress.textContent='Montando produtos, aplicando etiquetas e compactando…';
          const assets=await api('assets',{job_id:job.id});if(!active())return;
          const canvas=await this.render(assets),result=await this.compress(canvas);if(!active())return;
          job=(await api('save_preview',{job_id:job.id,width:result.width,image_base64:await this.base64(result.blob)})).job;
        }
        show(job);
      }catch(e){if(active())progress.textContent=this.error(e)}finally{if(active()){start.disabled=false;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=false}}
    };
    start.onclick=async()=>{start.disabled=true;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=true;progress.textContent='Preparando composição…';try{const data=await api('start',{lot_id:lotId,hygiene_lot_id:$('#lotImageHygiene')?.value||null});if(active())await process(data.job)}catch(e){if(active())progress.textContent=this.error(e)}finally{if(active()){start.disabled=false;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=false}}};
    const restore=async()=>{
      const selected=$('#lotImageHygiene')?.value||null,previous=(context.jobs||[]).find(j=>(j.hygiene_lot_id||null)===selected);
      start.hidden=false;publish.hidden=true;$('#lotImagePreview').innerHTML='';progress.textContent='';
      if(previous){start.disabled=true;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=true;try{const d=await api('status',{job_id:previous.id});if(active())await process(d.job)}catch(e){if(active())progress.textContent=this.error(e)}finally{if(active()){start.disabled=false;if($('#lotImageHygiene'))$('#lotImageHygiene').disabled=false}}}
    };
    if(context.needs_hygiene&&!(context.hygiene_lots||[]).length){start.disabled=true;progress.textContent='Monte um lote de limpeza e higiene antes de gerar a imagem completa.'}
    else{if($('#lotImageHygiene'))$('#lotImageHygiene').onchange=restore;await restore()}
  }
};

