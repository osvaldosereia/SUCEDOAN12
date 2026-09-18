const labels={
  unknown:'Não definido',
  observed:'Identidade observada',
  verified:'Verificado',
  revoked:'Revogado',
  granted:'Permitido',
  denied:'Não permitido',
  system:'Evento automático',
  ai:'Atendimento automatizado',
  human:'Atendimento humano',
  new:'Novo atendimento',
  order_confirmed:'Pedido confirmado',
  catalog_open:'Catálogo aberto',
  confirmed:'Confirmado',
  converted:'Convertido',
  ready:'Pronto',
  organic:'Orgânico',
  website:'Site',
  web:'Site',
  whatsapp:'WhatsApp',
  inbound:'Recebido',
  outbound:'Enviado',
  service:'Atendimento',
  transactional:'Transacional',
  marketing:'Marketing',
  e164:'WhatsApp principal',
  customer_inactive:'Cliente inativo',
  invalid_or_missing_phone:'Telefone inválido ou ausente',
  channel_identity_missing:'Identidade do WhatsApp ainda não confirmada',
  marketing_consent_unknown:'Consentimento de marketing não registrado',
  marketing_consent_denied:'Cliente não autorizou marketing',
  marketing_consent_revoked:'Cliente retirou a autorização de marketing',
  active_suppression:'Bloqueio de contato ativo',
  order_in_progress:'Pedido em andamento',
  human_service_in_progress:'Atendimento humano em andamento',
  recent_customer_activity:'Cliente em atendimento recente',
  marketing_cooldown:'Intervalo mínimo entre campanhas',
  catalog_checkout_return:'Retorno do checkout',
  room_order_confirmed:'Pedido confirmado no Comprar',
  behavior:'Comportamento',
  catalog:'Catálogo',
  message:'Mensagem',
  handoff:'Transferência para atendimento',
  operator_reply:'Resposta do atendimento'
};

const human=value=>{
  const raw=String(value==null?'':value).trim();
  if(!raw)return '—';
  const key=raw.toLowerCase();
  if(labels[key])return labels[key];
  return raw.replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
};

const initials=name=>{
  const words=String(name||'Cliente').trim().split(/\s+/).filter(Boolean);
  return (words.slice(0,2).map(x=>x[0]).join('')||'CL').toUpperCase();
};

const digits=value=>String(value||'').replace(/\D/g,'');

const metric=(title,value,detail='',tone='')=>{
  return '<article class="c360-metric '+tone+'"><span>'+title+'</span><strong>'+value+'</strong>'+(detail?'<small>'+detail+'</small>':'')+'</article>';
};

const sectionTitle=(title,detail='')=>{
  return '<div class="c360-section-title"><div><h3>'+title+'</h3>'+(detail?'<p>'+detail+'</p>':'')+'</div></div>';
};

const empty=text=>'<div class="c360-empty">'+text+'</div>';

const pill=(text,tone='neutral',detail='')=>{
  return '<span class="c360-pill '+tone+'"><b>'+text+'</b>'+(detail?'<small>'+detail+'</small>':'')+'</span>';
};

const timelineItem=(event,helpers)=>{
  const esc=helpers.esc,date=helpers.date;
  const title=esc(human(event.title||event.event_kind||'Evento'));
  const meta=[date(event.occurred_at),human(event.channel),human(event.direction)].filter(Boolean).map(esc).join(' · ');
  const body=event.body_text?'<p>'+esc(event.body_text)+'</p>':'';
  const kind=String(event.event_kind||'event').toLowerCase().replace(/[^a-z0-9_-]/g,'');
  return '<article class="c360-timeline-item"><span class="c360-timeline-dot '+kind+'"></span><div><strong>'+title+'</strong><small>'+meta+'</small>'+body+'</div></article>';
};

