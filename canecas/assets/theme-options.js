(() => {
  'use strict';
  const scriptUrl = document.currentScript?.src || location.href;
  const dataUrl = new URL('../data/frases.json?v=20260729-6', scriptUrl).href;
  let data = null;

  function addOptions(select, values){
    if(!select || !Array.isArray(values)) return;
    const existing = new Set([...select.options].map(option => option.value));
    values.forEach(value => {
      if(!existing.has(value)) select.add(new Option(value, value));
    });
  }

  async function start(){
    const response = await fetch(dataUrl, {cache:'no-store'});
    if(!response.ok) return;
    data = await response.json();
    const themes = (data.temas || []).map(item => typeof item === 'string' ? item : item.tema).filter(Boolean);
    const styles = data.estilos || [];
    const started = Date.now();
    const timer = setInterval(() => {
      for(const slot of [1,2]){
        addOptions(document.querySelector(`#a${slot}Theme`), themes);
        addOptions(document.querySelector(`#a${slot}Style`), styles);
      }
      if(Date.now() - started > 90000) clearInterval(timer);
    }, 600);
  }

  start().catch(error => console.warn('Temas adicionais não carregados:', error));
})();
