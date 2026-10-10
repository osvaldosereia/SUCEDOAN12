import {marketingConsentRequest,marketingConsentState} from './attendance-customer-api.js?v=weekly-consent-template-v2';

const button=(text,primary=false)=>{const b=document.createElement('button');b.type='button';b.className=`attendance-customer-btn${primary?' primary':''}`;b.textContent=text;return b};
const fmt=value=>{if(!value)return'';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
const labels={
  opt_in:{title:'Autorizado',tone:'success',detail:'Ofertas e cupons até 1x/semana'},
  opt_out:{title:'Não autorizado',tone:'error',detail:'Cliente recusou ou cancelou ofertas semanais.'},
  pending:{title:'Aguardando resposta',tone:'warning',detail:'Template oficial enviado com botões SIM, QUERO RECEBER e AGORA NÃO.'},
  prepared:{title:'Pronto para enviar',tone:'neutral',detail:'O consentimento será solicitado somente por template oficial da Meta.'},
  send_failed:{title:'Envio falhou',tone:'warning',detail:'O template poderá ser enviado novamente com nova tentativa segura.'},
  never_asked:{title:'Não perguntado',tone:'neutral',detail:'O cliente ainda não informou se quer receber ofertas semanais.'}
};

function messageNode(box,text,tone='error'){
  let msg=box.querySelector('.attendance-marketing-consent-error');
  if(!msg){msg=document.createElement('div');msg.className='attendance-marketing-consent-error';box.append(msg)}
  msg.dataset.tone=tone;msg.textContent=text;return msg;
}

function renderBox(box,state,conversationId){
  box.replaceChildren();
  const head=document.createElement('div');head.className='attendance-marketing-consent-head';
  const title=document.createElement('strong');title.textContent='Ofertas pelo WhatsApp';
  const pill=document.createElement('span');
  const info=labels[state?.consent_state]||labels.never_asked;
  pill.className=`attendance-marketing-consent-pill ${info.tone}`;pill.textContent=info.title;head.append(title,pill);box.append(head);
  const detail=document.createElement('div');detail.className='attendance-marketing-consent-detail';detail.textContent=info.detail;box.append(detail);

  const when=fmt(state?.responded_at||state?.asked_at);
  if(when){const meta=document.createElement('small');meta.className='attendance-marketing-consent-meta';meta.textContent=(state?.consent_state==='opt_in'||state?.consent_state==='opt_out'?`Atualizado em ${when}`:`Perguntado em ${when}`);box.append(meta)}

  if(state?.consent_state==='never_asked'||state?.consent_state==='prepared'||state?.consent_state==='send_failed'){
    const actions=document.createElement('div');actions.className='attendance-customer-actions compact';
    const ask=button(state?.consent_state==='never_asked'?'Pedir autorização':'Enviar template',true);
    ask.disabled=state?.can_ask!==true;
    if(state?.service_window_open!==true){ask.title='Disponível somente dentro da janela de 24h após a mensagem do cliente.'}
    ask.onclick=async()=>{
      ask.disabled=true;ask.textContent='Verificando template…';
      try{
        await marketingConsentRequest(conversationId);
        const fresh=await marketingConsentState(conversationId);
        renderBox(box,fresh,conversationId);
      }catch(error){
        const code=String(error?.message||'');
        const payload=error?.payload||{};
        if(code==='service_window_closed'){
          const next={...state,can_ask:false,service_window_open:false};renderBox(box,next,conversationId);return;
        }
        if(code==='weekly_consent_template_pending_approval'){
          ask.disabled=false;ask.textContent='Verificar aprovação';
          messageNode(box,`Template oficial ${payload?.created===true?'criado e ':''}aguardando aprovação da Meta. Nenhuma mensagem foi enviada.`,'warning');
          return;
        }
        if(code==='weekly_consent_template_unavailable'){
          ask.disabled=true;ask.textContent='Template indisponível';
          messageNode(box,'O template de consentimento foi pausado, rejeitado ou desativado na Meta. Nenhuma mensagem foi enviada.');
          return;
        }
        if(code==='meta_send_uncertain'||code==='weekly_consent_send_in_progress'){
          ask.disabled=true;ask.textContent='Verificando envio';
          messageNode(box,'O resultado do envio ainda não é definitivo. Não reenvie agora para evitar duplicidade.','warning');
          return;
        }
        ask.disabled=false;ask.textContent='Tentar novamente';
        messageNode(box,'Não foi possível enviar o template de autorização agora.');
      }
    };
    actions.append(ask);box.append(actions);
    if(state?.service_window_open!==true){const note=document.createElement('small');note.className='attendance-marketing-consent-meta';note.textContent='O pedido de autorização só fica disponível dentro da janela de 24h.';box.append(note)}
  }
}

export async function renderMarketingConsent({card,conversationId}){
  if(!card||!conversationId)return;
  let box=card.querySelector('[data-attendance-marketing-consent]');
  if(!box){box=document.createElement('section');box.className='attendance-marketing-consent';box.dataset.attendanceMarketingConsent='1';card.append(box)}
  if(box.dataset.loading==='1')return;
  box.dataset.loading='1';
  try{const state=await marketingConsentState(conversationId);if(box.isConnected)renderBox(box,state,conversationId)}
  catch{if(box.isConnected){box.replaceChildren();messageNode(box,'Não foi possível carregar o consentimento de ofertas.')}}
  finally{delete box.dataset.loading}
}
