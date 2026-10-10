import {customerSearch,customerLink} from './attendance-customer-api.js?v=customer-link-v1';

let timer=null;
const button=(text,primary=false)=>{const b=document.createElement('button');b.type='button';b.className=`attendance-customer-btn${primary?' primary':''}`;b.textContent=text;return b};
const status=(text,tone='neutral')=>{const d=document.createElement('div');d.className=`attendance-customer-status ${tone}`;d.textContent=text;return d};

export function renderCustomerSearch({card,conversationId,phone='',onDone,onCancel}){
  card.replaceChildren();const h=document.createElement('h3');h.textContent='Cliente';const p=document.createElement('p');p.className='attendance-customer-note';p.textContent='Busque por nome, telefone ou CPF/CNPJ e vincule o cadastro correto.';card.append(h,p);
  const phoneBox=document.createElement('div');phoneBox.className='attendance-customer-phone';const label=document.createElement('span');label.textContent='WhatsApp da conversa';const strong=document.createElement('strong');strong.textContent=phone||'Não identificado';phoneBox.append(label,strong);card.append(phoneBox);
  const input=document.createElement('input');input.type='search';input.className='attendance-customer-search';input.placeholder='Nome, telefone ou CPF/CNPJ';input.autocomplete='off';
  const results=document.createElement('div');results.className='attendance-customer-results';const back=button('Voltar');back.onclick=()=>onCancel?.();card.append(input,results,back);
  const run=async()=>{
    const q=input.value.trim();if(q.length<2){results.replaceChildren();return}
    results.replaceChildren(status('Buscando…'));
    try{
      const data=await customerSearch(q);if(!input.isConnected)return;results.replaceChildren();
      for(const item of data.items||[]){
        const row=document.createElement('article');row.className='attendance-customer-result';
        const info=document.createElement('div');const name=document.createElement('strong');name.textContent=item.customer_name||'Cliente';const meta=document.createElement('small');meta.textContent=[item.phone_e164,item.masked_document].filter(Boolean).join(' · ')||'Sem telefone/documento';info.append(name,meta);
        const link=button('Vincular',true);link.onclick=async()=>{link.disabled=true;try{await customerLink(conversationId,item.customer_id);onDone?.()}catch{link.disabled=false;row.append(status('Não foi possível vincular este cadastro.','error'))}};
        row.append(info,link);results.append(row);
      }
      if(!results.children.length)results.append(status('Nenhum cadastro encontrado.'));
    }catch{if(input.isConnected)results.replaceChildren(status('Não foi possível buscar cadastros.','error'))}
  };
  input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>run().catch(()=>{}),250)};input.focus();
}