const renderBrands=(brands,helpers)=>{
  const esc=helpers.esc,money=helpers.money;
  if(!brands.length)return empty('Ainda não há afinidade de marcas suficiente.');
  return '<div class="c360-insight-grid">'+brands.slice(0,12).map((x,i)=>
    '<article class="c360-insight-card"><span class="c360-rank">'+(i+1)+'</span><div><strong>'+esc(x.brand||'Sem marca')+'</strong><small>'+esc(x.purchase_count||0)+' compra(s) · '+money(x.total_spent||0)+'</small></div></article>'
  ).join('')+'</div>';
};

const renderCategories=(categories,helpers)=>{
  const esc=helpers.esc,money=helpers.money;
  if(!categories.length)return empty('Ainda não há categorias suficientes para destacar.');
  return '<div class="c360-chip-grid">'+categories.slice(0,12).map(x=>
    '<article class="c360-data-chip"><strong>'+esc(x.category||'Sem categoria')+'</strong><small>'+esc(x.purchase_count||x.order_count||0)+' compra(s) · '+money(x.total_spent||0)+'</small></article>'
  ).join('')+'</div>';
};

const renderProducts=(products,helpers)=>{
  const esc=helpers.esc,money=helpers.money;
  if(!products.length)return empty('Ainda não há produtos recorrentes suficientes.');
  return '<div class="c360-product-grid">'+products.slice(0,12).map(x=>{
    const p=x.product||x;
    const count=x.purchase_count||p.purchase_count||0;
    const spent=x.total_spent;
    return '<article class="c360-product-card"><div><strong>'+esc(p.name||x.name||'Produto')+'</strong><small>'+esc(p.brand||'')+'</small></div><div class="c360-product-meta"><b>'+esc(count)+' compra(s)</b>'+(spent!=null?'<small>'+money(spent)+'</small>':'')+'</div></article>';
  }).join('')+'</div>';
};

const renderOrders=(orders,customer,helpers)=>{
  const esc=helpers.esc,money=helpers.money,date=helpers.date,statusLabel=helpers.historyStatusLabel;
  if(!orders.length)return empty('Este cliente ainda não possui compras registradas.');
  return '<div class="c360-order-list">'+orders.map(o=>
    '<article class="c360-order-row"><div><strong>'+esc(o.order_number||'Pedido')+'</strong><small>'+esc(date(o.confirmed_at||o.created_at))+' · '+esc(statusLabel(o.status))+'</small><small>'+esc(o.basket_name||'Compra')+' · '+esc(o.item_count||0)+' item(ns)</small></div><div class="c360-order-side"><b>'+money(o.total||0)+'</b><button type="button" class="secondary" data-history-order="'+esc(o.order_id)+'" data-history-customer="'+esc(customer.id)+'">Ver pedido</button></div></article>'
  ).join('')+'</div>';
};

const renderConversations=(rows,helpers)=>{
  const esc=helpers.esc,date=helpers.date;
  if(!rows.length)return empty('Nenhuma conversa recente consolidada.');
  return '<div class="c360-conversation-list">'+rows.slice(0,20).map(x=>
    '<article><div class="c360-channel-badge">'+esc(human(x.channel||'canal'))+'</div><div><strong>'+esc(human(x.stage||x.status||'Atendimento'))+'</strong><small>'+esc(date(x.updated_at||x.opened_at))+' · '+esc(human(x.source||''))+'</small>'+(x.context_summary?'<p>'+esc(x.context_summary)+'</p>':'')+'</div><span class="c360-state">'+esc(human(x.mode||x.status||''))+'</span></article>'
  ).join('')+'</div>';
};

const renderCarts=(rows,helpers)=>{
  const esc=helpers.esc,money=helpers.money,date=helpers.date;
  if(!rows.length)return empty('Nenhum carrinho recente.');
  return '<div class="c360-order-list">'+rows.slice(0,12).map(x=>
    '<article class="c360-order-row"><div><strong>'+esc(human(x.status||'Carrinho'))+'</strong><small>'+esc(date(x.updated_at||x.created_at))+' · '+esc(human(x.pricing_status||''))+'</small></div><div class="c360-order-side"><b>'+money(x.total||0)+'</b></div></article>'
  ).join('')+'</div>';
};

