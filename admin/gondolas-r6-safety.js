const app=document.getElementById('gondolaApp');
const pending=new WeakSet();
const labels={
  '[data-remove-product]':'Remover este produto da gôndola? O cadastro e o estoque do produto não serão apagados.',
  '[data-toggle-gondola][data-active="1"]':'Desativar esta gôndola? Ela deixará de aceitar novas leituras até ser ativada novamente.'
};
function destructiveMessage(button){for(const [selector,message] of Object.entries(labels)){if(button.matches(selector))return message}return ''}
function setBusy(button,busy){
  if(!button)return;
  if(busy){button.dataset.r6Busy='1';button.setAttribute('aria-busy','true');button.disabled=true}
  else{delete button.dataset.r6Busy;button.removeAttribute('aria-busy');button.disabled=false}
}
app?.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.dataset.r6Busy==='1'||pending.has(button)){event.preventDefault();event.stopImmediatePropagation();return}
  const message=destructiveMessage(button);
  if(message&&!window.confirm(message)){event.preventDefault();event.stopImmediatePropagation();return}
  if(button.matches('[data-remove-product],[data-toggle-gondola],[data-rename-gondola],[data-new-gondola]')){
    pending.add(button);setBusy(button,true);
    window.setTimeout(()=>{pending.delete(button);if(button.isConnected)setBusy(button,false)},1800);
  }
},true);

let scanLocked=false;
app?.addEventListener('keydown',event=>{
  const input=event.target.closest('[data-gondola-scan]');
  if(!input||!(event.key==='Enter'||event.key==='Tab'))return;
  if(scanLocked){event.preventDefault();event.stopImmediatePropagation();return}
  scanLocked=true;window.setTimeout(()=>{scanLocked=false},180);
},true);

app?.addEventListener('input',event=>{
  const input=event.target.closest('[data-gondola-scan]');
  if(!input)return;
  input.setAttribute('aria-describedby','gondolaR6ScanHelp');
  const panel=input.closest('.gondola-scan-panel');
  if(panel&&!panel.querySelector('#gondolaR6ScanHelp')){
    const help=document.createElement('small');help.id='gondolaR6ScanHelp';help.className='muted';help.textContent='Uma leitura por vez. Se o produto estiver em outra gôndola, o fluxo atual poderá movê-lo para esta.';panel.appendChild(help)
  }
});
