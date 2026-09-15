const sidebar=document.getElementById('sidebar');

sidebar?.addEventListener('click',e=>{
  const target=e.target.closest('[data-route]');
  if(!target)return;
  e.preventDefault();
  const next=String(target.dataset.route||'').trim();
  if(!next)return;
  if(location.hash===`#${next}`)return;
  location.hash=next;
});
