const BUILD = '20260823-canecas-command-layout-v3-80pct-3cols';

function installStyles() {
  if (document.getElementById('mugCommandLayoutV3Styles')) return;
  const style = document.createElement('style');
  style.id = 'mugCommandLayoutV3Styles';
  style.textContent = `
    /* Desktop: criação ≈20% / comandos ≈80% */
    .mugv7-main.has-command-library{
      grid-template-columns:minmax(210px,1fr) minmax(0,4fr)!important;
      gap:12px!important;
      align-items:start!important;
    }
    .mugv7-main.has-command-library>.mugv7-info{display:none!important}

    /* Área de criação menor e objetiva */
    .mugv7-main.has-command-library>.mugv7-upload{
      padding:10px!important;
      gap:8px!important;
      border-radius:14px!important;
      align-self:start!important;
    }
    .mugv7-main.has-command-library .mugv7-drop{
      min-height:116px!important;
      height:142px!important;
      max-height:142px!important;
      padding:8px!important;
      border-radius:11px!important;
    }
    .mugv7-main.has-command-library .mugv7-drop img{
      width:100%!important;
      height:100%!important;
      max-height:126px!important;
      object-fit:contain!important;
    }
    .mugv7-main.has-command-library .mugv7-drop strong{font-size:14px!important}
    .mugv7-main.has-command-library .mugv7-drop small{font-size:10px!important;line-height:1.25!important}
    .mugv7-main.has-command-library .mugv7-instruction{gap:4px!important}
    .mugv7-main.has-command-library .mugv7-instruction strong{font-size:11px!important}
    .mugv7-main.has-command-library .mugv7-instruction small{font-size:9.5px!important;line-height:1.25!important}
    .mugv7-main.has-command-library .mugv7-instruction textarea{
      min-height:62px!important;
      max-height:105px!important;
      padding:8px!important;
      font-size:11px!important;
    }
    .mugv7-main.has-command-library .mugv7-actions{gap:6px!important}
    .mugv7-main.has-command-library .mugv7-actions .button{
      padding:7px 9px!important;
      min-height:32px!important;
      font-size:10px!important;
    }
    .mugv7-main.has-command-library .mugv7-status{font-size:10px!important}

    /* Biblioteca: área principal */
    .mug-command-library{
      width:100%!important;
      box-sizing:border-box!important;
      padding:12px!important;
      gap:9px!important;
      position:sticky!important;
      top:10px!important;
      max-height:calc(100vh - 88px)!important;
      overflow:auto!important;
    }
    .mug-command-head{padding:3px 0 7px!important}
    .mug-command-head h3{font-size:16px!important;line-height:1.2!important}
    .mug-command-head p{font-size:11px!important;line-height:1.25!important}

    .mug-command-form{
      grid-template-columns:minmax(150px,.65fr) minmax(260px,1.7fr) auto!important;
      align-items:end!important;
      gap:7px!important;
      padding:8px!important;
    }
    .mug-command-form input,.mug-command-form textarea{
      padding:7px 8px!important;
      font-size:11px!important;
      line-height:1.25!important;
    }
    .mug-command-form textarea{min-height:42px!important;max-height:68px!important}
    .mug-command-form-actions{align-items:center!important;flex-wrap:nowrap!important}
    .mug-command-form-actions button,.mug-command-toolbar button,.mug-command-head button{
      padding:5px 7px!important;
      min-height:27px!important;
      font-size:9.5px!important;
    }
    .mug-command-status,.mug-command-selected-count,.mug-command-effective{font-size:10px!important}
    .mug-command-effective{padding:6px 8px!important}

    /* Três colunas com tipografia legível */
    .mug-command-list{
      display:grid!important;
      grid-template-columns:repeat(3,minmax(0,1fr))!important;
      gap:7px!important;
    }
    .mug-command-item{
      padding:7px 8px!important;
      border-radius:9px!important;
      grid-template-columns:20px minmax(0,1fr)!important;
      gap:6px!important;
      min-height:72px!important;
    }
    .mug-command-check{padding-top:1px!important}
    .mug-command-check input{width:16px!important;height:16px!important;margin:0!important}
    .mug-command-body{gap:4px!important}
    .mug-command-body strong{
      font-size:12px!important;
      line-height:1.2!important;
      font-weight:800!important;
    }
    .mug-command-body p{
      font-size:10.5px!important;
      line-height:1.3!important;
      -webkit-line-clamp:3!important;
    }
    .mug-command-actions{gap:4px!important;align-items:center!important}
    .mug-command-actions button{
      padding:3px 6px!important;
      min-height:22px!important;
      font-size:9px!important;
      border-radius:5px!important;
    }
    .mug-command-default-toggle{
      min-height:22px!important;
      padding:2px 6px!important;
      font-size:12px!important;
    }

    @media(max-width:1180px){
      .mugv7-main.has-command-library{grid-template-columns:minmax(210px,1fr) minmax(0,3fr)!important}
      .mug-command-list{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      .mug-command-form{grid-template-columns:1fr 1.6fr!important}
      .mug-command-form-actions{grid-column:1/-1!important}
    }
    @media(max-width:900px){
      .mugv7-main.has-command-library{grid-template-columns:1fr!important}
      .mug-command-library{position:static!important;max-height:none!important}
      .mug-command-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .mugv7-main.has-command-library .mugv7-drop{height:125px!important;max-height:125px!important}
    }
    @media(max-width:560px){
      .mug-command-list{grid-template-columns:1fr!important}
      .mug-command-form{grid-template-columns:1fr!important}
      .mug-command-form-actions{grid-column:auto!important}
    }
  `;
  document.head.appendChild(style);
}

function apply() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  const panel = document.getElementById('mugAutomationPanel');
  if (!panel?.querySelector('.mugv7-main.has-command-library')) return void setTimeout(apply, 80);
  if (panel.dataset.commandLayoutV3 === BUILD) return;
  panel.dataset.commandLayoutV3 = BUILD;
  installStyles();
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(apply, 0);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(apply, 0);
});
const observer = new MutationObserver(() => {
  if (window.adminV2CurrentRoute?.() === 'mug-studio') apply();
});
observer.observe(document.documentElement, { childList:true, subtree:true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(apply, 0), { once:true });
else setTimeout(apply, 0);

export { apply };
