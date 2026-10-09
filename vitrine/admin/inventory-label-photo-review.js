/* DA6 — revisão humana explícita das contagens, sem baixa automática de estoque. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function render(photo){
 if(!['complete','needs_review'].includes(photo?.status))return '';
 const serial=String(photo.parsed?.label_serial||'');
 const productId=String(photo.parsed?.product_id||'');
 if(!/^[0-9A-F]{10,20}$/.test(serial)||!/^[-a-f0-9]{36}$/i.test(productId))
  return '<small>Identidade não verificada. É necessário fotografar novamente.</small>';
 const rows=Array.isArray(photo.review_counts)?photo.review_counts:[];
 const errors=Array.isArray(photo.parsed?.errors)?photo.parsed.errors:[];
 const issues=new Set(errors.map(x=>Number(x.slot)).filter(n=>n>=1&&n<=6));
 const slots=new Set([...rows.map(x=>Number(x.balance_slot)),...issues]);
 if(!slots.size)return '<small>Nenhum balanço ativado. Nada a confirmar.</small>';
 const sections=[...slots].sort((a,b)=>a-b).map(slot=>{
  const count=rows.find(x=>Number(x.balance_slot)===slot);
  const finalized=['approved','rejected'].includes(count?.status);
  const detected=count?Number(count.quantity):null;
  const issue=errors.find(x=>Number(x.slot)===slot);
  let title=count?'Contagem: '+detected+' · '+(count.status==='pending_review'?'Pendente':count.status==='approved'?'Aprovada':'Rejeitada'):
      'Leitura incerta'+(issue?.reason?' ('+esc(issue.reason)+')':'');
  const controls=finalized?'<small>Revisão encerrada</small>':
   '<div class="da6-review-controls">'+
   (count?'<button type="button" data-da6-decision="approve" data-da6-slot="'+slot+'" class="secondary">Aprovar '+detected+'</button>'+
     '<button type="button" data-da6-decision="reject" data-da6-slot="'+slot+'" class="secondary">Rejeitar</button>':'')+
   '<label>Quantidade correta (0–99)<input type="number" min="0" max="99" step="1" data-da6-quantity="'+slot+'" inputmode="numeric" placeholder="Quantidade"></label>'+
   '<label>Motivo da correção<input type="text" maxlength="500" data-da6-note="'+slot+'" placeholder="Explique a conferência"></label>'+
   '<button type="button" data-da6-decision="correct" data-da6-slot="'+slot+'" class="secondary">Corrigir e aprovar</button></div>';
  return '<section class="da6-review-slot"><strong>Balanço '+slot+'</strong><span>'+title+'</span>'+controls+'</section>';
 }).join('');
 return '<details class="da6-review" data-da6-review-photo="'+esc(photo.id)+'"><summary>Conferir balanços · '+esc(serial)+'</summary>'+
  '<p>Confira a etiqueta original. Quantidades aprovadas são históricas e não atualizam o estoque automaticamente.</p>'+
  sections+'</details>';
}
function bind(container,bridge,refresh){
 if(!container)return;
 container.querySelectorAll('[data-da6-decision]').forEach(button=>{
  button.onclick=async()=>{
   if(button.disabled)return;
   const details=button.closest('[data-da6-review-photo]');
   const photo_id=details?.dataset.da6ReviewPhoto,slot=Number(button.dataset.da6Slot);
   const decision=button.dataset.da6Decision;
   const qtyEl=details?.querySelector('[data-da6-quantity="'+slot+'"]');
   const noteEl=details?.querySelector('[data-da6-note="'+slot+'"]');
   let quantity=null,note='';
   if(decision==='correct'){
    quantity=Number(qtyEl?.value);
    note=String(noteEl?.value||'').trim();
    if(qtyEl?.value===''||!Number.isInteger(quantity)||quantity<0||quantity>99){
     bridge.toast('Informe uma quantidade de 0 a 99.');qtyEl?.focus();return;
    }
    if(note.length<5){bridge.toast('Informe o motivo da correção (pelo menos 5 caracteres).');noteEl?.focus();return;}
   }
   if(!root.confirm('Confirmar '+({approve:'aprovação',reject:'rejeição',correct:'correção'}[decision])+' do balanço '+slot+'? Esta ação ficará registrada no histórico.'))return;
   button.disabled=true;
   try{
    const response=await bridge.api('inventory_label_photo_review',{},{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({photo_id,slot,decision,quantity,note})
    });
    if(!response?.review?.ok)throw Error('Revisão não confirmada');
    bridge.toast('Revisão registrada.');
    await refresh();
   }catch(err){bridge.toast('Não foi possível revisar: '+String(err?.message||err));button.disabled=false;}
  };
 });
}
root.DonaAntoniaLabelReview={render,bind};
})(window);
