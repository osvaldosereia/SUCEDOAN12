import {customerCreate,customerSave} from './attendance-customer-api.js?v=customer-link-v1';

function field(labelText,name,value='',options={}){
  const label=document.createElement('label');label.className='attendance-customer-field';
  const span=document.createElement('span');span.textContent=labelText;
  const input=document.createElement('input');input.name=name;input.type=options.type||'text';input.value=value||'';
  input.required=options.required===true;input.readOnly=options.readOnly===true;input.placeholder=options.placeholder||'';
  if(options.inputMode)input.inputMode=options.inputMode;
  label.append(span,input);return label;
}

function values(form){
  const v=name=>form.elements.namedItem(name)?.value?.trim?.()||'';
  return {
    display_name:v('display_name'),cpf:v('cpf'),email:v('email'),
    address:{postal_code:v('postal_code'),street:v('street'),number:v('number'),district:v('district'),complement:v('complement'),city:v('city'),state:v('state'),raw_text:v('raw_text')}
  };
}

function errorMessage(error){
  switch(String(error?.payload?.error||error?.message||'')){
    case 'name_required': return 'Informe o nome do cliente.';
    case 'phone_already_in_use': return 'Este WhatsApp já pertence a outro cadastro. Use Buscar cadastro.';
    case 'cpf_already_in_use': return 'Este CPF/CNPJ já pertence a outro cadastro. Use Buscar cadastro.';
    case 'duplicate_customer_identity': return 'Já existe um cadastro com estes dados.';
    case 'conversation_already_linked': return 'A conversa já foi vinculada a outro cliente.';
    default: return 'Não foi possível salvar o cadastro agora.';
  }
}

export function renderCustomerForm({card,conversationId,mode='create',phone='',data=null,onDone,onCancel}){
  const editing=mode==='save',customer=data?.customer||{},address=customer.address||{};
  card.replaceChildren();const h=document.createElement('h3');h.textContent='Cliente';const intro=document.createElement('p');intro.className='attendance-customer-note';intro.textContent=editing?'Edite o cadastro sem sair da conversa.':'Cadastre o cliente usando o WhatsApp desta conversa.';card.append(h,intro);
  const form=document.createElement('form');form.className='attendance-customer-form';
  form.append(
    field('Nome','display_name',customer.display_name||'',{required:true}),
    field('WhatsApp','phone',editing?(customer.phone_e164||phone):phone,{readOnly:true}),
    field('CPF/CNPJ','cpf',customer.cpf||'',{placeholder:'Opcional',inputMode:'numeric'}),
    field('E-mail','email',customer.email||'',{type:'email',placeholder:'Opcional'})
  );
  const details=document.createElement('details');details.className='attendance-customer-address';const summary=document.createElement('summary');summary.textContent='Endereço (opcional)';details.append(summary);
  const grid=document.createElement('div');grid.className='attendance-customer-grid';
  for(const item of [
    ['CEP','postal_code',address.postal_code],['Rua','street',address.street],['Número','number',address.number],['Bairro','district',address.district],
    ['Complemento','complement',address.complement],['Cidade','city',address.city],['UF','state',address.state||'MT'],['Referência','raw_text',address.raw_text]
  ])grid.append(field(item[0],item[1],item[2]||''));
  details.append(grid);form.append(details);
  const message=document.createElement('div');message.className='attendance-customer-form-message';message.hidden=true;form.append(message);
  const actions=document.createElement('div');actions.className='attendance-customer-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='attendance-customer-btn';cancel.textContent='Cancelar';cancel.onclick=()=>onCancel?.();
  const save=document.createElement('button');save.type='submit';save.className='attendance-customer-btn primary';save.textContent=editing?'Salvar alterações':'Salvar e vincular';actions.append(cancel,save);form.append(actions);
  form.onsubmit=async event=>{
    event.preventDefault();save.disabled=cancel.disabled=true;message.hidden=true;
    try{
      if(editing)await customerSave(conversationId,values(form));else await customerCreate(conversationId,values(form));
      onDone?.();
    }catch(error){message.textContent=errorMessage(error);message.className='attendance-customer-form-message error';message.hidden=false;save.disabled=cancel.disabled=false}
  };
  card.append(form);form.elements.namedItem('display_name')?.focus();
}
