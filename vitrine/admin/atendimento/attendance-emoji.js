const EMOJIS=['😊','🙂','🥰','😍','🙏','💚','❤️','✨','🎉','👍','👏','🤝','🌷','🌞','🌙','☀️','💐','🛍️','✅','📦'];
const $=selector=>document.querySelector(selector);

function insertEmoji(emoji){
  const draft=$('#messageDraft');if(!draft)return;
  const start=Number.isInteger(draft.selectionStart)?draft.selectionStart:draft.value.length;
  const end=Number.isInteger(draft.selectionEnd)?draft.selectionEnd:start;
  draft.setRangeText(emoji,start,end,'end');
  draft.dispatchEvent(new Event('input',{bubbles:true}));draft.focus();
}

function bind(){
  const button=$('#emojiBtn'),picker=$('#emojiPicker');if(!button||!picker)return;
  const fragment=document.createDocumentFragment();
  for(const emoji of EMOJIS){const item=document.createElement('button');item.type='button';item.className='emoji-option';item.textContent=emoji;item.setAttribute('aria-label',`Inserir ${emoji}`);item.addEventListener('click',()=>insertEmoji(emoji));fragment.append(item)}
  picker.replaceChildren(fragment);
  button.addEventListener('click',()=>{const open=picker.hidden;picker.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)picker.querySelector('button')?.focus()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!picker.hidden){picker.hidden=true;button.setAttribute('aria-expanded','false');button.focus()}});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