export function renderCustomer360(options){
  const customer=options.customer||{};
  const data=options.data||{};
  const customer360=options.customer360||null;
  const h=options.helpers;
  const esc=h.esc,money=h.money,date=h.date,paymentLabel=h.paymentLabel,segmentLabel=h.customerSegmentLabel;
  const intel=data.intelligence||{};
  const orders=data.orders||[];
  const legacyProducts=intel.top_products||[];
  const legacyCategories=intel.top_categories||[];
  const dynamicSegments=customer360&&customer360.commercial?customer360.commercial.segments:null;
  const segmentSource=dynamicSegments||data.segments||{};
  const segments=Array.isArray(segmentSource.segments)?segmentSource.segments:[];
  const brands=customer360&&customer360.commercial?customer360.commercial.brands||[]:[];
  const secureProducts=customer360&&customer360.commercial?customer360.commercial.products||[]:[];
  const secureCategories=customer360&&customer360.commercial?customer360.commercial.categories||[]:[];
  const conversations=customer360&&customer360.activity?customer360.activity.conversations||[]:[];
  const carts=customer360&&customer360.activity?customer360.activity.carts||[]:[];
  const timeline=customer360&&customer360.activity?customer360.activity.timeline||[]:[];
  const contact=customer360&&customer360.contact?customer360.contact:{};
  const channelIdentities=Array.isArray(contact.channel_identities)?contact.channel_identities:[];
  const consentCurrent=customer360&&customer360.consent?customer360.consent.current||{}:{};
  const currentConsents=Object.values(consentCurrent||{});
  const protection=customer360&&customer360.customer_protection?customer360.customer_protection:{};
  const protectionState=protection.state||{};
  const protectionReasons=Array.isArray(protection.reasons)?protection.reasons:[];
  const activeSuppressions=Array.isArray(protectionState.suppressions)?protectionState.suppressions:[];
  const summary=customer360&&customer360.summary?customer360.summary:{};
  const dq=customer360&&customer360.data_quality?customer360.data_quality:{};
  const identityLatest=customer360&&customer360.identity_resolution?customer360.identity_resolution.latest:null;
  const serviceMemory=customer360&&customer360.preferences?customer360.preferences.service_memory||[]:[];
  const substitutions=customer360&&customer360.preferences?customer360.preferences.substitutions||[]:[];
  const marketingTouchpoints=customer360&&customer360.marketing?customer360.marketing.touchpoints||[]:[];
  const marketingEvents=customer360&&customer360.marketing?customer360.marketing.events||[]:[];
  const favoriteBasket=intel.favorite_basket&&intel.favorite_basket.name?intel.favorite_basket.name:(intel.last_basket&&intel.last_basket.name?intel.last_basket.name:'—');
  const frequency=intel.repurchase_frequency_label||'Ainda sem padrão';
  const phone=customer.primary_whatsapp_e164||'';
  const wa=digits(phone)?'https://wa.me/'+digits(phone):'';
  const lifecycle=human(summary.lifecycle||'');
  const protectionAllowed=protection.allowed===true;
  const consentStatus=protection.consent&&protection.consent.status?protection.consent.status:'unknown';
  const topProducts=secureProducts.length?secureProducts:legacyProducts;
  const topCategories=secureCategories.length?secureCategories:legacyCategories;
  const identityConfidence=identityLatest?Math.round(Number(identityLatest.confidence||0)*100):null;
  const quality=Number(dq.completeness_percent||0);

  const segmentHtml=segments.length?'<div class="c360-pill-row">'+segments.map(key=>{
    const text=segmentLabel(key);
    const lower=String(key).toLowerCase();
    const tone=lower.includes('nao_permitido')||lower.includes('problema')||lower.includes('inativo')?'danger':(lower.includes('permitido')||lower.includes('recorrente')?'success':'neutral');
    return pill(esc(text),tone);
  }).join('')+'</div>':empty('Ainda não há segmentos suficientes para este cliente.');

  const identityHtml=channelIdentities.length?'<div class="c360-chip-grid">'+channelIdentities.slice(0,10).map(x=>
    '<article class="c360-data-chip"><strong>'+esc(human(x.channel||'Canal'))+'</strong><small>'+esc(human(x.verification_status||'observed'))+' · '+esc(human(x.identity_kind||''))+'</small></article>'
  ).join('')+'</div>':empty('Nenhuma identidade de canal consolidada.');

  const consentHtml=currentConsents.length?'<div class="c360-chip-grid">'+currentConsents.map(x=>
    '<article class="c360-data-chip"><strong>'+esc(human(x.purpose||'Consentimento'))+'</strong><small>'+esc(human(x.channel||''))+' · '+esc(human(x.status||''))+'</small></article>'
  ).join('')+'</div>':empty('Consentimento de marketing ainda não registrado.');

  const protectionReasonHtml=protectionReasons.length?'<div class="c360-alert-list">'+protectionReasons.map(reason=>
    '<article class="c360-alert danger"><strong>'+esc(human(reason))+'</strong><small>Este motivo impede uma ação automática de marketing neste momento.</small></article>'
  ).join('')+'</div>':'<div class="c360-alert success"><strong>Nenhum impedimento identificado</strong><small>Os guardrails atuais não encontraram bloqueios adicionais.</small></div>';

  const preferencesHtml=(serviceMemory.length||substitutions.length)?
    '<div class="c360-chip-grid">'+
      serviceMemory.slice(0,12).map(x=>'<article class="c360-data-chip"><strong>'+esc(human(x.memory_key))+'</strong><small>'+esc(x.memory_value||'')+' · confiança '+Math.round(Number(x.confidence||0)*100)+'%</small></article>').join('')+
      substitutions.slice(0,8).map(x=>'<article class="c360-data-chip"><strong>Substituição</strong><small>'+esc(human(x.preference||''))+(x.notes?' · '+esc(x.notes):'')+'</small></article>').join('')+
    '</div>':empty('Nenhuma preferência estruturada registrada.');

  const marketingHtml=(marketingTouchpoints.length||marketingEvents.length)?
    '<div class="c360-conversation-list">'+
      marketingTouchpoints.slice(0,10).map(x=>'<article><div class="c360-channel-badge">Marketing</div><div><strong>'+esc(human(x.touchpoint_type||'Contato'))+'</strong><small>'+esc(date(x.occurred_at))+' · '+esc(human(x.channel||''))+'</small></div></article>').join('')+
      marketingEvents.slice(0,10).map(x=>'<article><div class="c360-channel-badge">Evento</div><div><strong>'+esc(human(x.event_type||'Evento'))+'</strong><small>'+esc(date(x.created_at))+'</small></div></article>').join('')+
    '</div>':empty('Nenhum evento de marketing consolidado.');

  return '<div class="customer-360-shell">'+
    '<header class="c360-hero">'+
      '<div class="c360-identity">'+
        '<div class="c360-avatar">'+esc(initials(customer.name))+'</div>'+
        '<div><span class="c360-eyebrow">Cliente 360</span><h2>'+esc(customer.name||'Cliente')+'</h2><p>'+esc(phone||'Telefone não informado')+'</p></div>'+
      '</div>'+
      '<div class="c360-hero-actions">'+
        (wa?'<a class="secondary" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
        '<button class="secondary" type="button" data-customer-edit="'+esc(customer.id||'')+'">Editar cliente</button>'+
        '<button class="c360-close" type="button" data-close-dialog aria-label="Fechar">×</button>'+
      '</div>'+
    '</header>'+
    '<section class="c360-kpi-grid">'+
      metric('Pedidos',esc(intel.order_count||0),'Histórico confirmado')+
      metric('Total comprado',money(intel.lifetime_value||0),'Valor acumulado','accent')+
      metric('Ticket médio',money(intel.average_ticket||0),'Média por pedido')+
      metric('Última compra',intel.last_order_at?esc(date(intel.last_order_at)):'—','Compra mais recente')+
      metric('Qualidade dos dados',esc(quality)+'%','Completude cadastral',quality>=75?'good':(quality>=50?'warn':'bad'))+
      metric('Marketing',protectionAllowed?'Liberado':'Bloqueado',esc(human(consentStatus)),protectionAllowed?'good':'bad')+
    '</section>'+
    '<nav class="c360-tabs" aria-label="Seções do cliente">'+
      '<button type="button" class="is-active" data-customer-tab="summary">Resumo</button>'+
      '<button type="button" data-customer-tab="purchases">Compras</button>'+
      '<button type="button" data-customer-tab="preferences">Preferências</button>'+
      '<button type="button" data-customer-tab="conversations">Conversas</button>'+
      '<button type="button" data-customer-tab="protection">Proteção</button>'+
      '<button type="button" data-customer-tab="timeline">Linha do tempo</button>'+
    '</nav>'+
    '<div class="c360-content">'+
      '<section class="c360-panel is-active" data-customer-panel="summary">'+
        '<div class="c360-two-col">'+
          '<article class="c360-card">'+sectionTitle('Visão executiva','O essencial para entender este cliente rapidamente.')+
            '<div class="c360-summary-grid">'+
              '<div><span>Ciclo de vida</span><strong>'+esc(lifecycle)+'</strong></div>'+
              '<div><span>Cliente desde</span><strong>'+esc(summary.customer_since?date(summary.customer_since):'—')+'</strong></div>'+
              '<div><span>Última interação</span><strong>'+esc(summary.last_interaction_at?date(summary.last_interaction_at):'—')+'</strong></div>'+
              '<div><span>Confiança da identidade</span><strong>'+(identityConfidence==null?'—':esc(identityConfidence)+'%')+'</strong></div>'+
              '<div><span>Cesta mais comprada</span><strong>'+esc(favoriteBasket)+'</strong></div>'+
              '<div><span>Pagamento mais usado</span><strong>'+esc(paymentLabel(intel.favorite_payment_method))+'</strong></div>'+
              '<div><span>Frequência estimada</span><strong>'+esc(frequency)+'</strong></div>'+
              '<div><span>Intervalo médio</span><strong>'+(intel.average_repurchase_interval_days!=null?esc(intel.average_repurchase_interval_days)+' dias':'—')+'</strong></div>'+
            '</div>'+
          '</article>'+
          '<article class="c360-card">'+sectionTitle('Situação agora','Sinais que merecem atenção antes de qualquer ação.')+
            '<div class="c360-alert '+(protectionAllowed?'success':'danger')+'"><strong>Marketing '+(protectionAllowed?'liberado':'bloqueado')+'</strong><small>'+esc(human(consentStatus))+' · cooldown '+esc(protection.policy&&protection.policy.cooldown_hours!=null?protection.policy.cooldown_hours:'—')+' h</small></div>'+
            (summary.open_cart?'<div class="c360-alert warn"><strong>Carrinho em aberto</strong><small>'+money(summary.open_cart.total||0)+' · '+esc(human(summary.open_cart.status||''))+'</small></div>':'')+
            (protectionState.open_order?'<div class="c360-alert warn"><strong>Pedido em andamento</strong><small>Evite pressão comercial enquanto o pedido estiver sendo atendido.</small></div>':'')+
            (protectionState.open_handoff?'<div class="c360-alert warn"><strong>Atendimento humano em andamento</strong><small>Priorize a resolução do atendimento atual.</small></div>':'')+
          '</article>'+
        '</div>'+
        '<article class="c360-card">'+sectionTitle('Segmentos dinâmicos',dynamicSegments?'Recalculados por fatos · '+esc(dynamicSegments.engine_version||'CM-1.8'):'Perfil comercial calculado')+segmentHtml+'</article>'+
        '<div class="c360-two-col">'+
          '<article class="c360-card">'+sectionTitle('Marcas com maior afinidade','Calculado a partir do histórico real de compras.')+renderBrands(brands,h)+'</article>'+
          '<article class="c360-card">'+sectionTitle('Categorias principais','Onde o cliente concentra mais compras.')+renderCategories(topCategories,h)+'</article>'+
        '</div>'+
      '</section>'+
      '<section class="c360-panel" data-customer-panel="purchases">'+
        '<div class="c360-two-col">'+
          '<article class="c360-card">'+sectionTitle('Resumo de compra','Padrão comercial consolidado.')+
            '<div class="c360-summary-grid">'+
              '<div><span>Total de pedidos</span><strong>'+esc(intel.order_count||0)+'</strong></div>'+
              '<div><span>Total comprado</span><strong>'+money(intel.lifetime_value||0)+'</strong></div>'+
              '<div><span>Ticket médio</span><strong>'+money(intel.average_ticket||0)+'</strong></div>'+
              '<div><span>Última compra</span><strong>'+esc(intel.last_order_at?date(intel.last_order_at):'—')+'</strong></div>'+
            '</div>'+
          '</article>'+
          '<article class="c360-card">'+sectionTitle('Carrinhos','Interesse, abandono e conversão.')+renderCarts(carts,h)+'</article>'+
        '</div>'+
        '<article class="c360-card">'+sectionTitle('Produtos recorrentes','Itens que aparecem com maior frequência no histórico.')+renderProducts(topProducts,h)+'</article>'+
        '<article class="c360-card">'+sectionTitle('Pedidos','Histórico confirmado do cliente.')+renderOrders(orders,customer,h)+'</article>'+
      '</section>'+
      '<section class="c360-panel" data-customer-panel="preferences">'+
        '<div class="c360-two-col">'+
          '<article class="c360-card">'+sectionTitle('Marcas favoritas','Ranking por histórico de compra.')+renderBrands(brands,h)+'</article>'+
          '<article class="c360-card">'+sectionTitle('Categorias de afinidade','Categorias que mais aparecem nas compras.')+renderCategories(topCategories,h)+'</article>'+
        '</div>'+
        '<article class="c360-card">'+sectionTitle('Produtos de afinidade','Produtos mais relevantes para este cliente.')+renderProducts(topProducts,h)+'</article>'+
        '<article class="c360-card">'+sectionTitle('Preferências e memória','Somente informações com evidência registrada.')+preferencesHtml+'</article>'+
      '</section>'+
      '<section class="c360-panel" data-customer-panel="conversations">'+
        '<article class="c360-card">'+sectionTitle('Conversas recentes','WhatsApp, site e outros canais consolidados.')+renderConversations(conversations,h)+'</article>'+
        '<article class="c360-card">'+sectionTitle('Marketing e atribuição','Contatos e eventos de marketing registrados.')+marketingHtml+'</article>'+
      '</section>'+
      '<section class="c360-panel" data-customer-panel="protection">'+
        '<div class="c360-protection-hero '+(protectionAllowed?'success':'danger')+'"><div><span>Marketing WhatsApp</span><strong>'+(protectionAllowed?'Liberado':'Bloqueado')+'</strong><p>Decisão automática e explicável pelos guardrails do Customer Protection.</p></div><div class="c360-protection-score"><span>Consentimento</span><b>'+esc(human(consentStatus))+'</b></div></div>'+
        '<div class="c360-two-col">'+
          '<article class="c360-card">'+sectionTitle('Motivos e guardrails','O sistema bloqueia por padrão quando falta evidência suficiente.')+protectionReasonHtml+
            '<div class="c360-action-row">'+
              (activeSuppressions.length?activeSuppressions.map(x=>'<button type="button" class="secondary" data-release-suppression="'+esc(x.id)+'" data-protection-customer="'+esc(customer.id)+'">Liberar bloqueio: '+esc(human(x.reason_code||'manual'))+'</button>').join(''):'<button type="button" class="secondary" data-suppress-marketing="'+esc(customer.id)+'">Bloquear marketing manualmente</button>')+
              '<button type="button" class="danger" data-revoke-marketing="'+esc(customer.id)+'">Registrar pedido de não receber marketing</button>'+
            '</div>'+
          '</article>'+
          '<article class="c360-card">'+sectionTitle('Identidades do cliente','Identidades conhecidas por canal.')+identityHtml+'</article>'+
        '</div>'+
        '<article class="c360-card">'+sectionTitle('Consentimentos atuais','Estado atual por finalidade e canal.')+consentHtml+'</article>'+
      '</section>'+
      '<section class="c360-panel" data-customer-panel="timeline">'+
        '<article class="c360-card">'+sectionTitle('Linha do tempo','Eventos consolidados em ordem cronológica.')+
          (timeline.length?'<div class="c360-timeline">'+timeline.slice(0,40).map(x=>timelineItem(x,h)).join('')+'</div>':empty('Ainda não há eventos suficientes para montar a linha do tempo.'))+
        '</article>'+
      '</section>'+
    '</div>'+
  '</div>';
}

export function renderCustomerOrderDetail(options){
  const customerId=options.customerId;
  const detail=options.detail||{};
  const order=detail.order||{};
  const items=detail.items||[];
  const h=options.helpers;
  const esc=h.esc,money=h.money,date=h.date,paymentLabel=h.paymentLabel,statusLabel=h.historyStatusLabel,addressLine=h.historyAddressLine;
  const address=addressLine(order.delivery_address);
  return '<div class="customer-360-shell c360-order-detail">'+
    '<header class="c360-hero">'+
      '<div class="c360-identity"><button class="c360-back-link" type="button" data-history-back="'+esc(customerId)+'">←</button><div><span class="c360-eyebrow">Detalhe do pedido</span><h2>'+esc(order.order_number||'Pedido')+'</h2><p>'+esc(date(order.confirmed_at||order.created_at))+'</p></div></div>'+
      '<button class="c360-close" type="button" data-close-dialog aria-label="Fechar">×</button>'+
    '</header>'+
    '<section class="c360-kpi-grid compact">'+
      metric('Total',money(order.total||0),'Valor do pedido','accent')+
      metric('Status',esc(statusLabel(order.status)),'Situação atual')+
      metric('Pagamento',esc(paymentLabel(order.payment_method)),'Forma utilizada')+
      metric('Cesta',esc(order.basket_name||'—'),'Origem da compra')+
    '</section>'+
    '<div class="c360-content order">'+
      (address?'<article class="c360-card">'+sectionTitle('Entrega','Endereço utilizado neste pedido.')+'<div class="c360-address">'+esc(address)+'</div></article>':'')+
      '<article class="c360-card">'+sectionTitle('Itens do pedido',esc(items.length)+' item(ns)')+
        '<div class="c360-item-list">'+(items.length?items.map(i=>'<div><span><b>'+esc(i.quantity)+'×</b> '+esc(i.name||'Produto')+'</span><strong>'+money(i.line_total||0)+'</strong></div>').join(''):empty('Sem itens registrados.'))+'</div>'+
        '<div class="c360-order-total"><span>Total do pedido</span><strong>'+money(order.total||0)+'</strong></div>'+
      '</article>'+
    '</div>'+
  '</div>';
}
