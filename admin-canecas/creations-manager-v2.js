(() => {
  'use strict';

  const BUILD = '20260903-admin-creations-manager-v2';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const NODES = { creations:'canecas/personalizadas', orders:'canecas/pedidos', print:'canecas/print_jobs' };
  const PAGE_SIZE = 50;

  if (window.__CF_CREATIONS_MANAGER__ === BUILD) return;
  window.__CF_CREATIONS_MANAGER__ = BUILD;

  const state = { creations:[], orders:[], printJobs:[], loading:false, query:'', status:'', period:'30', sort:'new', page:1, loadedAt:0 };
  const text = v => String(v ?? '').trim();
  const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const safeKey = v => text(v).replace(/[.#$\[\]/]/g,'_');
  const root = () => document.getElementById('creations');
  const nowIso = () => new Date().toISOString();

  function active() {
    return location.hash === '#creations' || document.querySelector('.view[data-view="creations"]')?.classList.contains('active');
  }

  function toast(message, error=false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast${error ? ' error' : ''}`;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, error ? 4300 : 2400);
  }

  async function fbGet(path) {
    const r = await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!r.ok) throw new Error(`Firebase ${r.status}`);
    return r.json();
  }

  async function fbPatch(path, payload) {
    const r = await fetch(`${FIREBASE}/${path}.json`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
    if (!r.ok) throw new Error(`Firebase ${r.status}`);
    return r.json();
  }

  function asRows(data) {
    return Object.entries(data || {}).map(([__key,v]) => ({ __key, id:text(v?.id || __key), ...(v || {}) }));
  }

  function createdAt(c={}) { return text(c.criado_em || c.created_at || c.createdAt || c.gerado_em || c.updated_at); }
  function createdMs(c={}) { const n = Date.parse(createdAt(c)); return Number.isFinite(n) ? n : 0; }
  function formatDate(value) {
    const d = new Date(value || 0); if (!Number.isFinite(d.getTime()) || !d.getTime()) return '—';
    return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  function artUrl(c={}) { return text(c?.arte_aprovada?.url || c.arte_horizontal || c.arte_personalizacao || c.arte_final_url || c?.arte_impressao?.url); }
  function modelName(c={}) { return text(c.modelo_nome || c.produto_nome || c.nome_modelo || c.modelo_key || 'Caneca personalizada'); }
  function clientName(c={}) { return text(c.cliente_nome || c?.cliente?.nome || c.nome_cliente || 'Cliente não identificado'); }
  function clientEmail(c={}) { return text(c.cliente_email || c?.cliente?.email || c.email); }
  function clientPhone(c={}) { return text(c.cliente_whatsapp || c?.cliente?.whatsapp || c?.cliente?.telefone || c.telefone); }
  function rawStatus(c={}) { return norm(c?.encomenda?.status || c.atendimento_status || c.status || 'arte_pronta'); }
  function payment(c={}, order=null) { return norm(c.pagamento_status || c?.encomenda?.pagamento_status || order?.pagamento?.status || order?.pagamento_status); }
  function orderId(c={}) { return text(c.pedido_id || c.pedido_loja_integrada_id || c?.encomenda?.pedido_id); }
  function contactedAt(c={}) { return text(c.cliente_contatado_em || c?.atendimento?.contatado_em || c.contatado_em); }
  function isContacted(c={}) { return Boolean(contactedAt(c)); }

  function findOrder(c) {
    const explicit = orderId(c);
    if (explicit) {
      const hit = state.orders.find(o => text(o.id || o.__key) === explicit);
      if (hit) return hit;
    }
    const cid = text(c.id || c.__key);
    return state.orders.find(o => text(o.criacao_id) === cid || (Array.isArray(o.itens) && o.itens.some(it => text(it.criacao_id || it.codigo_criacao) === cid))) || null;
  }

  function findPrintJob(c) {
    const cid = text(c.id || c.__key);
    return state.printJobs.find(j => text(j.criacao_id || j.codigo_criacao) === cid || text(j?.arte_aprovada?.criacao_id) === cid) || null;
  }

  function statusInfo(c) {
    const order = findOrder(c), job = findPrintJob(c), raw = rawStatus(c), pay = payment(c,order);
    const released = c.liberado_producao === true || order?.liberado_producao === true;
    const jobStatus = norm(job?.status);
    if (/arquiv/.test(raw)) return { key:'archived', label:'Arquivada', cls:'archived', order, job };
    if (/cancel/.test(raw) || /cancel/.test(norm(order?.status))) return { key:'cancelled', label:'Cancelada', cls:'bad', order, job };
    if (/enviad|entreg/.test(raw) || /enviad|entreg/.test(jobStatus) || /enviad|entreg/.test(norm(order?.status))) return { key:'sent', label:'Enviada', cls:'release', order, job };
    if (released && pay === 'pago') return { key:'released', label:'Pago · Liberado', cls:'release', order, job };
    if (pay === 'pago') return { key:'paid', label:'Pago · aguardando liberação', cls:'paid', order, job };
    if (order || /pedido_criado|vinculad|encomend/.test(raw) && !/encomendando/.test(raw)) return { key:'awaiting_payment', label:'Aguardando pagamento', cls:'wait', order, job };
    if (/carrinho|aguardando_pedido|encomendando/.test(raw)) return { key:'cart', label:'No carrinho', cls:'cart', order, job };
    if (/gerando|aguard/.test(raw)) return { key:'generating', label:'Gerando arte', cls:'wait', order, job };
    return { key:'ready', label:'Arte pronta', cls:'ready', order, job };
  }

  function quantity(c, order=null) {
    const direct = Number(c.quantidade || c.quantidade_solicitada || c?.encomenda?.quantidade || 0);
    if (direct > 0) return direct;
    const cid = text(c.id || c.__key);
    const items = Array.isArray(order?.itens) ? order.itens : [];
    const item = items.find(it => text(it.criacao_id || it.codigo_criacao) === cid);
    return Math.max(1, Number(item?.quantidade || item?.qtd || 1));
  }

  function versions(c={}) {
    let list = [];
    if (Array.isArray(c.versoes)) list = c.versoes;
    else if (c.versoes && typeof c.versoes === 'object') list = Object.entries(c.versoes).map(([key,v]) => ({ versao:key, ...(v || {}) }));
    list = list.map((v,index) => ({
      versao:text(v?.versao || v?.id || `v${index+1}`),
      url:text(v?.url || v?.arte_url || v?.image || v?.imagem),
      criado_em:text(v?.criado_em || v?.created_at || v?.gerado_em),
      status:text(v?.status),
      prompt:text(v?.prompt || v?.instrucao || v?.ajuste)
    })).filter(v => v.versao || v.url);
    if (!list.length && artUrl(c)) list = [{ versao:text(c.arte_versao || c.arte_versao_aprovada || c?.arte_aprovada?.versao || 'v1'), url:artUrl(c), criado_em:createdAt(c), status:'aprovada' }];
    return list;
  }

  function approvedVersion(c={}) {
    return text(c.arte_versao_aprovada || c?.arte_aprovada?.versao || c.arte_versao || versions(c)[0]?.versao || '');
  }

  function fieldEntries(c={}) {
    const fields = c.campos && typeof c.campos === 'object' && !Array.isArray(c.campos) ? c.campos : {};
    return Object.entries(fields).map(([key,value]) => [key, typeof value === 'object' ? text(value?.valor || value?.value || value?.texto || JSON.stringify(value)) : text(value)]).filter(([,value]) => value);
  }

  function generationNotes(c={}) {
    const candidates = [
      ['Instrução', c.instrucao || c.instrucao_complementar || c.prompt_usuario],
      ['Prompt', c.prompt || c.prompt_final || c.prompt_geracao],
      ['Ajustes', c.ajustes || c.ajuste || c.observacoes_geracao],
      ['Comandos', c.comandos || c.comandos_selecionados]
    ];
    const out = candidates.map(([label,value]) => {
      if (Array.isArray(value)) value = value.join(' · ');
      else if (value && typeof value === 'object') value = JSON.stringify(value);
      return [label,text(value)];
    }).filter(([,value]) => value);
    fieldEntries(c).forEach(([key,value]) => out.push([`Campo · ${key}`,value]));
    return out.slice(0,16);
  }

  async function load(force=false) {
    if (state.loading) return;
    if (!force && state.loadedAt && Date.now()-state.loadedAt < 45000 && state.creations.length) return render();
    state.loading = true;
    const host = root();
    if (host && active()) host.innerHTML = '<div class="notice">Carregando gerenciador de artes…</div>';
    try {
      const [creations,orders,printJobs] = await Promise.all([fbGet(NODES.creations),fbGet(NODES.orders).catch(()=>({})),fbGet(NODES.print).catch(()=>({}))]);
      state.creations = asRows(creations).sort((a,b)=>createdMs(b)-createdMs(a));
      state.orders = asRows(orders);
      state.printJobs = asRows(printJobs);
      state.loadedAt = Date.now();
      state.page = 1;
      render();
    } catch (e) {
      console.error('[Admin Canecas] Artes Geradas:',e);
      if (host) host.innerHTML = `<div class="notice warn">Não foi possível carregar as artes: ${esc(e.message || e)}</div>`;
    } finally { state.loading = false; }
  }

  function metrics() {
    const out = { ready:0, cart:0, awaiting:0, released:0, contacted:0, total:state.creations.length };
    state.creations.forEach(c => {
      const s=statusInfo(c).key;
      if (s==='ready') out.ready++;
      if (s==='cart') out.cart++;
      if (s==='awaiting_payment') out.awaiting++;
      if (s==='released') out.released++;
      if (isContacted(c)) out.contacted++;
    });
    return out;
  }

  function filtered() {
    const q=norm(state.query), cutoff=state.period==='all'?0:Date.now()-Number(state.period||30)*86400000;
    let list=state.creations.filter(c=>{
      const si=statusInfo(c), order=si.order, created=createdMs(c);
      if (cutoff && created && created<cutoff) return false;
      if (state.status && si.key!==state.status) return false;
      if (!q) return true;
      return norm([c.id,c.__key,modelName(c),clientName(c),clientEmail(c),clientPhone(c),orderId(c),order?.id,si.label,approvedVersion(c),isContacted(c)?'contatado':''].join(' ')).includes(q);
    });
    list.sort((a,b)=>state.sort==='old'?createdMs(a)-createdMs(b):createdMs(b)-createdMs(a));
    return list;
  }

  function row(c) {
    const si=statusInfo(c), order=si.order, image=artUrl(c), id=text(c.id || c.__key), orderCode=text(order?.id || orderId(c));
    const pay=payment(c,order), qty=quantity(c,order), phone=clientPhone(c), email=clientEmail(c), approved=approvedVersion(c);
    return `<div class="cfm-row" data-cfm-id="${esc(id)}">
      <div class="cfm-thumb">${image?`<img src="${esc(image)}" loading="lazy" decoding="async" alt="">`:'ARTE'}</div>
      <div class="cfm-code"><strong>${esc(id)}</strong><small>${esc(formatDate(createdAt(c)))}${approved?` · ${esc(approved)}`:''}</small></div>
      <div class="cfm-model"><strong title="${esc(modelName(c))}">${esc(modelName(c))}</strong><small>${qty} unidade${qty===1?'':'s'}</small></div>
      <div class="cfm-client"><strong title="${esc(clientName(c))}">${esc(clientName(c))}</strong><span title="${esc(email || phone)}">${esc(email || phone || 'Sem contato')}</span>${isContacted(c)?'<small>✓ Cliente contatado</small>':''}</div>
      <div class="cfm-state"><span class="cfm-status ${esc(si.cls)}">${esc(si.label)}</span></div>
      <div class="cfm-order">${orderCode?`<strong>${esc(orderCode)}</strong><small>${pay==='pago'?'Pagamento pago':'Pagamento pendente'}</small>`:'<small>Sem pedido</small>'}</div>
      <div class="cfm-actions">
        <button class="cfm-action" type="button" title="Detalhes" data-cfm-detail="${esc(id)}">⋯</button>
        <button class="cfm-action" type="button" title="Copiar CF-ID" data-cfm-copy="${esc(id)}">⧉</button>
        ${orderCode?`<button class="cfm-action" type="button" title="Ver pedido" data-cfm-order="${esc(orderCode)}">↗</button>`:`<button class="cfm-action" type="button" title="Sem pedido" disabled>↗</button>`}
      </div>
    </div>`;
  }

  function render() {
    if (!active()) return;
    const host=root(); if (!host) return;
    const m=metrics(), list=filtered(), pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));
    if (state.page>pages) state.page=pages;
    const start=(state.page-1)*PAGE_SIZE, page=list.slice(start,start+PAGE_SIZE);
    const title=document.getElementById('pageTitle'), subtitle=document.getElementById('pageSubtitle');
    if (title) title.textContent='Artes geradas';
    if (subtitle) subtitle.textContent='Criações, versões aprovadas e vínculo operacional com pedidos.';
    host.innerHTML=`<div class="cfm-shell">
      <div class="cfm-metrics">
        <div class="cfm-metric"><strong>${m.total}</strong><span>Total de criações</span></div>
        <div class="cfm-metric good"><strong>${m.ready}</strong><span>Artes prontas · não compradas</span></div>
        <div class="cfm-metric attn"><strong>${m.cart}</strong><span>No carrinho · checkout pendente</span></div>
        <div class="cfm-metric attn"><strong>${m.awaiting}</strong><span>Pedidos aguardando pagamento</span></div>
        <div class="cfm-metric good"><strong>${m.released}</strong><span>Pagas · liberadas para produção</span></div>
        <div class="cfm-metric"><strong>${m.contacted}</strong><span>Clientes contatados</span></div>
      </div>
      <div class="cfm-toolbar">
        <input id="cfmSearch" type="search" placeholder="Buscar CF-ID, cliente, e-mail, modelo, versão ou pedido…" value="${esc(state.query)}">
        <select id="cfmStatus"><option value="">Todos os status</option><option value="ready">Arte pronta</option><option value="cart">No carrinho</option><option value="awaiting_payment">Aguardando pagamento</option><option value="paid">Pago · aguardando liberação</option><option value="released">Pago · liberado</option><option value="generating">Gerando</option><option value="sent">Enviada</option><option value="cancelled">Cancelada</option><option value="archived">Arquivada</option></select>
        <select id="cfmPeriod"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo período</option></select>
        <select id="cfmSort"><option value="new">Mais recentes</option><option value="old">Mais antigas</option></select>
        <div class="cfm-toolbar-actions"><button class="cfm-btn" id="cfmExport" type="button">CSV</button><button class="cfm-btn" id="cfmReload" type="button">Atualizar</button><button class="cfm-btn primary" id="cfmNewCreation" type="button">Nova criação</button></div>
      </div>
      <section class="cfm-panel">
        <div class="cfm-list-head"><div>Arte</div><div>CF-ID / Data</div><div>Modelo</div><div>Cliente</div><div>Status</div><div>Pedido</div><div></div></div>
        <div>${page.map(row).join('') || '<div class="cfm-empty">Nenhuma arte encontrada com estes filtros.</div>'}</div>
        <div class="cfm-footer"><span>Mostrando ${page.length?start+1:0}–${Math.min(start+page.length,list.length)} de ${list.length}</span><div class="cfm-pager"><button id="cfmPrev" ${state.page<=1?'disabled':''}>‹</button><b>${state.page} / ${pages}</b><button id="cfmNext" ${state.page>=pages?'disabled':''}>›</button></div></div>
      </section>
    </div>`;
    document.getElementById('cfmStatus').value=state.status;
    document.getElementById('cfmPeriod').value=state.period;
    document.getElementById('cfmSort').value=state.sort;
    bind();
  }

  function bind() {
    const search=document.getElementById('cfmSearch');
    search?.addEventListener('input',e=>{state.query=e.target.value;state.page=1;render()});
    document.getElementById('cfmStatus')?.addEventListener('change',e=>{state.status=e.target.value;state.page=1;render()});
    document.getElementById('cfmPeriod')?.addEventListener('change',e=>{state.period=e.target.value;state.page=1;render()});
    document.getElementById('cfmSort')?.addEventListener('change',e=>{state.sort=e.target.value;state.page=1;render()});
    document.getElementById('cfmReload')?.addEventListener('click',()=>load(true));
    document.getElementById('cfmExport')?.addEventListener('click',exportCsv);
    document.getElementById('cfmNewCreation')?.addEventListener('click',openGenerator);
    document.getElementById('cfmPrev')?.addEventListener('click',()=>{if(state.page>1){state.page--;render();root()?.scrollIntoView({behavior:'smooth',block:'start'})}});
    document.getElementById('cfmNext')?.addEventListener('click',()=>{const pages=Math.ceil(filtered().length/PAGE_SIZE);if(state.page<pages){state.page++;render();root()?.scrollIntoView({behavior:'smooth',block:'start'})}});
    root()?.querySelectorAll('[data-cfm-detail]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.cfmDetail)));
    root()?.querySelectorAll('[data-cfm-copy]').forEach(b=>b.addEventListener('click',()=>copyText(b.dataset.cfmCopy,'CF-ID copiado.')));
    root()?.querySelectorAll('[data-cfm-order]').forEach(b=>b.addEventListener('click',()=>openOrder(b.dataset.cfmOrder)));
  }

  function creation(id) { return state.creations.find(c=>text(c.id||c.__key)===text(id)); }

  function versionsHtml(c) {
    const approved=approvedVersion(c), list=versions(c);
    if (!list.length) return '<div class="notice">Nenhuma versão registrada.</div>';
    return `<div class="cfm-detail-grid">${list.map(v=>`<div class="cfm-detail-box"><span>${esc(v.versao)}${v.versao===approved?' · APROVADA':''}</span><strong>${esc(v.status || (v.versao===approved?'Aprovada':'Gerada'))}</strong><small>${esc(formatDate(v.criado_em))}</small>${v.url?`<a href="${esc(v.url)}" target="_blank" rel="noopener">Abrir versão</a>`:''}</div>`).join('')}</div>`;
  }

  function notesHtml(c) {
    const notes=generationNotes(c);
    if (!notes.length) return '<div class="notice">Esta criação não possui instruções ou ajustes registrados.</div>';
    return `<div class="cfm-detail-grid">${notes.map(([label,value])=>`<div class="cfm-detail-box"><span>${esc(label)}</span><strong style="white-space:normal;word-break:break-word">${esc(value)}</strong></div>`).join('')}</div>`;
  }

  function openDetail(id) {
    const c=creation(id); if (!c) return;
    const si=statusInfo(c), order=si.order, image=artUrl(c), orderCode=text(order?.id || orderId(c)), pay=payment(c,order), qty=quantity(c,order), approved=approvedVersion(c), contacted=contactedAt(c);
    const drawer=document.getElementById('drawer'), overlay=document.getElementById('overlay'), content=document.getElementById('drawerContent');
    if (!drawer || !overlay || !content) return;
    const canArchive=!orderCode && !['cart','released','paid','sent'].includes(si.key);
    const isArchived=si.key==='archived';
    const job=si.job;
    content.innerHTML=`<h2>Arte ${esc(id)}</h2><div class="subtitle">${esc(formatDate(createdAt(c)))} · ${esc(si.label)}${approved?` · aprovada ${esc(approved)}`:''}</div>
      <div class="cfm-detail-hero">${image?`<img class="cfm-detail-art" src="${esc(image)}" alt="Arte ${esc(id)}">`:'<div class="notice">Arquivo da arte não localizado.</div>'}</div>
      <div class="cfm-detail-grid">
        <div class="cfm-detail-box"><span>Modelo</span><strong>${esc(modelName(c))}</strong></div>
        <div class="cfm-detail-box"><span>Quantidade</span><strong>${qty}</strong></div>
        <div class="cfm-detail-box"><span>Cliente</span><strong>${esc(clientName(c))}</strong></div>
        <div class="cfm-detail-box"><span>E-mail</span><strong>${esc(clientEmail(c)||'Não informado')}</strong></div>
        <div class="cfm-detail-box"><span>WhatsApp</span><strong>${esc(clientPhone(c)||'Não informado')}</strong></div>
        <div class="cfm-detail-box"><span>Contato</span><strong>${esc(contacted?`Contatado · ${formatDate(contacted)}`:'Ainda não marcado')}</strong></div>
        <div class="cfm-detail-box"><span>Pedido</span><strong>${esc(orderCode||'Ainda não existe')}</strong></div>
        <div class="cfm-detail-box"><span>Pagamento</span><strong>${esc(pay==='pago'?'Pago':'Pendente')}</strong></div>
        <div class="cfm-detail-box"><span>Produção</span><strong>${esc(si.key==='released'||si.key==='sent'?'LIBERADA':'Não liberada')}</strong></div>
        <div class="cfm-detail-box"><span>Caneca Print</span><strong>${esc(job?text(job.status || 'Job criado'):'Sem job')}</strong></div>
      </div>
      <h3 style="margin-top:18px">Versões da arte</h3>${versionsHtml(c)}
      <h3 style="margin-top:18px">Dados da geração / personalização</h3>${notesHtml(c)}
      <div class="notice" style="margin-top:12px">${si.key==='cart'?'Cliente aprovou e colocou no carrinho. O checkout permanece sob responsabilidade da Loja Integrada.':si.key==='awaiting_payment'?'Pedido identificado na Loja Integrada. A produção permanece bloqueada até confirmação do pagamento.':si.key==='released'?'Pagamento confirmado. Esta criação está liberada para produção.':si.key==='ready'?'Arte criada e salva. Ainda não há compra vinculada.':'Status operacional: '+esc(si.label)}</div>
      <div class="cfm-detail-actions">
        ${image?`<a class="cfm-btn primary" href="${esc(image)}" target="_blank" rel="noopener">Abrir arte aprovada</a>`:''}
        <button class="cfm-btn" id="cfmCopyId">Copiar CF-ID</button>
        <button class="cfm-btn" id="cfmCopyLink">Copiar link do cliente</button>
        <button class="cfm-btn" id="cfmContact">${contacted?'Desmarcar contato':'Marcar cliente contatado'}</button>
        ${orderCode?'<button class="cfm-btn" id="cfmOpenOrder">Ver pedido</button>':''}
        ${canArchive?`<button class="cfm-btn danger" id="cfmArchive">${isArchived?'Restaurar':'Arquivar'}</button>`:''}
      </div>`;
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false'); overlay.hidden=false;
    document.getElementById('cfmCopyId')?.addEventListener('click',()=>copyText(id,'CF-ID copiado.'));
    document.getElementById('cfmCopyLink')?.addEventListener('click',()=>copyText(`https://www.canecafacil.com.br/?cf_arte=${encodeURIComponent(id)}`,'Link do cliente copiado.'));
    document.getElementById('cfmContact')?.addEventListener('click',()=>toggleContact(c,Boolean(contacted)));
    document.getElementById('cfmOpenOrder')?.addEventListener('click',()=>openOrder(orderCode));
    document.getElementById('cfmArchive')?.addEventListener('click',()=>toggleArchive(c,isArchived));
  }

  async function toggleContact(c, clear=false) {
    try {
      const key=safeKey(c.__key||c.id), at=nowIso();
      await fbPatch(`${NODES.creations}/${key}`, clear
        ? { cliente_contatado_em:null, cliente_contatado_por:null, atendimento_atualizado_em:at }
        : { cliente_contatado_em:at, cliente_contatado_por:'admin_canecas', atendimento_atualizado_em:at });
      toast(clear?'Contato desmarcado.':'Cliente marcado como contatado.');
      await load(true);
      openDetail(text(c.id||c.__key));
    } catch(e){toast(e.message||e,true)}
  }

  async function toggleArchive(c, restore=false) {
    try {
      const key=safeKey(c.__key||c.id), current=rawStatus(c);
      const patch=restore
        ? { atendimento_status:text(c.status_antes_arquivo||'arte_pronta'), restaurado_em:nowIso(), atendimento_atualizado_em:nowIso() }
        : { atendimento_status:'arquivado', status_antes_arquivo:current, arquivado_em:nowIso(), atendimento_atualizado_em:nowIso() };
      await fbPatch(`${NODES.creations}/${key}`,patch);
      document.getElementById('drawerClose')?.click();
      toast(restore?'Criação restaurada.':'Criação arquivada.');
      await load(true);
    } catch(e){toast(e.message||e,true)}
  }

  function openGenerator() {
    const button=document.getElementById('mugGeneratorNav');
    if (!button) return toast('O Criador de Canecas ainda não terminou de carregar.',true);
    button.click();
  }

  function openOrder(id) {
    document.getElementById('drawerClose')?.click();
    const nav=document.querySelector('#nav [data-route="orders"]');
    if (nav) nav.click(); else location.hash='#orders';
    setTimeout(()=>{
      const input=document.getElementById('orderSearch');
      if (input){input.value=id;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}
    },650);
  }

  async function copyText(value,message) {
    try { await navigator.clipboard.writeText(text(value)); toast(message); }
    catch { toast('Não foi possível copiar.',true); }
  }

  function exportCsv() {
    const rows=filtered();
    const cols=['CF-ID','Data','Modelo','Cliente','Email','WhatsApp','Status','Versão aprovada','Cliente contatado em','Pedido','Pagamento','Quantidade'];
    const csv=[cols, ...rows.map(c=>{const si=statusInfo(c),o=si.order;return [text(c.id||c.__key),formatDate(createdAt(c)),modelName(c),clientName(c),clientEmail(c),clientPhone(c),si.label,approvedVersion(c),formatDate(contactedAt(c)),text(o?.id||orderId(c)),payment(c,o)==='pago'?'Pago':'Pendente',quantity(c,o)]})]
      .map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download=`canecafacil-artes-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function activate(force=false) {
    if (!active()) return;
    setTimeout(()=>load(force),120);
  }

  window.addEventListener('admin-canecas:route',e=>{
    if (e.detail?.route!=='creations') return;
    setTimeout(()=>load(Boolean(e.detail?.force)),180);
    setTimeout(()=>{if(active()) render()},900);
  });
  window.addEventListener('hashchange',()=>{if(active()) activate(false)});
  document.addEventListener('click',e=>{
    if (e.target?.closest?.('#reloadButton') && active()) setTimeout(()=>load(true),850);
  },true);

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>activate(false),{once:true});
  else activate(false);

  window.CFArtesGeradas={reload:()=>load(true),open:openDetail,newCreation:openGenerator};
  console.info(`Admin Canecas · Artes Geradas ${BUILD}`);
})();