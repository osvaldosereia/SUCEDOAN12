(() => {
  'use strict';
  const API = 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-products-live-v1';
  const RPC = 'https://ssbesxgaijknwsjbsbcz.supabase.co/rest/v1/rpc/';
  const AUTH = 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-pin-auth-v1';
  const VERIFY = 'https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/verify';
  // Publishable/anon key from the existing Admin. This is NOT a service-role key.
  const KEY = 'sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
  const SESSION = 'da_finance_access_token_v1';
  const SEPARATORS = [
    { key:'jose', label:'José' }, { key:'claudio', label:'Cláudio' },
    { key:'jovenil', label:'Jovenil' }, { key:'kelly', label:'Kelly' }
  ];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const idOk = value => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value || ''));
  const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const qty = value => Number.isInteger(Number(value)) ? String(value) : Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
  const formatDate = value => value ? new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
  const SEPARATION_STATES = new Set(['pending','separated','missing']);
  let queue = [], selectedId = null, detail = null, busy = false, loading = false;
  let onlyPending = false, itemSearch = '', toastTimeout = null;
  const tokenValid = token => {
    if (!token) return false;
    try {
      const part = token.split('.')[1];
      const decoded = JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
      return Number(decoded.exp) > Math.floor(Date.now()/1000) + 50;
    } catch { return false; }
  };
  const storedToken = () => {
    const token = sessionStorage.getItem(SESSION) || '';
    if (!tokenValid(token)) { sessionStorage.removeItem(SESSION); return ''; }
    return token;
  };
  const errText = err => {
    const message = String(err?.message || err || 'Erro desconhecido');
    const translations = {
      stale_order_version: 'Outro funcionário atualizou o pedido. Os dados foram recarregados; confira antes de tentar novamente.',
      order_version_conflict: 'Outro funcionário modificou o pedido. Confira os itens atualizados.',
      separator_assignment_changed: 'O responsável mudou. Verifique antes de registrar o produto.',
      separator_required: 'Escolha o responsável pela separação antes de continuar.',
      order_not_confirmed_for_queue: 'Este pedido não está mais confirmado.',
      order_not_found: 'Pedido não encontrado.',
      forbidden: 'Seu acesso não permite esta operação.',
      invalid_order: 'Pedido inválido.',
      failed_to_fetch: 'Sem conexão com o servidor. Confira a internet.',
      admin_not_authorized: 'Conta sem acesso à operação.'
    };
    return translations[message.toLowerCase()] || message.replace(/_/g,' ').slice(0,170);
  };
  class RequestError extends Error {
    constructor(code, status, message) { super(code); this.status=status; this.detail=message; }
  }
  const fetchJson = async (url, options = {}) => {
    if (!navigator.onLine) throw new RequestError('failed_to_fetch',0);
    const response = await fetch(url, {...options,cache:'no-store'});
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok || data?.ok === false) {
      const message = data?.error || data?.message || 'service_unavailable';
      throw new RequestError(String(message),response.status,data?.message);
    }
    return data;
  };
  const authHeaders = () => {
    const token = storedToken();
    if (!token) throw new RequestError('session_expired',401);
    return {'Authorization':'Bearer '+token, 'apikey':KEY};
  };
  const action = async (name, body=null, params=null) => {
    const url = new URL(API);
    url.searchParams.set('action',name);
    if (params) for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
    return fetchJson(url.toString(),body===null?{headers:authHeaders()}:{
      method:'POST',
      headers:{...authHeaders(),'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
  };
  const rpc = async name => fetchJson(RPC+name,{
    method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},body:'{}'
  });
  const toast = (message, failure=false) => {
    const element=$('toast');
    element.textContent=message; element.classList.toggle('error',failure);element.hidden=false;
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{element.hidden=true},4400);
  };
  const setConnection = (label, state='ok') => {
    $('connectionText').textContent=label;
    $('connection').className='connection'+(state==='ok'?'':' '+state);
  };
  const show = id => {
    for(const view of ['loginView','queueView','detailView']) $(view).hidden = view!==id;
    $('logoutBtn').hidden=id==='loginView';
  };
  const fail = err => {
    if (err?.status===401 || err?.message==='session_expired' || err?.message==='admin_session_invalid') {
      sessionStorage.removeItem(SESSION); detail=null; selectedId=null; show('loginView');
      $('loginError').textContent='A sessão expirou. Informe novamente o código de acesso.';
      $('loginError').hidden=false;
      setConnection('Acesso expirado','error'); return;
    }
    setConnection(navigator.onLine?'Falha de conexão':'Sem internet','error');
    toast(errText(err),true);
  };
  const originalNumber = value => {
    // The checkout displays order_public_code from order_public_snapshots_v1.
    // orders.order_number is an internal identifier and must never be shown to pickers.
    const code = String(value?.public_code || value?.order_public_code || '').trim().toUpperCase();
    return /^[A-Z]{2}[0-9]{3}$/.test(code) ? code : 'NÚMERO INDISPONÍVEL';
  };
  const progress = counts => {
    const total = Number(counts?.total||0);
    const done = Number(counts?.separated||0)+Number(counts?.missing||0);
    const pending = Math.max(0,Number(counts?.pending??total-done));
    return {total,done,pending,pct:total?Math.min(100,Math.round(done/total*100)):0};
  };
  const progressHtml = counts => {
    const p=progress(counts);
    if (!p.total) return '<div class="picker-meta">Itens serão carregados ao abrir</div>';
    return '<div class="progress-copy"><span>Progresso da separação</span><b>'+p.done+' de '+p.total+'</b></div>'+
      '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="'+p.total+'" aria-valuenow="'+p.done+'"><span style="width:'+p.pct+'%"></span></div>'+
      '<div class="picker-meta">'+p.pending+' pendente(s) · '+(Number(counts.separated)||0)+' separado(s)'+(Number(counts.missing)?' · '+counts.missing+' faltou':'')+'</div>';
  };
  const renderQueue = () => {
    const search=$('queueSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const visible=queue.filter(o=>[o.public_code,o.customer_name].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search));
    $('queueCount').textContent=String(queue.length);
    $('queueList').innerHTML=visible.length?visible.map(o=>{
      const p=progress(o.counts),started=Boolean(o.separator_key || p.done);
      const assignedName=String(o.separator_label||SEPARATORS.find(x=>x.key===o.separator_key)?.label||'').trim();
      const responsible=assignedName||'Responsável não identificado';
      const assignmentBanner=started?'<div class="queue-assignment-banner" role="status"><strong>EM SEPARAÇÃO</strong><span aria-hidden="true">—</span><span class="queue-assignment-name">'+esc(responsible)+'</span></div>':'';
      return '<article class="queue-card'+(started?' is-running':'')+'"><div class="queue-card-main">'+
        '<div class="card-top"><span class="status'+(started?' running':'')+'">'+(started?'EM ANDAMENTO':'PRONTO PARA SEPARAR')+'</span><span class="card-date">'+esc(formatDate(o.created_at))+'</span></div>'+
        assignmentBanner+
        '<div class="order-number">#'+esc(originalNumber(o))+'</div><div class="customer">'+esc(o.customer_name||'Cliente')+'</div>'+
        progressHtml(o.counts)+'</div>'+
        '<button type="button" class="queue-open" data-open="'+esc(o.id)+'">'+(started?'CONTINUAR SEPARAÇÃO':'INICIAR SEPARAÇÃO')+' <span aria-hidden="true">→</span></button></article>';
    }).join(''):'<section class="empty-card"><span class="empty-icon" aria-hidden="true">📦</span><h2>'+(queue.length?'Nenhum pedido encontrado':'Nenhum pedido para separar')+'</h2><p>'+(queue.length?'Tente buscar pelo número ou pelo nome do cliente.':'A fila começa vazia. O responsável deve usar o botão SEPARAR AGORA em um pedido confirmado no Admin.')+'</p></section>';
  };
  const loadQueue = async (silent=false) => {
    if (loading || busy) return;
    loading=true;
    if (!silent) $('queueFeedback').textContent='Atualizando fila…';
    try {
      const data=await rpc('manual_pick_queue_feed_v1');
      if (!Array.isArray(data.orders)) throw new Error('invalid_queue_feed');
      queue=data.orders.filter(o=>idOk(o.id)&&['confirmed','processing'].includes(o.status));
      $('queueFeedback').textContent='';
      setConnection('Sincronizado');
      renderQueue();
    } catch(err) {
      if(!silent) $('queueFeedback').textContent='Não foi possível carregar a fila. Use atualizar para tentar novamente.';
      fail(err);
    } finally {loading=false}
  };
  const signIn = async event => {
    event.preventDefault();
    const button=$('loginBtn'),code=$('pin').value.trim();
    if(!code)return;
    button.disabled=true;button.textContent='Validando acesso…';$('loginError').hidden=true;
    try {
      const issued=await fetchJson(AUTH,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({pin:code})});
      const verification=await fetchJson(VERIFY,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({token_hash:issued.token_hash,type:issued.verification_type||'email'})});
      if(!tokenValid(verification.access_token)) throw new Error('invalid_session_token');
      sessionStorage.setItem(SESSION,verification.access_token);
      $('pin').value='';
      // A valid token alone is not sufficient: feed checks active Admin authorization.
      const check=await rpc('manual_pick_queue_feed_v1');
      if(!Array.isArray(check.orders)) throw new Error('invalid_queue_feed');
      queue=check.orders.filter(o=>idOk(o.id));
      renderQueue();show('queueView');setConnection('Sincronizado');
    } catch(err) {
      sessionStorage.removeItem(SESSION);
      $('loginError').textContent='Acesso não autorizado. Verifique o código e tente novamente.';
      $('loginError').hidden=false;setConnection('Acesso necessário','error');
    } finally {button.disabled=false;button.textContent='Entrar na separação'}
  };
  const visibleItems = data => {
    const items=Array.isArray(data?.items)?data.items:[];
    const keys=new Set(items.filter(x=>['basket_component','basket_mold_component'].includes(x.kind)).map(x=>String(x.basket_id||x.basket_name||'')).filter(Boolean));
    return items.filter(x=>!(['basket','basket_mold'].includes(x.kind)&&keys.has(String(x.basket_id||x.basket_name||x.name||''))));
  };
  const sepLabel = key => SEPARATORS.find(x=>x.key===String(key||'').toLowerCase())?.label||'';
  const photo = item => {
    let image='';
    try {const url=new URL(String(item.image_url||''),location.origin);if(url.protocol==='https:'||url.protocol==='http:')image=url.href;}catch{}
    return image?'<img src="'+esc(image)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'<span class="item-placeholder" aria-hidden="true">▧</span>';
  };
  const itemHtml = item => {
    const state=SEPARATION_STATES.has(item.state)?item.state:'pending';
    const badge=state==='separated'?'✓ SEPARADO':state==='missing'?'! FALTOU':'PENDENTE';
    return '<article class="item-card '+state+'"><div class="item-photo">'+photo(item)+'</div><div class="item-info">'+
      '<div class="item-name">'+esc(item.name||'Produto')+'</div>'+
      '<div class="qty-line"><span class="qty-label">QUANTIDADE</span><strong class="qty">'+esc(qty(item.quantity))+'</strong></div>'+
      (item.sku?'<div class="item-meta">Cód. '+esc(item.sku)+'</div>':'')+
      '<span class="item-badge '+(state==='missing'?'missing':'')+'">'+badge+'</span></div>'+
      '<div class="item-actions"><button class="'+(state==='separated'?'active-good':'')+'" type="button" data-item="'+esc(item.order_item_id)+'" data-state="separated" '+(detail?.completion?.completed_at||!detail?.assignment?.separator_key||busy?'disabled':'')+'>✓ SEPARADO</button>'+
      '<button class="missing-btn '+(state==='missing'?'active-missing':'')+'" type="button" data-item="'+esc(item.order_item_id)+'" data-state="missing" '+(detail?.completion?.completed_at||!detail?.assignment?.separator_key||busy?'disabled':'')+'>FALTOU</button></div></article>';
  };
  const renderItems = () => {
    if(!detail)return;
    const term=itemSearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const items=visibleItems(detail).filter(item=>(!onlyPending||item.state==='pending')&&(String(item.name||'')+' '+String(item.sku||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term));
    $('itemsList').innerHTML=items.length?items.map(itemHtml).join(''):'<div class="empty-card"><h2>Sem itens neste filtro</h2><p>Desative o filtro ou limpe a busca para ver os demais produtos.</p></div>';
  };
  const renderDetail = () => {
    if(!detail)return;
    const d=detail,p=progress(d.counts),assigned=d.assignment?.separator_key,completed=Boolean(d.completion?.completed_at);
    $('detailContent').innerHTML='<div class="detail-head"><div><span class="eyebrow">PEDIDO SELECIONADO</span>'+
      '<h1>#'+esc(originalNumber(d))+'</h1><p>'+esc(d.customer_name||'Cliente')+'</p>'+
      '<p>'+p.total+' produto(s) na lista de separação</p></div><div class="detail-total">'+esc(money(d.final_total??d.total))+'</div></div>'+
      '<div class="separator-box"><div class="separator-box-title">'+(assigned?'Responsável: '+esc(d.assignment.separator_label||sepLabel(assigned)):'Quem vai separar este pedido?')+'</div>'+
      '<p>'+ (assigned?'A troca de responsável exige confirmação.':'Escolha o colaborador antes de marcar os produtos.')+'</p>'+
      (completed?'':'<div class="separator-list">'+SEPARATORS.map(x=>'<button type="button" data-separator="'+esc(x.key)+'" class="'+(x.key===assigned?'active':'')+'">'+esc(x.label)+'</button>').join('')+'</div>')+'</div>'+
      '<div class="summary-strip"><div class="summary-head"><span>Produtos verificados</span><b>'+p.done+' / '+p.total+'</b></div>'+
      progressHtml(d.counts)+'</div>'+
      '<div class="list-controls"><h2>Lista de produtos</h2><label class="check-pending"><input type="checkbox" id="pendingOnly" '+(onlyPending?'checked':'')+'> Somente pendentes</label></div>'+
      '<div class="search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16.4 16.4 4 4"/></svg>'+
      '<input id="itemSearch" type="search" aria-label="Buscar produto" placeholder="Buscar produto na lista" value="'+esc(itemSearch)+'"></div>'+
      '<div class="items-grid" id="itemsList"></div>'+
      '<div class="sticky-finish"><div class="finish-text"><strong>'+(p.pending?'Faltam '+p.pending+' produto(s)':'Todos os produtos conferidos')+'</strong>'+
      '<span>'+(p.pending?'Marque cada item como SEPARADO ou FALTOU.':p.total?'Confira e finalize a separação.':'Não há itens disponíveis para concluir.')+'</span></div>'+
      '<button type="button" class="btn primary" id="completeBtn" '+(p.pending||!p.total||!assigned||completed||busy?'disabled':'')+'>'+
      (completed?'SEPARAÇÃO CONCLUÍDA':!assigned?'ESCOLHA O RESPONSÁVEL':'CONCLUIR SEPARAÇÃO')+'</button></div>';
    $('pendingOnly').addEventListener('change',e=>{onlyPending=e.target.checked;renderItems()});
    $('itemSearch').addEventListener('input',e=>{itemSearch=e.target.value;renderItems()});
    $('completeBtn').addEventListener('click',completeOrder);
    renderItems();
  };
  const loadDetail = async (id,{preserveScroll=false}={}) => {
    if(!idOk(id))return;
    const y=window.scrollY;
    try {
      const result=await action('order_separation_get',null,{id});
      const data=result.separation||result;
      if(data.ok===false)throw new Error(data.error||'separation_unavailable');
      if(data.order_id!==id)throw new Error('order_mismatch');
      detail=data;selectedId=id;show('detailView');renderDetail();
      setConnection('Sincronizado');
      if(preserveScroll)window.scrollTo(0,y);else window.scrollTo(0,0);
    } catch(err) {fail(err);if(!preserveScroll)await backToQueue()}
  };
  const openOrder = id => {
    if(busy||!idOk(id)||!queue.some(o=>o.id===id))return; // Only manually selected orders.
    // Reuse the original Admin separation vitrine, not a second picking implementation.
    // The montar=1 parameter renders only that vitrine and returns to /montar on close.
    const url=new URL('/vitrine/admin/',location.origin);
    url.searchParams.set('separacao',id);
    url.searchParams.set('montar','1');
    window.location.assign(url.toString());
  };
  const backToQueue = async () => {
    if(busy)return;
    selectedId=null;detail=null;itemSearch='';onlyPending=false;
    show('queueView');window.scrollTo(0,0);await loadQueue();
  };
  const assign = async key => {
    if(!detail||busy||!SEPARATORS.some(x=>x.key===key))return;
    const previous=detail.assignment?.separator_key;
    if(previous===key)return;
    if(previous&&!confirm('O pedido está com '+(detail.assignment?.separator_label||sepLabel(previous))+'. Transferir para '+sepLabel(key)+'?'))return;
    busy=true;renderDetail();
    try {
      await action('order_separation_assign',{order_id:selectedId,separator_key:key});
      toast('Responsável salvo: '+sepLabel(key));
      await loadDetail(selectedId,{preserveScroll:true});
    }catch(err){fail(err);await loadDetail(selectedId,{preserveScroll:true})}
    finally{busy=false;renderDetail()}
  };
  const setItem = async (id,requested) => {
    if(!detail||busy||!detail.assignment?.separator_key||!SEPARATION_STATES.has(requested)||requested==='pending')return;
    if(!visibleItems(detail).some(x=>x.order_item_id===id))return;
    busy=true;renderDetail();
    try {
      const result=await action('order_separation_item_set',{
        order_id:selectedId,order_item_id:id,state:requested,
        expected_order_updated_at:detail.order_updated_at,
        separator_key:detail.assignment.separator_key,
        operator:detail.assignment.separator_label||sepLabel(detail.assignment.separator_key)
      });
      toast(result?.warning==='bling_approval_pending'?'Item salvo. Integração Bling pendente.':'✓ Item salvo');
      await loadDetail(selectedId,{preserveScroll:true});
    } catch(err) {
      fail(err); // Conflicts are never silently retried or overwritten.
      await loadDetail(selectedId,{preserveScroll:true});
    } finally {busy=false;renderDetail()}
  };
  const completeOrder = async () => {
    if(!detail||busy)return;
    const p=progress(detail.counts),assignment=detail.assignment;
    if(!p.total||p.pending||!assignment?.separator_key||detail.completion?.completed_at)return;
    const savedId=selectedId,savedCode=originalNumber(detail);
    if(!confirm('Concluir a separação do pedido #'+savedCode+'?\n\nEsta ação registra a conclusão no sistema.'))return;
    busy=true;renderDetail();
    try {
      await action('order_separation_complete',{
        order_id:savedId,expected_order_updated_at:detail.order_updated_at,
        separator_key:assignment.separator_key,operator:assignment.separator_label||sepLabel(assignment.separator_key)
      });
      // Do not synthesize another number after completion.
      $('packageCode').textContent=savedCode;
      $('packageModal').hidden=false;
      $('packageOk').focus();
      setConnection('Sincronizado');
    } catch(err) {
      fail(err);await loadDetail(savedId,{preserveScroll:true});
    } finally {busy=false;renderDetail()}
  };
  $('loginForm').addEventListener('submit',signIn);
  $('logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem(SESSION);queue=[];detail=null;selectedId=null;show('loginView');setConnection('Acesso necessário','error');});
  $('reloadBtn').addEventListener('click',()=>{if(selectedId)loadDetail(selectedId,{preserveScroll:true});else loadQueue()});
  $('detailReload').addEventListener('click',()=>{if(selectedId&&!busy)loadDetail(selectedId,{preserveScroll:true})});
  $('backBtn').addEventListener('click',backToQueue);
  $('queueSearch').addEventListener('input',renderQueue);
  $('queueList').addEventListener('click',event=>{const btn=event.target.closest('[data-open]');if(btn)openOrder(btn.dataset.open)});
  $('detailContent').addEventListener('click',event=>{
    const separator=event.target.closest('[data-separator]');
    if(separator){assign(separator.dataset.separator);return}
    const item=event.target.closest('[data-item][data-state]');
    if(item)setItem(item.dataset.item,item.dataset.state);
  });
  $('packageOk').addEventListener('click',()=>{
    $('packageModal').hidden=true;
    selectedId=null;detail=null;show('queueView');window.scrollTo(0,0);loadQueue();
  });
  window.addEventListener('online',()=>{setConnection('Conectando');if(!selectedId&&storedToken())loadQueue()});
  window.addEventListener('offline',()=>setConnection('Sem internet','offline'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!selectedId&&storedToken())loadQueue(true)});
  setInterval(()=>{if(!document.hidden&&!selectedId&&storedToken())loadQueue(true)},20000);
  (async()=>{
    if(!storedToken()){show('loginView');setConnection('Acesso necessário','error');return}
    show('queueView');await loadQueue();
    const errorCode=new URLSearchParams(location.search).get('erro');
    const messages={
      pedido_invalido:'Este link de separação é inválido.',
      pedido_indisponivel:'O pedido saiu da fila SEPARAR AGORA ou não está mais disponível para separar.',
      dados_pendentes:'O pedido precisa ter os dados do cliente regularizados no Admin antes da separação.',
      vitrine_indisponivel:'Não foi possível abrir a vitrine original de separação.',
      acesso:'Não foi possível validar seu acesso à vitrine. Atualize a página e tente novamente.'
    };
    if(errorCode&&messages[errorCode])$('queueFeedback').textContent=messages[errorCode];
  })();
})();
