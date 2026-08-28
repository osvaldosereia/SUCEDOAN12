const BUILD='20260828-mug-public-make-bridge-v2-direct-pass-through';
const INSTALL_KEY=Symbol.for('da.mug.public.make.art.bridge.v1');

// Compatibilidade: este arquivo existia para converter personalize_mug_model em
// generate_mug_art. O cenário atual já possui uma rota nativa de personalização
// que recebe separadamente a arte horizontal oficial, a foto do cliente e os
// campos preenchidos. Portanto qualquer conversão aqui seria incorreta.
function install(){
  if(window[INSTALL_KEY]?.BUILD===BUILD)return window[INSTALL_KEY];
  const nativeFetch=window.fetch.bind(window);
  const wrapped=(input,init)=>nativeFetch(input,init);
  wrapped.__daMugPublicMakeArtBridge=BUILD;
  window.fetch=wrapped;
  window[INSTALL_KEY]={BUILD,nativeFetch,wrapped,directPersonalization:true};
  document.documentElement.dataset.mugPublicMakeBridge=BUILD;
  console.info('[Canecas públicas] bridge legado em modo pass-through; personalize_mug_model permanece intacto.');
  return window[INSTALL_KEY];
}

install();
export{BUILD,install};
