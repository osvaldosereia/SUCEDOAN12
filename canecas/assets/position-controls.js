(() => {
  'use strict';

  const STORAGE_KEY = 'canecasPosicoesMMV1';
  const SLOT_ORDER = ['leftTop','rightTop','leftBottom','rightBottom'];
  const SLOT_LABELS = {
    leftTop:'Propaganda superior',
    rightTop:'Arte superior',
    leftBottom:'Propaganda inferior',
    rightBottom:'Arte inferior'
  };
  const CENTERS = {
    leftTop:{x:87.4968,y:55.9032},
    rightTop:{x:210.2298,y:56.2067},
    leftBottom:{x:87.4968,y:154.2290},
    rightBottom:{x:210.2029,y:155.7688}
  };
  let offsets = loadOffsets();

  function loadOffsets(){
    try{
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.fromEntries(SLOT_ORDER.map(key => [key, {
        x:Number.isFinite(Number(parsed?.[key]?.x)) ? Number(parsed[key].x) : 0,
        y:Number.isFinite(Number(parsed?.[key]?.y)) ? Number(parsed[key].y) : 0
      }]));
    }catch{
      return Object.fromEntries(SLOT_ORDER.map(key => [key,{x:0,y:0}]));
    }
  }

  function saveOffsets(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(offsets)); }
  function $(selector, parent=document){ return parent.querySelector(selector); }
  function $$(selector, parent=document){ return [...parent.querySelectorAll(selector)]; }

  function identifySlot(canvas, dx, dy, dw, dh){
    if(!canvas || !canvas.width || !canvas.height) return null;
    const ratio = canvas.width / canvas.height;
    if(Math.abs(ratio - (297/210)) > 0.025) return null;
    const pxX = canvas.width / 297;
    const pxY = canvas.height / 210;
    const cx = (dx + dw/2) / pxX;
    const cy = (dy + dh/2) / pxY;
    let best = null;
    let bestDistance = Infinity;
    for(const key of SLOT_ORDER){
      const point = CENTERS[key];
      const distance = Math.hypot(cx-point.x, cy-point.y);
      if(distance < bestDistance){ bestDistance = distance; best = key; }
    }
    return bestDistance < 24 ? best : null;
  }

  const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(...args){
    try{
      let destIndex = -1;
      if(args.length === 5) destIndex = 1;
      if(args.length === 9) destIndex = 5;
      if(destIndex >= 0){
        const dx = Number(args[destIndex]);
        const dy = Number(args[destIndex+1]);
        const dw = Number(args[destIndex+2]);
        const dh = Number(args[destIndex+3]);
        if([dx,dy,dw,dh].every(Number.isFinite)){
          const slot = identifySlot(this.canvas, dx, dy, dw, dh);
          if(slot){
            args[destIndex] = dx + offsets[slot].x * (this.canvas.width/297);
            args[destIndex+1] = dy + offsets[slot].y * (this.canvas.height/210);
          }
        }
      }
    }catch(error){ console.warn('Ajuste de posição ignorado:', error); }
    return nativeDrawImage.apply(this, args);
  };

  function triggerPreview(){
    const slider = $('#scale-leftTop');
    if(slider) slider.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function updateValues(){
    for(const key of SLOT_ORDER){
      const x = $(`[data-pos-x="${key}"]`);
      const y = $(`[data-pos-y="${key}"]`);
      if(x) x.textContent = `${offsets[key].x > 0 ? '+' : ''}${offsets[key].x} mm`;
      if(y) y.textContent = `${offsets[key].y > 0 ? '+' : ''}${offsets[key].y} mm`;
    }
  }

  function move(key, axis, delta){
    offsets[key][axis] = Math.max(-40, Math.min(40, offsets[key][axis] + delta));
    saveOffsets();
    updateValues();
    triggerPreview();
  }

  function resetAll(){
    offsets = Object.fromEntries(SLOT_ORDER.map(key => [key,{x:0,y:0}]));
    saveOffsets();
    updateValues();
    triggerPreview();
  }

  function createControls(){
    if($('#positionControls')) return true;
    const resizeGrid = $('.resize-grid');
    if(!resizeGrid) return false;
    const section = document.createElement('section');
    section.id = 'positionControls';
    section.className = 'position-section';
    section.innerHTML = `
      <div class="position-head">
        <div><strong>Mover as 4 artes</strong><div class="muted-small">Cada clique move exatamente 1 mm. As marcas de corte e o tamanho A4 não mudam.</div></div>
        <button class="btn small" type="button" id="resetPositions">↺ Centralizar todas</button>
      </div>
      <div class="position-grid">
        ${SLOT_ORDER.map(key => `
          <div class="position-card">
            <strong>${SLOT_LABELS[key]}</strong>
            <div class="arrow-pad">
              <span></span><button type="button" data-move="${key}" data-axis="y" data-delta="-1" title="Subir 1 mm">↑</button><span></span>
              <button type="button" data-move="${key}" data-axis="x" data-delta="-1" title="Mover 1 mm para a esquerda">←</button>
              <button type="button" class="position-center" data-reset-one="${key}" title="Centralizar esta arte">•</button>
              <button type="button" data-move="${key}" data-axis="x" data-delta="1" title="Mover 1 mm para a direita">→</button>
              <span></span><button type="button" data-move="${key}" data-axis="y" data-delta="1" title="Descer 1 mm">↓</button><span></span>
            </div>
            <div class="position-values"><span>X: <b data-pos-x="${key}">0 mm</b></span><span>Y: <b data-pos-y="${key}">0 mm</b></span></div>
          </div>
        `).join('')}
      </div>`;
    resizeGrid.insertAdjacentElement('afterend', section);
    $$('[data-move]', section).forEach(button => button.onclick = () => move(button.dataset.move, button.dataset.axis, Number(button.dataset.delta)));
    $$('[data-reset-one]', section).forEach(button => button.onclick = () => {
      offsets[button.dataset.resetOne] = {x:0,y:0};
      saveOffsets(); updateValues(); triggerPreview();
    });
    $('#resetPositions', section).onclick = resetAll;
    updateValues();
    return true;
  }

  function applyPrintOffsets(){
    const images = $$('#printRoot .print-sheet img');
    images.slice(0,4).forEach((image,index) => {
      const key = SLOT_ORDER[index];
      image.style.transform = `translate(${offsets[key].x}mm, ${offsets[key].y}mm)`;
      image.style.transformOrigin = 'center center';
    });
  }

  const observer = new MutationObserver(() => {
    createControls();
    applyPrintOffsets();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('beforeprint', applyPrintOffsets);
  setInterval(createControls,900);
})();
