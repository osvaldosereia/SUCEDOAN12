  function inventorySheetWithTimeout(promise,ms,message){
    let timer=null;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms)});
    return Promise.race([promise,timeout]).finally(()=>{if(timer)clearTimeout(timer)});
  }

  function inventorySheetLoadScript(id,src){
    const existing=document.getElementById(id);
    if(existing?.dataset?.ready==='1')return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let script=existing;
      let finished=false;
      const cleanup=()=>{
        if(timer)clearTimeout(timer);
        script?.removeEventListener?.('load',onload);
        script?.removeEventListener?.('error',onerror);
      };
      const done=()=>{if(finished)return;finished=true;if(script)script.dataset.ready='1';cleanup();resolve()};
      const fail=(error)=>{if(finished)return;finished=true;cleanup();if(script&&script.dataset.ready!=='1')script.remove();reject(error)};
      const onload=()=>done();
      const onerror=()=>fail(new Error('Falha ao carregar '+id));
      const timer=setTimeout(()=>fail(new Error('Tempo limite ao carregar '+id)),INVENTORY_SCRIPT_TIMEOUT_MS);
      if(!script){
        script=document.createElement('script');script.id=id;script.src=src;script.async=true;
        document.head.appendChild(script);
      }
      script.addEventListener('load',onload,{once:true});
      script.addEventListener('error',onerror,{once:true});
      if(script.dataset.ready==='1')done();
    });
  }


  async function inventorySheetFileCanvas(file,maxSide=1800){
    let bitmap=null,img=null,url='';
    try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})}catch{}
    if(!bitmap){
      url=URL.createObjectURL(file);
      img=await new Promise((resolve,reject)=>{
        const el=new Image();
        el.onload=()=>resolve(el);
        el.onerror=()=>reject(new Error('Não consegui abrir esta imagem no celular.'));
        el.src=url;
      });
    }
    try{
      const sw=bitmap?.width||img.naturalWidth,sh=bitmap?.height||img.naturalHeight;
      if(!sw||!sh)throw new Error('A imagem está vazia ou em formato incompatível.');
      const scale=Math.min(1,maxSide/Math.max(sw,sh)),cw=Math.max(1,Math.round(sw*scale)),ch=Math.max(1,Math.round(sh*scale));
      const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
      const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);ctx.drawImage(bitmap||img,0,0,cw,ch);
      return canvas;
    }finally{
      bitmap?.close?.();if(url)URL.revokeObjectURL(url);
    }
  }

  async function inventorySheetOpenCv(){
    if(inventorySheetCvPromise)return inventorySheetCvPromise;
    inventorySheetCvPromise=(async()=>{
      await inventorySheetLoadScript('inventoryOpenCv','https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js');
      let lib=window.cv;
      if(lib instanceof Promise)lib=await lib;
      for(let i=0;i<200&&!(lib&&lib.Mat);i++){await new Promise(r=>setTimeout(r,25));lib=window.cv;if(lib instanceof Promise)lib=await lib}
      if(!(lib&&lib.Mat))throw new Error('OpenCV local não iniciou.');
      return lib;
    })();
    return inventorySheetCvPromise;
  }

  async function inventorySheetOcrWorkers(){
    if(state.inventorySheetOcrWorkers)return state.inventorySheetOcrWorkers;
    if(inventorySheetTesseractPromise)return inventorySheetTesseractPromise;
    inventorySheetTesseractPromise=(async()=>{
      await inventorySheetLoadScript('inventoryTesseract','https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js');
      if(!window.Tesseract?.createWorker)throw new Error('OCR local não iniciou.');
      const workers=[];
      for(let i=0;i<2;i++){
        const w=await window.Tesseract.createWorker('eng',1);
        await w.setParameters({
          tessedit_char_whitelist:'0123456789',
          tessedit_pageseg_mode:window.Tesseract.PSM.SINGLE_WORD,
          user_defined_dpi:'300'
        });
        workers.push(w);
      }
      state.inventorySheetOcrWorkers=workers;
      return workers;
    })();
    try{return await inventorySheetTesseractPromise}finally{inventorySheetTesseractPromise=null}
  }

  function inventorySheetOrderCorners(points){
    const sums=points.map((p,i)=>({i,v:p.x+p.y})),diffs=points.map((p,i)=>({i,v:p.y-p.x}));
    const tl=points[sums.reduce((a,b)=>a.v<b.v?a:b).i],br=points[sums.reduce((a,b)=>a.v>b.v?a:b).i];
    const tr=points[diffs.reduce((a,b)=>a.v<b.v?a:b).i],bl=points[diffs.reduce((a,b)=>a.v>b.v?a:b).i];
    return [tl,tr,br,bl];
  }

  async function inventorySheetWarpPage(file,sourceCanvas=null){
    const cv=await inventorySheetOpenCv();
    const input=sourceCanvas||await inventorySheetFileCanvas(file,1800);
    const cw=input.width,ch=input.height;
    const src=cv.imread(input),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();
    let best=null,bestArea=0;
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY,0);
      cv.GaussianBlur(gray,blur,new cv.Size(5,5),0,0,cv.BORDER_DEFAULT);
      cv.Canny(blur,edges,45,140,3,false);
      cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
      const imageArea=cw*ch;
      for(let i=0;i<contours.size();i++){
        const cnt=contours.get(i),peri=cv.arcLength(cnt,true),approx=new cv.Mat();
        try{
          cv.approxPolyDP(cnt,approx,0.02*peri,true);
          if(approx.rows!==4)continue;
          const area=Math.abs(cv.contourArea(approx));
          if(area<imageArea*.28||area<=bestArea)continue;
          const pts=[];
          for(let r=0;r<4;r++){const p=approx.intPtr(r,0);pts.push({x:p[0],y:p[1]})}
          best=inventorySheetOrderCorners(pts);bestArea=area;
        }finally{approx.delete();cnt.delete()}
      }
      if(!best)throw new Error('Não consegui localizar as quatro bordas da folha. Tire a foto com a folha inteira visível e fundo contrastante.');
      const outW=1260,outH=1782;
      const srcPts=cv.matFromArray(4,1,cv.CV_32FC2,best.flatMap(p=>[p.x,p.y]));
      const dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,outW-1,0,outW-1,outH-1,0,outH-1]);
      const M=cv.getPerspectiveTransform(srcPts,dstPts),dst=new cv.Mat();
      try{
        cv.warpPerspective(src,dst,M,new cv.Size(outW,outH),cv.INTER_CUBIC,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));
        const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;cv.imshow(canvas,dst);
        const ratio=bestArea/(cw*ch),confidence=Math.max(.90,Math.min(.99,.90+(ratio-.28)*.12));
        return {canvas,confidence};
      }finally{srcPts.delete();dstPts.delete();M.delete();dst.delete()}
    }finally{src.delete();gray.delete();blur.delete();edges.delete();contours.delete();hierarchy.delete()}
  }

  function inventorySheetFieldCrop(pageCanvas,slot,field){
    const row=Math.floor((slot-1)/5),col=(slot-1)%5;
    const pageW=210,pageH=297,gridLeft=5,gridTop=25,gridW=200,gridH=265,gap=1.15;
    const cardW=(gridW-gap*4)/5,cardH=(gridH-gap*4)/5;
    const cardX=gridLeft+col*(cardW+gap),cardY=gridTop+row*(cardH+gap);
    const contentW=cardW-1,fieldGap=.6,fieldW=(contentW-fieldGap)/2;
    let x=cardX+.5+(field==='gondola'?fieldW+fieldGap:0),y=cardY+cardH-.5-8.4,w=fieldW,h=8.4;
    x+=.65;y+=.65;w-=1.3;h-=1.3;
    const sx=x/pageW*pageCanvas.width,sy=y/pageH*pageCanvas.height,sw=w/pageW*pageCanvas.width,sh=h/pageH*pageCanvas.height;
    const out=document.createElement('canvas');out.width=420;out.height=170;
    const ctx=out.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(pageCanvas,sx,sy,sw,sh,12,12,out.width-24,out.height-24);
    return out;
  }

  function inventorySheetThresholdCanvas(source){
    const out=document.createElement('canvas');out.width=source.width;out.height=source.height;
    const ctx=out.getContext('2d',{alpha:false});ctx.drawImage(source,0,0);
    const im=ctx.getImageData(0,0,out.width,out.height),d=im.data,hist=new Uint32Array(256);
    for(let i=0;i<d.length;i+=4){const y=Math.max(0,Math.min(255,Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2])));hist[y]++}
    const total=out.width*out.height;let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
    let sumB=0,wB=0,maxVar=0,threshold=180;
    for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=total-wB;if(!wF)break;sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF,v=wB*wF*(mB-mF)*(mB-mF);if(v>maxVar){maxVar=v;threshold=t}}
    threshold=Math.max(115,Math.min(215,threshold));
    for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2],v=y<threshold?0:255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}
    ctx.putImageData(im,0,0);return out;
  }

  function inventorySheetParseDigits(text,field,confidence){
    const raw=String(text||'').trim(),digits=raw.replace(/\D+/g,'');
    const value=digits?Number(digits):null,max=field==='quantity'?100000:9999,min=field==='quantity'?0:1;
    const valid=Number.isInteger(value)&&value>=min&&value<=max;
    return {value:valid?value:null,confidence:Math.max(0,Math.min(1,Number(confidence||0)/100)),ambiguous:!valid};
  }


  function inventorySheetParseQrText(raw){
    const text=String(raw||'').trim().toUpperCase();
    const m=text.match(/^DA_BAL1\|(BAL-[A-Z0-9-]{6,40})\|(\d{1,5})$/);
    if(!m)return null;
    const page=Number(m[2]);
    return Number.isInteger(page)&&page>=1?{sheet_token:text,batch_code:m[1],page_number:page}:null;
  }

  async function inventorySheetDecodeQr(pageCanvas){
    const canvases=[pageCanvas];
    const regions=[
      [0,0,1,.28],
      [.55,0,.45,.34],
      [0,0,.45,.34]
    ];
    for(const [rx,ry,rw,rh] of regions){
      const crop=document.createElement('canvas');
      crop.width=Math.max(320,Math.round(pageCanvas.width*rw));
      crop.height=Math.max(180,Math.round(pageCanvas.height*rh));
      crop.getContext('2d',{alpha:false}).drawImage(
        pageCanvas,
        Math.round(pageCanvas.width*rx),Math.round(pageCanvas.height*ry),
        Math.round(pageCanvas.width*rw),Math.round(pageCanvas.height*rh),
        0,0,crop.width,crop.height
      );
      canvases.push(crop);
    }

    if('BarcodeDetector' in window){
      try{
        const detector=new window.BarcodeDetector({formats:['qr_code']});
        for(const canvas of canvases){
          const found=await detector.detect(canvas);
          for(const code of found||[]){
            const parsed=inventorySheetParseQrText(code.rawValue);
            if(parsed)return parsed;
          }
        }
      }catch{}
    }

    await inventorySheetLoadScript('inventoryJsQr','https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
    if(typeof window.jsQR!=='function')throw new Error('Leitor de QR não carregou. Verifique a internet do celular e tente novamente.');
    const tryCanvas=canvas=>{
      const ctx=canvas.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,canvas.width,canvas.height);
      const hit=window.jsQR(im.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});
      return inventorySheetParseQrText(hit?.data);
    };
    for(const canvas of canvases){
      const parsed=tryCanvas(canvas);
      if(parsed)return parsed;
    }
    return null;
  }

  async function inventorySheetReadLocal(file,statusEl){
    if(statusEl)statusEl.textContent='Abrindo a imagem e procurando o QR Code…';
    const source=await inventorySheetFileCanvas(file,1800);
    let identity=await inventorySheetDecodeQr(source);
    let warped=null,forcePageFallback=false;

    if(statusEl)statusEl.textContent=identity
      ?'QR identificado. Preparando a folha…'
      :'QR ainda não identificado. Tentando preparar a folha…';

    try{
      warped=await inventorySheetWarpPage(file,source);
    }catch(e){
      if(identity){
        forcePageFallback=true;
        const canvas=document.createElement('canvas');
        canvas.width=1260;canvas.height=1782;
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        const scale=Math.min(canvas.width/source.width,canvas.height/source.height);
        const dw=Math.round(source.width*scale),dh=Math.round(source.height*scale);
        const dx=Math.round((canvas.width-dw)/2),dy=Math.round((canvas.height-dh)/2);
        ctx.drawImage(source,0,0,source.width,source.height,dx,dy,dw,dh);
        warped={canvas,confidence:.90,opencv_failed:true};
        if(statusEl)statusEl.textContent='QR identificado. O leitor local de imagem não abriu neste celular; vou usar a IA de segurança na folha inteira.';
      }else{
        // Mesmo sem OpenCV, ainda tentamos o QR diretamente na foto original.
        identity=await inventorySheetDecodeQr(source);
        if(!identity)throw new Error('QR Code não encontrado e o leitor local de imagem não abriu neste celular. Tente novamente com a folha inteira visível.');
        forcePageFallback=true;
        const canvas=document.createElement('canvas');
        canvas.width=1260;canvas.height=1782;
        const ctx=canvas.getContext('2d',{alpha:false});
        ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
        const scale=Math.min(canvas.width/source.width,canvas.height/source.height);
        const dw=Math.round(source.width*scale),dh=Math.round(source.height*scale);
        ctx.drawImage(source,0,0,source.width,source.height,Math.round((canvas.width-dw)/2),Math.round((canvas.height-dh)/2),dw,dh);
        warped={canvas,confidence:.90,opencv_failed:true};
      }
    }

    if(!identity)identity=await inventorySheetDecodeQr(warped.canvas);
    if(!identity)throw new Error('QR Code não encontrado. Esta foto precisa mostrar o cabeçalho inteiro e a folha precisa ser uma impressão nova com QR Code.');

    const manifest=await api('inventory_sheet_manifest',{},{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheet_token:identity.sheet_token})
    });
    const slotCount=Math.max(1,Math.min(25,Number(manifest.slot_count||25)));
    const localItems=Array.from({length:slotCount},(_,i)=>({
      slot_number:i+1,quantity:null,gondola:null,quantity_confidence:0,gondola_confidence:0,
      ambiguous_quantity:true,ambiguous_gondola:true,note:forcePageFallback?'opencv_unavailable':''
    }));
    const fallbackFields=[];

    if(!forcePageFallback){
      const tasks=[];
      for(let slot=1;slot<=slotCount;slot++){
        for(const field of ['quantity','gondola']){
          const crop=inventorySheetFieldCrop(warped.canvas,slot,field),processed=inventorySheetThresholdCanvas(crop);
          tasks.push({slot,field,crop,processed});
        }
      }
      let workers=null;
      try{workers=await inventorySheetOcrWorkers()}catch{}
      let done=0;
      if(workers?.length){
        await Promise.all(workers.map(async(worker,wi)=>{
          for(let i=wi;i<tasks.length;i+=workers.length){
            const t=tasks[i],res=await worker.recognize(t.processed),parsed=inventorySheetParseDigits(res?.data?.text,t.field,res?.data?.confidence);
            const row=localItems[t.slot-1];
            row[t.field]=parsed.value;row[t.field+'_confidence']=parsed.confidence;
            row['ambiguous_'+t.field]=parsed.ambiguous||parsed.confidence<.88;
            done++;if(statusEl&&done%5===0)statusEl.textContent='OCR local · '+identity.batch_code+' · página '+identity.page_number+' · '+done+'/'+tasks.length+' campos';
          }
        }));
      }
      for(const t of tasks){
        const row=localItems[t.slot-1];
        if(row['ambiguous_'+t.field]===true||Number(row[t.field+'_confidence']||0)<.88){
          fallbackFields.push({slot_number:t.slot,field:t.field,image_data_url:t.crop.toDataURL('image/jpeg',.88)});
        }
      }
    }

    const pageImage=source.toDataURL('image/jpeg',.84);
    return {
      duplicate:false,sheet_token:identity.sheet_token,manifest,local_items:localItems,fallback_fields:fallbackFields,
      page_image_data_url:pageImage,force_page_fallback:forcePageFallback,
      page_confidence:warped.confidence,page_complete:true
    };
  }

  function inventorySheetRowApproved(row){
    const q=Number(row.quantity),g=Number(row.gondola);
    if(!Number.isInteger(q)||q<0||!Number.isInteger(g)||g<1||g>9999)return false;
    if(row.review_state==='applied'||row.review_state==='confirmed')return true;
    if(row.manual_confirmed===true)return true;
    return row.review_state==='ready'&&Number(row.ai_quantity)===q&&Number(row.ai_gondola)===g&&!row.user_edited;
  }

  function inventorySheetReviewLabel(row){
    if(row.review_state==='applied')return '<span class="pill">Concluído no Bling</span>';
    if(row.review_state==='confirmed')return '<span class="pill warn">Aguardando conclusão no Bling</span>';
    if(row.review_state==='error')return '<span class="pill danger">Erro · precisa revisar</span>';
    if(inventorySheetRowApproved(row))return '<span class="pill">Leitura conferida</span>';
    return '<span class="pill warn">Confirmar leitura</span>';
  }

  function inventorySheetHasAppliedSideEffect(scan=state.inventorySheetScan){
    return Boolean(scan&&(scan.rows||[]).some(r=>['confirmed','applied'].includes(String(r.review_state||''))));
  }

  function inventorySheetRefreshPhotoControls(){
    const scan=state.inventorySheetScan,apply=$('#inventorySheetApply'),cancel=$('#inventorySheetCancelRead');
    if(!scan){
      if(apply){apply.disabled=true;apply.hidden=false;apply.textContent='Aplicar folha aberta'}
      if(cancel)cancel.hidden=true;
      return;
    }
    const rows=scan.rows||[],pending=rows.filter(r=>r.review_state!=='applied');
    const allDone=rows.length>0&&pending.length===0;
    if(apply){
      apply.hidden=allDone;
      if(allDone){
        apply.disabled=true;apply.textContent='Balanço concluído';
      }else{
        const hasConfirmed=pending.some(r=>r.review_state==='confirmed');
        const hasError=pending.some(r=>r.review_state==='error');
        apply.disabled=state.inventorySheetBusy||!pending.length||pending.some(r=>!inventorySheetRowApproved(r));
        apply.textContent=hasError?'Tentar novamente os itens com erro':(hasConfirmed?'Concluir sincronização com o Bling':'Atualizar estoque no Bling');
      }
    }
    if(cancel){
      cancel.hidden=false;
      cancel.disabled=state.inventorySheetBusy;
      cancel.textContent=allDone
        ?'Ler esta folha novamente'
        :(inventorySheetHasAppliedSideEffect(scan)?'Ler novamente para corrigir':'Cancelar esta leitura e ler novamente');
    }
  }

  function inventorySheetRefreshRowControls(resultId){
    const scan=state.inventorySheetScan,row=(scan?.rows||[]).find(x=>String(x.result_id)===String(resultId));if(!row)return;
    const label=document.querySelector('[data-sheet-label="'+String(resultId)+'"]');
    if(label)label.innerHTML=inventorySheetReviewLabel(row);
    const confirm=document.querySelector('[data-sheet-confirm="'+String(resultId)+'"]');
    if(confirm){
      const needsConfirm=!inventorySheetRowApproved(row)&&!['applied','confirmed','error'].includes(row.review_state);
      confirm.hidden=!needsConfirm;
    }
    inventorySheetRefreshPhotoControls();
  }

  function paintInventorySheetPhoto(){
    const host=$('#inventorySheetReview');if(!host||state.tab!=='balance'||state.balanceMode!=='count')return;
    const scan=state.inventorySheetScan;
    if(!scan){
      host.innerHTML='<div class="history-empty">Depois da contagem, fotografe <strong>a folha A4 inteira</strong>, com as quatro bordas visíveis, boa luz e a câmera o mais paralela possível. A mesma folha pode ser lida novamente sempre que precisar corrigir uma leitura.</div>';
      inventorySheetRefreshPhotoControls();
      return;
    }

    const rows=scan.rows||[];
    const appliedRows=rows.filter(r=>r.review_state==='applied');
    const confirmedRows=rows.filter(r=>r.review_state==='confirmed');
    const errorRows=rows.filter(r=>r.review_state==='error');
    const reviewRows=rows.filter(r=>!inventorySheetRowApproved(r)&&!['applied','confirmed','error'].includes(r.review_state));
    const readyRows=rows.filter(r=>inventorySheetRowApproved(r)&&!['applied','confirmed','error'].includes(r.review_state));
    const activeRows=rows.filter(r=>r.review_state!=='applied');
    const allDone=rows.length>0&&appliedRows.length===rows.length;

    let banner='';
    if(allDone){
      banner='<div style="border:1px solid #9bc8ad;background:#eef8f1;border-radius:14px;padding:16px;margin-bottom:10px">'+
        '<strong style="display:block;font-size:18px">✓ Balanço concluído</strong>'+
        '<small style="display:block;margin-top:5px">'+esc(rows.length)+'/'+esc(rows.length)+' produtos atualizados e verificados no Bling · '+esc(scan.batch_code)+' · Página '+esc(scan.page_number)+'/'+esc(scan.page_count)+'. Se notar algum erro, pode ler esta mesma folha novamente e aplicar a correção.</small>'+
        '</div>';
    }else{
      const pieces=[];
      if(appliedRows.length)pieces.push(appliedRows.length+' concluído(s)');
      if(confirmedRows.length)pieces.push(confirmedRows.length+' aguardando Bling');
      if(readyRows.length)pieces.push(readyRows.length+' pronto(s) para aplicar');
      if(reviewRows.length)pieces.push(reviewRows.length+' para conferir');
      if(errorRows.length)pieces.push(errorRows.length+' com erro');
      banner='<div class="bling-banner" style="margin-bottom:10px"><strong>'+esc(scan.batch_code)+' · Página '+esc(scan.page_number)+'/'+esc(scan.page_count)+'</strong>'+
        '<small>'+pieces.join(' · ')+' · '+appliedRows.length+'/'+rows.length+' finalizados</small></div>';
    }

    if(allDone){
      host.innerHTML=banner+'<div class="history-empty"><strong>Nada mais precisa ser feito nesta leitura.</strong><br>Os produtos concluídos foram retirados da lista. Use “Ler esta folha novamente” somente se quiser fazer uma correção.</div>';
    }else{
      host.innerHTML=banner+
        (appliedRows.length?'<div class="muted" style="margin:0 0 10px">Os '+esc(appliedRows.length)+' produto(s) já concluídos foram ocultados. Abaixo aparecem somente os que ainda exigem alguma ação.</div>':'')+
        activeRows.map(r=>{
          const needsConfirm=!inventorySheetRowApproved(r)&&!['applied','confirmed','error'].includes(r.review_state);
          const locked=r.review_state==='confirmed';
          const detail=[
            'REF '+String(r.printed_index||'').padStart(4,'0'),
            'EAN '+(r.gtin||'—'),
            r.mark_kind==='local_ocr'?'OCR local':(r.mark_kind==='local_ocr+ai_fallback'?'OCR local + IA no campo duvidoso':(r.mark_kind==='page_ai_fallback'?'IA de segurança na folha inteira':'')),
            r.review_state==='confirmed'?'Estoque já confirmado no envio; falta concluir a sincronização interna':'',
            r.reason?String(r.reason).replaceAll('_',' '):'',
            r.apply_error||''
          ].filter(Boolean).join(' · ');
          return '<div class="simple-row inventory-review-row" data-sheet-row="'+esc(r.result_id)+'">'+
            '<div class="simple-main"><strong>'+esc(r.name)+'</strong><small>'+esc(detail)+'</small></div>'+
            '<label class="inventory-field"><span>ESTOQUE</span><input type="number" min="0" step="1" inputmode="numeric" aria-label="Estoque" title="Estoque" placeholder="0" data-sheet-qty="'+esc(r.result_id)+'" value="'+(r.quantity==null?'':esc(r.quantity))+'" '+(locked?'disabled':'')+'></label>'+
            '<label class="inventory-field"><span>GÔNDOLA</span><input type="number" min="1" max="9999" step="1" inputmode="numeric" aria-label="Gôndola" title="Gôndola" placeholder="0" data-sheet-gondola="'+esc(r.result_id)+'" value="'+(r.gondola==null?'':esc(r.gondola))+'" '+(locked?'disabled':'')+'></label>'+
            '<div style="display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap"><span data-sheet-label="'+esc(r.result_id)+'">'+inventorySheetReviewLabel(r)+'</span><button class="secondary" type="button" data-sheet-confirm="'+esc(r.result_id)+'" '+(needsConfirm?'':'hidden')+' style="min-height:36px;padding:0 9px">Confirmar</button></div>'+
          '</div>';
        }).join('');
    }

    host.querySelectorAll('[data-sheet-qty]').forEach(el=>el.oninput=e=>{
      const row=rows.find(x=>x.result_id===e.currentTarget.dataset.sheetQty);if(!row||row.review_state==='confirmed')return;
      const raw=e.currentTarget.value;row.quantity=raw===''?null:Number(raw);row.user_edited=true;row.manual_confirmed=false;
      inventorySheetQueueSyncScan(state.inventorySheetScan);
      inventorySheetRefreshRowControls(row.result_id);
    });
    host.querySelectorAll('[data-sheet-gondola]').forEach(el=>el.oninput=e=>{
      const row=rows.find(x=>x.result_id===e.currentTarget.dataset.sheetGondola);if(!row||row.review_state==='confirmed')return;
      const raw=e.currentTarget.value;row.gondola=raw===''?null:Number(raw);row.user_edited=true;row.manual_confirmed=false;
      inventorySheetQueueSyncScan(state.inventorySheetScan);
      inventorySheetRefreshRowControls(row.result_id);
    });
    host.querySelectorAll('[data-sheet-confirm]').forEach(b=>b.onclick=()=>{
      const row=rows.find(x=>x.result_id===b.dataset.sheetConfirm);if(!row)return;
      if(!Number.isInteger(Number(row.quantity))||Number(row.quantity)<0){toast('Informe uma quantidade inteira válida');return}
      if(!Number.isInteger(Number(row.gondola))||Number(row.gondola)<1||Number(row.gondola)>9999){toast('Informe um número de gôndola válido');return}
      row.manual_confirmed=true;
      inventorySheetQueueSyncScan(state.inventorySheetScan);
      inventorySheetRefreshRowControls(row.result_id);
    });

    inventorySheetRefreshPhotoControls();
  }

  async function cancelOrRereadInventorySheet(){
    const scan=state.inventorySheetScan;if(!scan||state.inventorySheetBusy)return;
    const canCancel=!inventorySheetHasAppliedSideEffect(scan);
    const scanId=scan.scan_id;
    state.inventorySheetScan=null;
    state.inventorySheetQueue=(state.inventorySheetQueue||[]).filter(x=>x.scan?.scan_id!==scanId);
    paintInventorySheetQueue();paintInventorySheetPhoto();
    const status=$('#inventorySheetPhotoStatus');
    if(status)status.textContent=canCancel
      ?'Leitura descartada. Tire uma nova foto da folha para corrigir.'
      :'Leitura anterior preservada. Tire uma nova foto da mesma folha; a nova leitura poderá corrigir estoque e gôndola.';
    const camera=$('#inventorySheetCamera');
    if(camera){camera.value='';camera.click()}
    if(canCancel&&scanId){
      try{
        await api('inventory_sheet_cancel_scan',{},{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scan_id:scanId})
        });
        await loadInventorySheetPendingManual();
      }catch(e){
        toast('A nova leitura foi liberada, mas não consegui limpar a tentativa anterior.');
      }
    }
  }


  function inventorySheetErrorMessage(error){
    const raw=String(error?.message||error||'').trim();
    if(!raw)return 'Erro desconhecido ao processar a foto.';
    const known=errorMessage(raw);
    if(known!=='Não consegui salvar agora.')return known;
    if(raw==='Failed to fetch')return 'Sem conexão com o serviço agora. Verifique a internet e tente novamente.';
    if(raw.includes('OpenCV'))return 'O leitor de imagem não conseguiu iniciar neste celular. Recarregue a página e tente novamente.';
    if(raw.includes('QR Code'))return raw;
    if(raw.includes('quatro bordas'))return raw;
    if(raw.includes('imagem'))return raw;
    if(raw.includes('Leitor de QR'))return raw;
    return raw.length<=180?raw:'Não consegui processar esta foto. Tente novamente com a folha inteira visível.';
  }

  function inventorySheetQueueBadge(status){
    const map={
      queued:['Aguardando',''],
      processing:['Lendo','warn'],
      ready:['Pronta',''],
      review:['Conferir','warn'],
      duplicate:['Já enviada','off'],
      applying:['Aplicando','warn'],
      submitted:['Aguardando Bling','warn'],
      applied:['Concluída',''],
      error:['Erro','danger']
    };
    const x=map[status]||[status||'—','off'];
    return '<span class="pill '+x[1]+'">'+esc(x[0])+'</span>';
  }

  function inventorySheetQueueSummary(){
    const rows=state.inventorySheetQueue||[];
    const counts={};
    rows.forEach(x=>counts[x.status]=(counts[x.status]||0)+1);
    return {total:rows.length,ready:counts.ready||0,review:counts.review||0,duplicate:counts.duplicate||0,error:counts.error||0,applied:(counts.applied||0)+(counts.submitted||0)};
  }

  function paintInventorySheetQueue(){
    const host=$('#inventorySheetUploadQueue');if(!host)return;
    const rows=state.inventorySheetQueue||[];
    if(!rows.length){
      host.innerHTML='<div class="history-empty">Você pode selecionar várias fotos de uma vez, mesmo fora de ordem. Cada folha é identificada automaticamente pelo QR Code.</div>';
    }else{
      host.innerHTML=rows.map((x,index)=>{
        const title=x.batch_code?x.batch_code+' · Página '+x.page_number+(x.page_count?'/'+x.page_count:''):(x.file_name||('Foto '+(index+1)));
        const detail=x.status==='duplicate'
          ?'Leitura antiga detectada. Você pode tirar uma nova foto desta mesma folha.'
          :x.status==='error'
            ?(x.error||'Não foi possível processar esta foto.')
            :x.status==='review'
              ?'Há números que precisam de conferência humana.'
              :x.status==='ready'
                ?'Todos os campos foram lidos e estão prontos para aplicar.'
                :x.status==='processing'
                  ?'Identificando QR, corrigindo a foto e lendo os números…'
                  :x.status==='submitted'
                    ?'Contagens registradas; falta concluir a sincronização com o Bling.'
                    :x.status==='applied'
                      ?'Concluída: estoque e gôndolas verificados. Nenhuma ação pendente.'
                      :'';
        return '<div class="simple-row inventory-upload-row">'+
          '<div class="simple-main"><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></div>'+
          inventorySheetQueueBadge(x.status)+
          (x.scan?'<button class="secondary" type="button" data-sheet-open="'+esc(x.id)+'" style="min-height:36px;padding:0 9px">'+(x.status==='review'?'Conferir':'Abrir')+'</button>':'<span></span>')+
        '</div>';
      }).join('');
      host.querySelectorAll('[data-sheet-open]').forEach(b=>b.onclick=()=>{
        const item=rows.find(x=>x.id===b.dataset.sheetOpen);if(!item?.scan)return;
        state.inventorySheetScan=item.scan;paintInventorySheetPhoto();
        $('#inventorySheetReview')?.scrollIntoView({behavior:'smooth',block:'start'});
      });
    }
    const s=inventorySheetQueueSummary();
    const retry=$('#inventorySheetRetryErrors');
    if(retry){
      const retryable=rows.filter(x=>x.status==='error'&&x.file instanceof File).length;
      retry.hidden=!s.error;
      retry.disabled=state.inventorySheetBusy||!retryable;
      retry.textContent=retryable?'Reenviar '+retryable+' foto(s) com erro':(s.error?'Fotos com erro precisam ser selecionadas novamente':'Reenviar fotos com erro');
    }
    const bulk=$('#inventorySheetApplyReady');
    if(bulk){
      bulk.disabled=state.inventorySheetBusy||!s.ready;
      bulk.textContent=s.ready?'Aplicar '+s.ready+' folha(s) prontas':'Nenhuma folha pronta para aplicar';
    }
  }


  function paintInventorySheetPendingManual(){
    const host=$('#inventorySheetPendingManual');if(!host)return;
    const rows=state.inventorySheetPendingManual||[],s=state.inventorySheetPendingSummary||{};
    const badge=$('#inventorySheetPendingBadge');
    if(badge){
      badge.textContent=rows.length?rows.length+' pendência(s)':'Sem pendências';
      badge.className='pill '+(rows.length?'warn':'');
    }
    if(!rows.length){
      host.innerHTML='<div class="history-empty">Nenhum produto aguardando contagem manual. Todas as leituras recebidas foram resolvidas.</div>';
      return;
    }
    host.innerHTML='<div class="bling-banner" style="margin-bottom:10px"><strong>'+esc(s.count||rows.length)+' produto(s) precisam de conferência manual</strong><small>'+
      esc(s.quantity_missing||0)+' sem estoque legível · '+esc(s.gondola_missing||0)+' sem gôndola legível'+(s.apply_errors?' · '+esc(s.apply_errors)+' falha(s) de atualização':'')+
      '</small></div>'+
      rows.map(r=>{
        const detail=[
          r.batch_code?String(r.batch_code)+' · pág. '+r.page_number+(r.page_count?'/'+r.page_count:''):'',
          r.printed_index?'REF '+String(r.printed_index).padStart(4,'0'):'',
          r.gtin?'EAN '+r.gtin:'SEM EAN',
          r.operator_label?'enviado por '+r.operator_label:'',
          r.reason||''
        ].filter(Boolean).join(' · ');
        return '<div class="simple-row inventory-pending-row">'+
          '<div class="simple-main"><strong>'+esc(r.name||'Produto')+'</strong><small>'+esc(detail)+'</small></div>'+
          '<label class="inventory-field"><span>ESTOQUE</span><input type="number" min="0" step="1" inputmode="numeric" aria-label="Estoque manual" title="Estoque contado manualmente" placeholder="0" data-pending-qty="'+esc(r.result_id)+'" value="'+(r.quantity==null?'':esc(r.quantity))+'"></label>'+
          '<label class="inventory-field"><span>GÔNDOLA</span><input type="number" min="1" max="9999" step="1" inputmode="numeric" aria-label="Gôndola manual" title="Gôndola conferida manualmente" placeholder="0" data-pending-gondola="'+esc(r.result_id)+'" value="'+(r.gondola==null?'':esc(r.gondola))+'"></label>'+
          '<button class="primary" type="button" data-pending-resolve="'+esc(r.result_id)+'" style="min-height:40px;padding:0 10px">Resolver manualmente</button>'+
        '</div>';
      }).join('');
    host.querySelectorAll('[data-pending-resolve]').forEach(btn=>btn.onclick=async()=>{
      const row=rows.find(x=>String(x.result_id)===String(btn.dataset.pendingResolve));if(!row)return;
      const qEl=host.querySelector('[data-pending-qty="'+CSS.escape(String(row.result_id))+'"]');
      const gEl=host.querySelector('[data-pending-gondola="'+CSS.escape(String(row.result_id))+'"]');
      const quantity=Number(qEl?.value),gondola=Number(gEl?.value);
      if(!Number.isInteger(quantity)||quantity<0){toast('Faça a contagem manual e informe o estoque inteiro');return}
      if(!Number.isInteger(gondola)||gondola<1||gondola>9999){toast('Confira manualmente e informe a gôndola');return}
      const operator=requireOperator();if(!operator)return;
      btn.disabled=true;btn.textContent='Salvando…';
      try{
        const data=await api('inventory_sheet_apply',{},{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({scan_id:row.scan_id,operator,items:[{
            result_id:row.result_id,quantity,gondola,manual_confirmed:true
          }]})
        });
        const result=(data.rows||[])[0];
        if(result?.review_state==='error'||result?.ok===false)throw new Error(result?.apply_error||result?.error||'manual_apply_failed');
        toast(row.name+' · contagem manual registrada');
        await loadInventorySheetPendingManual();
        loadStockRecountQueue();loadOrderStockShortages();
      }catch(e){
        toast('Não consegui concluir manualmente: '+errorMessage(e.message));
        btn.disabled=false;btn.textContent='Resolver manualmente';
      }
    });
  }

  async function loadInventorySheetPendingManual(){
    const host=$('#inventorySheetPendingManual');
    if(host)host.innerHTML='<div class="loading">Verificando pendências de leitura…</div>';
    try{
      const data=await api('inventory_sheet_pending_manual');
      state.inventorySheetPendingManual=data.items||[];
      state.inventorySheetPendingSummary={
        count:Number(data.count||0),quantity_missing:Number(data.quantity_missing||0),
        gondola_missing:Number(data.gondola_missing||0),apply_errors:Number(data.apply_errors||0)
      };
      paintInventorySheetPendingManual();
    }catch(e){
      if(host)host.innerHTML='<div class="history-empty">Não consegui carregar as pendências agora. <button class="text" id="retryInventoryPending" type="button">Tentar novamente</button></div>';
      if($('#retryInventoryPending'))$('#retryInventoryPending').onclick=loadInventorySheetPendingManual;
    }
  }

  async function processInventorySheetEntries(entries,operator){
    if(state.inventorySheetProcessing){toast('Já estou processando outro grupo de fotos');return}
    if(!entries?.length)return;
    state.inventorySheetProcessing=true;state.inventorySheetBusy=true;
    const status=$('#inventorySheetPhotoStatus'),cameraBtn=$('#inventorySheetAnalyzeButton'),chooseBtn=$('#inventorySheetChooseButton'),retryBtn=$('#inventorySheetRetryErrors');
    if(cameraBtn)cameraBtn.disabled=true;if(chooseBtn)chooseBtn.disabled=true;if(retryBtn)retryBtn.disabled=true;
    paintInventorySheetQueue();paintInventorySheetPhoto();

    try{
      for(let index=0;index<entries.length;index++){
        const entry=entries[index];
        if(!(entry.file instanceof File)){
          entry.status='error';entry.error='A foto original não está mais disponível neste navegador. Selecione esta imagem novamente.';
          paintInventorySheetQueue();continue;
        }
        entry.status='processing';entry.error='';entry.scan=null;
        paintInventorySheetQueue();
        if(status)status.textContent='Processando foto '+(index+1)+' de '+entries.length+' · identificando a folha automaticamente…';
        try{
          const local=await inventorySheetWithTimeout(inventorySheetReadLocal(entry.file,status),INVENTORY_SHEET_READ_TIMEOUT_MS,'A leitura desta foto demorou demais. Tente novamente; se persistir, atualize a página e repita a foto.');
          const m=local.manifest||{};
          entry.batch_code=m.batch_code||'';entry.page_number=m.page_number??null;entry.page_count=m.page_count??null;
          if(local.duplicate){
            entry.status='error';entry.error='Leitura antiga detectada; tire uma nova foto desta mesma folha.';
            entry.file=null;
            continue;
          }
          const unresolved=local.fallback_fields.length;
          if(status)status.textContent=unresolved
            ?'Foto '+(index+1)+'/'+entries.length+' · '+entry.batch_code+' página '+entry.page_number+' · '+unresolved+' campo(s) duvidosos; IA somente nesses recortes.'
            :'Foto '+(index+1)+'/'+entries.length+' · '+entry.batch_code+' página '+entry.page_number+' · leitura local concluída sem IA.';
          const data=await api('inventory_sheet_analyze',{},{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              sheet_token:local.sheet_token,page_confidence:local.page_confidence,page_complete:local.page_complete,
              operator,client_upload_id:entry.id,local_items:local.local_items,fallback_fields:local.fallback_fields,
              page_image_data_url:local.page_image_data_url,force_page_fallback:local.force_page_fallback===true
            })
          });
          if(data.duplicate){
            entry.status='error';entry.error='Leitura antiga detectada; tire uma nova foto desta mesma folha.';
            entry.file=null;
            continue;
          }
          const scan={...data,rows:(data.rows||[]).map(r=>({...r,gondola:r.gondola??r.ai_gondola??null,manual_confirmed:false,user_edited:false}))};
          entry.scan=scan;entry.batch_code=data.batch_code||entry.batch_code;entry.page_number=data.page_number??entry.page_number;entry.page_count=data.page_count??entry.page_count;
          entry.status=(scan.rows||[]).every(inventorySheetRowApproved)?'ready':'review';
          entry.file=null;
          state.inventorySheetScan=scan;
        }catch(e){
          entry.status='error';
          entry.error=inventorySheetErrorMessage(e);
          // Mantém o File em memória para permitir "Reenviar fotos com erro"
          // sem pedir nova seleção enquanto esta tela continuar aberta.
        }finally{
          paintInventorySheetQueue();paintInventorySheetPhoto();
        }
      }
      const s=inventorySheetQueueSummary();
      if(status)status.textContent='Lote de fotos concluído: '+s.total+' foto(s) · '+s.ready+' pronta(s) · '+s.review+' para conferir · '+s.duplicate+' duplicada(s) · '+s.error+' com erro.';
    }finally{
      state.inventorySheetProcessing=false;state.inventorySheetBusy=false;
      if(cameraBtn)cameraBtn.disabled=false;if(chooseBtn)chooseBtn.disabled=false;
      if($('#inventorySheetCamera'))$('#inventorySheetCamera').value='';
      if($('#inventorySheetFile'))$('#inventorySheetFile').value='';
      paintInventorySheetQueue();paintInventorySheetPhoto();await loadInventorySheetPendingManual();
    }
  }

  async function analyzeInventorySheetPhotos(files){
    if(state.inventorySheetProcessing){toast('Já estou processando outro grupo de fotos');return}
    const selected=Array.from(files||[]).filter(f=>String(f?.type||'').startsWith('image/')).slice(0,100);
    if(!selected.length){toast('Selecione uma ou mais fotos das folhas A4');return}
    const operator=requireOperator();if(!operator)return;
    const entries=selected.map((file,i)=>({
      id:(crypto.randomUUID?crypto.randomUUID():(Date.now()+'-'+i+'-'+Math.random().toString(16).slice(2))),
      file,file_name:file.name||('Foto '+(i+1)),status:'queued',batch_code:'',page_number:null,page_count:null,scan:null,error:''
    }));
    state.inventorySheetQueue.push(...entries);
    paintInventorySheetQueue();
    await processInventorySheetEntries(entries,operator);
  }

  async function retryInventorySheetErrors(){
    if(state.inventorySheetProcessing)return;
    const failed=(state.inventorySheetQueue||[]).filter(x=>x.status==='error'&&x.file instanceof File);
    if(!failed.length){
      toast('As fotos antigas não estão mais na memória. Selecione novamente apenas as que falharam.');
      return;
    }
    const operator=requireOperator();if(!operator)return;
    failed.forEach(x=>{x.status='queued';x.error=''});
    paintInventorySheetQueue();
    await processInventorySheetEntries(failed,operator);
  }

  function mergeInventorySheetApplyResponse(data,scan=state.inventorySheetScan){
    if(!scan)return;
    const updates=new Map((data.rows||[]).map(x=>[String(x.id),x]));
    scan.rows.forEach(row=>{
      const u=updates.get(String(row.result_id));if(!u)return;
      row.review_state=u.review_state||row.review_state;row.apply_error=u.apply_error||'';
      if(u.confirmed_quantity!=null)row.quantity=Number(u.confirmed_quantity);
      if(u.confirmed_gondola!=null)row.gondola=Number(u.confirmed_gondola);
      if(['applied','confirmed','error'].includes(row.review_state))row.manual_confirmed=true;
    });
  }

  async function applyInventorySheetScan(scan,operator){
    const pending=(scan?.rows||[]).filter(r=>r.review_state!=='applied');
    if(!pending.length)return scan;
    if(pending.some(r=>!inventorySheetRowApproved(r)))throw new Error('manual_confirmation_required');
    for(let i=0;i<pending.length;i+=5){
      const chunk=pending.slice(i,i+5);
      const data=await api('inventory_sheet_apply',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({scan_id:scan.scan_id,operator,items:chunk.map(r=>({
          result_id:r.result_id,quantity:Number(r.quantity),gondola:Number(r.gondola),
          manual_confirmed:r.manual_confirmed===true||r.user_edited===true
        }))})
      });
      mergeInventorySheetApplyResponse(data,scan);
    }
    return scan;
  }

  function inventorySheetQueueSyncScan(scan){
    const item=(state.inventorySheetQueue||[]).find(x=>x.scan?.scan_id===scan?.scan_id);
    if(!item)return;
    const states=(scan.rows||[]).map(r=>r.review_state);
    if(states.length&&states.every(x=>x==='applied'))item.status='applied';
    else if(states.some(x=>x==='error'))item.status='error';
    else if(states.every(x=>['applied','confirmed'].includes(x)))item.status='submitted';
    else if((scan.rows||[]).every(inventorySheetRowApproved))item.status='ready';
    else item.status='review';
  }

  async function applyInventorySheetPhoto(){
    const scan=state.inventorySheetScan;if(!scan||state.inventorySheetBusy)return;
    const pending=(scan.rows||[]).filter(r=>r.review_state!=='applied');
    if(!pending.length){toast('Esta folha já foi aplicada');return}
    if(pending.some(r=>!inventorySheetRowApproved(r))){toast('Confirme primeiro os itens destacados em amarelo');return}
    const operator=requireOperator();if(!operator)return;
    state.inventorySheetBusy=true;paintInventorySheetPhoto();paintInventorySheetQueue();
    const btn=$('#inventorySheetApply');if(btn){btn.disabled=true;btn.textContent='Atualizando estoque…'}
    try{
      let previousApplied=-1;
      for(let attempt=1;attempt<=3;attempt++){
        const status=$('#inventorySheetPhotoStatus');
        if(status)status.textContent=attempt===1?'Atualizando e verificando no Bling…':'Concluindo sincronização no Bling · tentativa '+attempt+'/3…';
        await applyInventorySheetScan(scan,operator);
        inventorySheetQueueSyncScan(scan);
        const appliedNow=scan.rows.filter(r=>r.review_state==='applied').length;
        const waitingNow=scan.rows.filter(r=>r.review_state==='confirmed').length;
        if(!waitingNow||scan.rows.some(r=>r.review_state==='error'))break;
        if(appliedNow===previousApplied&&attempt>=2)break;
        previousApplied=appliedNow;
        await new Promise(r=>setTimeout(r,900));
      }
      const left=scan.rows.filter(r=>r.review_state!=='applied');
      if(!left.length){
        toast('Concluído · todos os produtos foram verificados no Bling');
        const status=$('#inventorySheetPhotoStatus');if(status)status.textContent='✓ CONCLUÍDO · '+scan.rows.length+'/'+scan.rows.length+' produtos atualizados e verificados no Bling. Nada mais precisa ser feito nesta folha.';
        loadStockRecountQueue();loadOrderStockShortages();
      }else if(left.some(r=>r.review_state==='error')){
        const errors=left.filter(r=>r.review_state==='error').length;
        toast(errors+' item(ns) com erro · veja somente os itens pendentes abaixo');
        const status=$('#inventorySheetPhotoStatus');if(status)status.textContent='Atenção: '+errors+' item(ns) ainda precisam de revisão. Os concluídos já foram ocultados.';
      }else{
        const waiting=left.filter(r=>r.review_state==='confirmed').length;
        toast(waiting+' item(ns) ainda aguardam o Bling');
        const status=$('#inventorySheetPhotoStatus');if(status)status.textContent='Ainda não terminou: '+waiting+' item(ns) aguardam o Bling. Os concluídos já foram ocultados; use “Concluir sincronização com o Bling” somente se esta mensagem permanecer.';
      }
    }catch(e){toast('Não consegui concluir a folha: '+errorMessage(e.message))}
    finally{state.inventorySheetBusy=false;paintInventorySheetPhoto();paintInventorySheetQueue();await loadInventorySheetPendingManual()}
  }

  async function applyInventorySheetReadyQueue(){
    if(state.inventorySheetBusy)return;
    const ready=(state.inventorySheetQueue||[]).filter(x=>x.status==='ready'&&x.scan);
    if(!ready.length){toast('Não há folhas prontas para aplicar');return}
    const operator=requireOperator();if(!operator)return;
    state.inventorySheetBusy=true;paintInventorySheetQueue();paintInventorySheetPhoto();
    const status=$('#inventorySheetPhotoStatus');
    try{
      for(let i=0;i<ready.length;i++){
        const item=ready[i];item.status='applying';paintInventorySheetQueue();
        if(status)status.textContent='Aplicando folha '+(i+1)+' de '+ready.length+' · '+item.batch_code+' página '+item.page_number+'…';
        try{
          await applyInventorySheetScan(item.scan,operator);
          inventorySheetQueueSyncScan(item.scan);
        }catch(e){item.status='error';item.error=errorMessage(e.message)}
        paintInventorySheetQueue();
      }
      const s=inventorySheetQueueSummary();
      if(status)status.textContent='Aplicação em lote concluída · '+s.applied+' enviada(s)/aplicada(s) · '+s.review+' para conferir · '+s.error+' com erro.';
      loadStockRecountQueue();loadOrderStockShortages();
    }finally{
      state.inventorySheetBusy=false;paintInventorySheetQueue();paintInventorySheetPhoto();await loadInventorySheetPendingManual();
    }
  }

  function bindInventorySheetPhoto(){
    const camera=$('#inventorySheetCamera'),file=$('#inventorySheetFile');
    if($('#inventorySheetAnalyzeButton'))$('#inventorySheetAnalyzeButton').onclick=()=>camera?.click();
    if($('#inventorySheetChooseButton'))$('#inventorySheetChooseButton').onclick=()=>file?.click();
    if(camera)camera.onchange=e=>{const files=Array.from(e.currentTarget.files||[]);if(files.length)analyzeInventorySheetPhotos(files)};
    if(file)file.onchange=e=>{const files=Array.from(e.currentTarget.files||[]);if(files.length)analyzeInventorySheetPhotos(files)};
    if($('#inventorySheetApply'))$('#inventorySheetApply').onclick=applyInventorySheetPhoto;
    if($('#inventorySheetCancelRead'))$('#inventorySheetCancelRead').onclick=cancelOrRereadInventorySheet;
    if($('#inventorySheetApplyReady'))$('#inventorySheetApplyReady').onclick=applyInventorySheetReadyQueue;
    if($('#inventorySheetRetryErrors'))$('#inventorySheetRetryErrors').onclick=retryInventorySheetErrors;
    paintInventorySheetQueue();paintInventorySheetPhoto();
  }


  function setBalanceSubtab(){
    state.balanceSubtab='scanner';state.balanceProduct=null;state.balanceQty='';state.balanceNeedsPhoto=false;state.balanceReadiness=null;
    renderBalance();
  }
