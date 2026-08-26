(() => {
  'use strict';

  const BUILD = '20260826-ceneca10-personalizadas-v1';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PRODUCTS_NODE = 'produtos';
  const MODELS_NODE = 'canecas/modelos_criacao';
  const COMMANDS_NODE = 'canecas/comandos_criacao';
  const PUBLIC_NODE = 'canecas/personalizadas_publicas';
  const PRIVATE_NODE = 'canecas/personalizadas';
  const WHATSAPP_QUEUE_NODE = 'canecas/whatsapp_fila';
  const PUBLIC_CONFIG_NODE = 'canecas/config_publica';
  const WEBHOOK_KEY = 'da_admin_v2_mug_make_webhook';
  const QUALITY_KEY = 'da_ceneca10_quality';
  const BUSINESS_WHATSAPP = '5565998150975';
  const MASTER_WIDTH = 2400;
  const MASTER_HEIGHT = 960;
  const SIDE_WIDTH = 1344;
  const PRICE = 24.90;
  const COST = 10;
  const NCM = '69111090';
  const PLACEHOLDER_ART = '__MUG_ART__';
  const PLACEHOLDER_MOCKUP_1 = '__MUG_MOCKUP_1__';
  const PLACEHOLDER_MOCKUP_2 = '__MUG_MOCKUP_2__';
  const PLACEHOLDER_MOCKUP_3 = '__MUG_MOCKUP_3__';

  const state = { models: [], selectedModel: null, photoFile: null, busy: false, webhook: '', quality: 'high' };
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? '').trim();
  const escapeHtml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const isUrl = value => /^https?:\/\//i.test(text(value));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function requestId() { return `cp-${Date.now()}-${Math.random().toString(36).slice(2,10)}`; }

  function normalizePhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
    return digits;
  }

  function formatPhoneInput(value) {
    const d = String(value || '').replace(/\D/g, '').slice(0,11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível ler a foto.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve,reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível abrir uma das imagens.'));
      img.src = src;
    });
  }

  async function normalizePhoto(file) {
    const img = await loadImage(await fileToDataUrl(file));
    const scale = Math.min(1, 1500 / img.naturalWidth, 1500 / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha:false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,w,h);
    ctx.drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/webp', .94);
  }

  async function fetchAsDataUrl(url) {
    if (!isUrl(url)) return '';
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) return '';
    const blob = await res.blob();
    return new Promise((resolve,reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function cropMaster(source) {
    const image = await loadImage(source);
    const target = MASTER_WIDTH / MASTER_HEIGHT;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    let sx=0, sy=0, sw=image.naturalWidth, sh=image.naturalHeight;
    if (sourceRatio > target) {
      sw = image.naturalHeight * target;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / target;
      sy = (image.naturalHeight - sh) / 2;
    }
    const canvas = document.createElement('canvas');
    canvas.width = MASTER_WIDTH;
    canvas.height = MASTER_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha:false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,MASTER_WIDTH,MASTER_HEIGHT);
    ctx.drawImage(image,sx,sy,sw,sh,0,0,MASTER_WIDTH,MASTER_HEIGHT);
    return canvas.toDataURL('image/webp', .96);
  }

  async function sideReference(master, mode) {
    const image = await loadImage(master);
    const sx = mode === 1 ? 0 : mode === 2 ? MASTER_WIDTH - SIDE_WIDTH : Math.round((MASTER_WIDTH - SIDE_WIDTH) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = SIDE_WIDTH;
    canvas.height = MASTER_HEIGHT;
    const ctx = canvas.getContext('2d', { alpha:false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,sx,0,SIDE_WIDTH,MASTER_HEIGHT,0,0,SIDE_WIDTH,MASTER_HEIGHT);
    return canvas.toDataURL('image/webp', .96);
  }

  async function buildComposite(modelDataUrl, customerDataUrl) {
    if (!modelDataUrl) return customerDataUrl;
    const [model,user] = await Promise.all([loadImage(modelDataUrl), loadImage(customerDataUrl)]);
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d', { alpha:false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const drawContain = (img,x,y,w,h) => {
      const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      ctx.drawImage(img, x + (w - dw)/2, y + (h - dh)/2, dw, dh);
    };
    drawContain(model,0,0,900,1000);
    drawContain(user,900,0,900,1000);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(897,0,6,1000);
    return canvas.toDataURL('image/webp', .94);
  }

  async function callMake(payload, timeoutMs=180000) {
    if (!state.webhook) throw new Error('Automação ainda não configurada para esta página de teste.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(state.webhook, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ payload:JSON.stringify(payload) }),
        signal:controller.signal,
      });
      const raw = await res.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`Automação respondeu conteúdo inválido (${res.status}).`); }
      if (!res.ok || data.ok === false) throw new Error(data.error || data.message || `Automação respondeu HTTP ${res.status}.`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  function uniqueUrls(values) { return [...new Set(values.flat(Infinity).map(text).filter(isUrl))]; }
  function modelImages(model, product) {
    return uniqueUrls([model.mockup_1,model.mockup_2,model.mockup_3,model.imagem,product?.mockup_1,product?.mockup_2,product?.mockup_3,product?.imagens_site||[],product?.imagens||[]]).slice(0,3);
  }
  function modelArt(model, product) {
    return text(product?.arte_horizontal || product?.arte_personalizacao || product?.arte_impressao?.url || model.arte_horizontal || model.mockup_1 || model.imagem || product?.mockup_1);
  }

  async function fetchProduct(key) {
    const r = await fetch(`${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(key)}.json`, { cache:'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return d && typeof d === 'object' ? d : null;
  }

  async function fetchModels() {
    const res = await fetch(`${FIREBASE_URL}/${MODELS_NODE}.json?_=${Date.now()}`, { cache:'no-store' });
    if (!res.ok) throw new Error('Não foi possível carregar os modelos.');
    const data = await res.json();
    const base = Object.entries(data || {})
      .filter(([,v]) => v && typeof v === 'object')
      .map(([key,v]) => ({
        id:text(v.id || key),
        product_key:text(v.product_key || v.firebaseKey || key),
        nome:text(v.nome || 'Modelo de caneca'),
        imagem:text(v.imagem),
        mockup_1:text(v.mockup_1),
        mockup_2:text(v.mockup_2),
        mockup_3:text(v.mockup_3),
        comandos_ids:Array.isArray(v.comandos_ids) ? v.comandos_ids.map(text).filter(Boolean) : [],
        instrucao_manual:text(v.instrucao_manual),
        instrucao_efetiva:text(v.instrucao_efetiva),
        atualizado_em:text(v.atualizado_em),
      }))
      .filter(m => m.product_key)
      .sort((a,b) => Date.parse(b.atualizado_em || '') - Date.parse(a.atualizado_em || ''))
      .slice(0,12);
    return Promise.all(base.map(async m => {
      const product = await fetchProduct(m.product_key).catch(() => null);
      return { ...m, product, images:modelImages(m,product), art:modelArt(m,product) };
    }));
  }

  async function fetchCommands() {
    const res = await fetch(`${FIREBASE_URL}/${COMMANDS_NODE}.json`, { cache:'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Object.entries(data || {})
      .map(([key,v]) => ({ id:text(v?.id || key), texto:text(v?.texto) }))
      .filter(x => x.id && x.texto);
  }

  function renderModels() {
    const el = $('modelsTrack');
    if (!state.models.length) {
      el.innerHTML = '<div class="empty-models">Nenhum modelo está disponível ainda. Marque modelos no Criador de Canecas do Produção.</div>';
      return;
    }
    el.innerHTML = state.models.map((m,i) => `<button type="button" class="model-card ${state.selectedModel?.product_key===m.product_key?'is-selected':''}" data-model="${escapeHtml(m.product_key)}"><div class="model-image"><img src="${escapeHtml(m.images[0] || m.imagem || '../site/img/logoantonia5.png')}" alt="Modelo ${i+1}"></div><div class="model-foot"><strong>${escapeHtml(m.nome)}</strong><small>Escolher este modelo</small></div></button>`).join('');
  }

  async function modelRecipe(model) {
    const commands = await fetchCommands();
    const blocks = commands.filter(c => model.comandos_ids.includes(c.id)).map((c,i) => `COMANDO DE ESTILO ${i+1}:\n${c.texto}`);
    if (model.instrucao_manual) blocks.push(`INSTRUÇÃO DO MODELO:\n${model.instrucao_manual}`);
    else if (!blocks.length && model.instrucao_efetiva) blocks.push(`INSTRUÇÃO DO MODELO:\n${model.instrucao_efetiva}`);
    return blocks.join('\n\n');
  }

  function artPrompt(modelRecipeText, phrase) {
    return `A imagem de referência enviada está dividida em duas partes: a METADE ESQUERDA mostra o MODELO VISUAL escolhido pelo cliente; a METADE DIREITA mostra a FOTO DO CLIENTE que deve ser incorporada à nova arte.\n\nCrie uma NOVA ARTE HORIZONTAL PARA SUBLIMAÇÃO DE CANECA, aproximadamente 24 × 9,5 cm, pronta para fechamento em 2400 × 960 px.\n\nOBJETIVO:\n- preserve a linguagem visual, composição, clima, cores e estilo do modelo da esquerda;\n- use a pessoa/animal/objeto da foto da direita como conteúdo personalizado principal;\n- não copie nomes ou frases existentes no modelo;\n- adapte o layout para a nova foto mantendo resultado comercial e elegante;\n- não mostrar caneca, mãos, mesa, embalagem ou mockup; entregar somente a arte plana.\n\n${modelRecipeText ? `REGRAS DO MODELO:\n${modelRecipeText}\n\n` : ''}${phrase ? `FRASE DO CLIENTE — ESCREVER EXATAMENTE ASSIM:\n${phrase}\n- esta frase é obrigatória; preserve palavras, acentos e pontuação;\n- posicione de forma bonita e legível.\n\n` : 'O cliente não informou frase. Não invente texto.\n\n'}ENTREGA: uma única arte horizontal nova, harmoniosa e pronta para sublimação.`;
  }

  function mockupPrompt(side) {
    const pos = side===1 ? 'primeira metade/lado esquerdo' : side===2 ? 'segunda metade/lado direito' : 'centro da arte';
    return `Use a arte fornecida como arte-mestre imutável. Mostre o ${pos} na face visível de uma caneca branca de porcelana 350ml. Fotografia quadrada 1:1 ultra realista, fundo claro e simples, caneca inteira visível, sem objetos extras. Não redesenhe nem reescreva a arte. Preserve proporções e aplique somente a curvatura natural da caneca.`;
  }

  function safeName(customerName, phrase) {
    const first = text(customerName).split(/\s+/)[0];
    const idea = text(phrase).replace(/[\r\n]+/g,' ').slice(0,45).replace(/\s+\S*$/,'').trim();
    return `Caneca de Porcelana Personalizada ${idea || first || 'Exclusiva'} - 350ml`;
  }

  function resultUrl(id) {
    const u = new URL('./resultado.html', location.href);
    u.search = '';
    u.searchParams.set('id', id);
    return u.href;
  }

  function orderUrl(id,url) {
    return `https://wa.me/${BUSINESS_WHATSAPP}?text=${encodeURIComponent(`Olá! Quero encomendar a caneca personalizada ${id}.\nLink da minha criação: ${url}`)}`;
  }

  function selfWhatsappUrl(phone,url) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(`Minha caneca personalizada ficou pronta ✨\nVeja as 4 imagens aqui:\n${url}`)}`;
  }

  function firebaseTemplate(id, data) {
    const now = new Date().toISOString();
    const suffix = id.slice(-8).toUpperCase();
    return JSON.stringify({
      id,
      firebaseKey:id,
      codigo:`CANP-${suffix}`,
      gtin:'', ean:'', codigo_barras:'',
      nome:data.productName,
      categoria:'Caneca de Porcelana',
      subcategoria:'Personalizadas',
      tema:'Personalizada',
      subsubcategoria:'',
      ncm:NCM,
      preco_custo:COST,
      preco:PRICE,
      estoque:0,
      situacao:'I',
      ativo:false,
      material:'Porcelana',
      capacidade:'350ml',
      embalagem:'Caneca de porcelana 350ml',
      unidade:'UN',
      dimensao_impressao:'24 × 9,5 cm',
      descricao:`${data.productName}. Caneca de porcelana branca 350ml criada sob encomenda a partir de modelo, foto e frase enviados pelo cliente.`,
      tags:['caneca personalizada','caneca com foto','presente personalizado','caneca 350ml'],
      url_imagem:PLACEHOLDER_MOCKUP_1,
      imagem:PLACEHOLDER_MOCKUP_1,
      imagem_url:PLACEHOLDER_MOCKUP_1,
      imagens:[PLACEHOLDER_MOCKUP_1,PLACEHOLDER_MOCKUP_2,PLACEHOLDER_MOCKUP_3],
      imagens_site:[PLACEHOLDER_MOCKUP_1,PLACEHOLDER_MOCKUP_2,PLACEHOLDER_MOCKUP_3],
      mockup_1:PLACEHOLDER_MOCKUP_1,
      mockup_2:PLACEHOLDER_MOCKUP_2,
      mockup_3:PLACEHOLDER_MOCKUP_3,
      arte_personalizacao:PLACEHOLDER_ART,
      arte_horizontal:PLACEHOLDER_ART,
      arte_impressao:{url:PLACEHOLDER_ART,ratio:'2400:960',width:2400,height:960,dimensao_real:'24 × 9,5 cm',formato:'webp'},
      midias_admin:[PLACEHOLDER_MOCKUP_1,PLACEHOLDER_MOCKUP_2,PLACEHOLDER_MOCKUP_3,PLACEHOLDER_ART],
      origem_cadastro:'ceneca10_cliente_teste',
      tipo_produto:'caneca_personalizada',
      geracao_status:'concluido',
      geracao_versao:'ceneca10-personalizadas-v1',
      personalizacao_cliente:{nome:data.customerName,whatsapp:data.phone,frase:data.phrase,modelo_key:data.model.product_key,modelo_nome:data.model.nome,resultado_url:data.publicUrl,consentimento_whatsapp:true},
      configuracao_arte:{modo:'cliente_modelo_foto_frase',modelo_key:data.model.product_key,frase_cliente:data.phrase,width:2400,height:960},
      criado_em:now,
      updated_at:now,
      last_update:Date.now(),
    });
  }

  async function directSaveProduct(id, template, urls) {
    const product = JSON.parse(template);
    const replace = value => value===PLACEHOLDER_ART ? urls.art : value===PLACEHOLDER_MOCKUP_1 ? urls.m1 : value===PLACEHOLDER_MOCKUP_2 ? urls.m2 : value===PLACEHOLDER_MOCKUP_3 ? urls.m3 : value;
    product.imagens = product.imagens.map(replace);
    product.imagens_site = product.imagens_site.map(replace);
    product.midias_admin = product.midias_admin.map(replace);
    product.url_imagem = urls.m1;
    product.imagem = urls.m1;
    product.imagem_url = urls.m1;
    product.mockup_1 = urls.m1;
    product.mockup_2 = urls.m2;
    product.mockup_3 = urls.m3;
    product.arte_personalizacao = urls.art;
    product.arte_horizontal = urls.art;
    product.arte_impressao.url = urls.art;
    const res = await fetch(`${FIREBASE_URL}/${PRODUCTS_NODE}/${encodeURIComponent(id)}.json`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(product) });
    if (!res.ok) throw new Error('Não foi possível salvar a caneca no Produção.');
  }

  async function saveCreationRecords(id, data, urls) {
    const now = new Date().toISOString();
    const publicData = { id, nome_publico:`Caneca personalizada de ${data.customerName.split(/\s+/)[0] || 'cliente'}`, modelo_nome:data.model.nome, modelo_key:data.model.product_key, frase:data.phrase, arte_horizontal:urls.art, mockup_1:urls.m1, mockup_2:urls.m2, mockup_3:urls.m3, produto_key:id, criado_em:now };
    const privateData = { ...publicData, cliente_nome:data.customerName, cliente_whatsapp:data.phone, consentimento_whatsapp:true, status:'aguardando_encomenda', resultado_url:data.publicUrl, origem:'ceneca10_cliente_teste' };
    const [a,b] = await Promise.all([
      fetch(`${FIREBASE_URL}/${PUBLIC_NODE}/${encodeURIComponent(id)}.json`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(publicData) }),
      fetch(`${FIREBASE_URL}/${PRIVATE_NODE}/${encodeURIComponent(id)}.json`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(privateData) }),
    ]);
    if (!a.ok || !b.ok) throw new Error('A caneca foi criada, mas o link público não pôde ser salvo.');
  }

  async function queueWhatsapp(id, data) {
    const payload = { id, telefone:data.phone, nome:data.customerName, resultado_url:data.publicUrl, mensagem:`Olá, ${data.customerName.split(/\s+/)[0] || ''}! Sua caneca personalizada ficou pronta ✨ Veja as 4 imagens e encomende aqui: ${data.publicUrl}`, status:'pendente', criado_em:new Date().toISOString(), origem:BUILD };
    await fetch(`${FIREBASE_URL}/${WHATSAPP_QUEUE_NODE}/${encodeURIComponent(id)}.json`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }).catch(() => {});
    try {
      await callMake({ action:'send_mug_customer_whatsapp', request_id:id, customer_name:data.customerName, customer_phone:data.phone, result_url:data.publicUrl, message:payload.mensagem }, 12000);
      await fetch(`${FIREBASE_URL}/${WHATSAPP_QUEUE_NODE}/${encodeURIComponent(id)}.json`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'enviado_solicitado',atualizado_em:new Date().toISOString()}) }).catch(() => {});
      return true;
    } catch (error) {
      console.warn('Envio automático de WhatsApp ainda não disponível:', error);
      return false;
    }
  }

  function progress(percent,title,detail) {
    $('progressCard').hidden = false;
    $('progressPercent').textContent = `${percent}%`;
    $('progressBar').style.width = `${percent}%`;
    $('progressTitle').textContent = title;
    if (detail) $('progressDetail').textContent = detail;
  }

  async function loadWebhook() {
    state.quality = localStorage.getItem(QUALITY_KEY) || 'high';
    state.webhook = text(localStorage.getItem(WEBHOOK_KEY));
    if (state.webhook) return;
    try {
      const r = await fetch(`${FIREBASE_URL}/${PUBLIC_CONFIG_NODE}/make_webhook.json`, { cache:'no-store' });
      if (r.ok) {
        const value = await r.json();
        if (typeof value === 'string' && /^https:\/\//i.test(value)) state.webhook = value;
      }
    } catch {}
  }

  async function generate() {
    if (state.busy) return;
    const model = state.selectedModel;
    const phrase = text($('phraseInput').value);
    const customerName = text($('customerNameInput').value);
    const phone = normalizePhone($('customerPhoneInput').value);
    if (!model) return toast('Escolha um modelo.');
    if (!state.photoFile) return toast('Envie sua foto.');
    if (!customerName) return toast('Informe seu nome.');
    if (!/^55\d{10,11}$/.test(phone)) return toast('Informe um WhatsApp válido com DDD.');
    if (!$('whatsappConsentInput').checked) return toast('Autorize o envio do link desta criação pelo WhatsApp.');
    if (!state.webhook) return toast('Esta página de teste ainda não está ligada à automação.');

    state.busy = true;
    $('generateButton').disabled = true;
    $('doneCard').hidden = true;
    $('bottomAction').hidden = true;
    const id = requestId();
    const publicUrl = resultUrl(id);
    const productName = safeName(customerName, phrase);
    const data = { id, model, phrase, customerName, phone, publicUrl, productName };

    try {
      progress(8,'Preparando sua foto…','Estamos organizando as referências do modelo escolhido.');
      const customerPhoto = await normalizePhoto(state.photoFile);
      let modelData = '';
      try { modelData = await fetchAsDataUrl(model.art || model.images[0]); } catch {}
      const composite = await buildComposite(modelData, customerPhoto);
      const recipe = await modelRecipe(model);

      progress(22,'Criando a arte personalizada…','Aplicando sua foto e frase ao estilo escolhido.');
      const artRes = await callMake({ action:'generate_mug_art', request_id:id, image_base64:composite, instruction:recipe, prompt_art:artPrompt(recipe,phrase), quality:state.quality });
      const artSource = text(artRes.art_source_url || artRes.result_url);
      if (!artSource) throw new Error('A automação não devolveu a arte criada.');

      progress(46,'Ajustando a arte…','Preparando a imagem final para a caneca.');
      const master = await cropMaster(artSource);
      const [left,right,center] = await Promise.all([sideReference(master,1),sideReference(master,2),sideReference(master,3)]);
      const template = firebaseTemplate(id,data);

      progress(58,'Criando as prévias…','Agora estamos gerando as três vistas da caneca.');
      const finalRes = await callMake({ action:'finalize_mug_product', request_id:id, image_base64:master, mockup_left_base64:left, mockup_right_base64:right, mockup_center_base64:center, instruction:recipe, product_name:productName, prompt_mockup_1:mockupPrompt(1), prompt_mockup_2:mockupPrompt(2), prompt_mockup_3:mockupPrompt(3), quality:'high', firebase_url:FIREBASE_URL, products_node:PRODUCTS_NODE, firebase_template_json:template });
      const urls = { art:text(finalRes.art_url || finalRes.arte_url || finalRes.art_source_url) || artSource, m1:text(finalRes.mockup_1_url), m2:text(finalRes.mockup_2_url), m3:text(finalRes.mockup_3_url) };
      if (!urls.m1 || !urls.m2 || !urls.m3) throw new Error('A automação não devolveu os três mockups.');

      progress(82,'Salvando sua criação…','Gerando o link para você conferir e encomendar.');
      if (finalRes.product_saved !== true) await directSaveProduct(id,template,urls);
      await saveCreationRecords(id,data,urls);

      progress(94,'Preparando seu WhatsApp…','Seu link já está pronto.');
      const sent = await queueWhatsapp(id,data);
      await sleep(350);
      progress(100,'Tudo pronto!','Sua criação foi concluída.');
      $('donePreview').src = urls.m1;
      $('viewResultButton').href = publicUrl;
      $('selfWhatsappButton').href = selfWhatsappUrl(phone,publicUrl);
      $('orderButton').href = orderUrl(id,publicUrl);
      $('doneMessage').textContent = sent ? 'Solicitamos o envio automático do link para o seu WhatsApp.' : 'Seu link está pronto. Toque abaixo para salvá-lo no seu WhatsApp.';
      $('doneCard').hidden = false;
      $('progressCard').hidden = true;
      $('doneCard').scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) {
      console.error('Falha no teste de caneca personalizada:', error);
      toast(error?.message || String(error));
      $('progressCard').hidden = true;
      $('bottomAction').hidden = false;
    } finally {
      state.busy = false;
      $('generateButton').disabled = false;
    }
  }

  async function saveAdminSettings() {
    const hook = text($('webhookInput').value);
    if (!/^https:\/\//i.test(hook)) return toast('Informe um webhook válido.');
    localStorage.setItem(WEBHOOK_KEY,hook);
    localStorage.setItem(QUALITY_KEY,$('qualityInput').value || 'high');
    state.webhook = hook;
    state.quality = $('qualityInput').value || 'high';
    if ($('publishWebhookInput').checked) {
      const r = await fetch(`${FIREBASE_URL}/${PUBLIC_CONFIG_NODE}/make_webhook.json`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(hook) });
      if (!r.ok) return toast('Configuração local salva, mas não foi possível publicar para teste.');
    }
    toast('Automação configurada.');
    $('adminSettingsDialog').close();
  }

  function bind() {
    $('modelsTrack').addEventListener('click', e => {
      const button = e.target.closest('[data-model]');
      if (!button) return;
      state.selectedModel = state.models.find(m => m.product_key === button.dataset.model) || null;
      renderModels();
    });
    $('customerPhotoInput').addEventListener('change', () => {
      const file = $('customerPhotoInput').files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      state.photoFile = file;
      $('customerPhotoPreview').src = URL.createObjectURL(file);
      $('customerPhotoPreview').hidden = false;
      $('photoEmpty').hidden = true;
      $('changePhotoButton').hidden = false;
    });
    $('changePhotoButton').addEventListener('click', () => $('customerPhotoInput').click());
    $('phraseInput').addEventListener('input', () => $('phraseCount').textContent = $('phraseInput').value.length);
    $('customerPhoneInput').addEventListener('input', () => { $('customerPhoneInput').value = formatPhoneInput($('customerPhoneInput').value); });
    $('generateButton').addEventListener('click', generate);
    $('createAnotherButton').addEventListener('click', () => location.reload());
    const adminMode = new URLSearchParams(location.search).get('admin') === '1';
    if (adminMode) {
      $('adminSettingsButton').hidden = false;
      $('adminSettingsButton').addEventListener('click', () => {
        $('webhookInput').value = state.webhook;
        $('qualityInput').value = state.quality;
        $('adminSettingsDialog').showModal();
      });
      $('saveAdminSettingsButton').addEventListener('click', saveAdminSettings);
    }
  }

  async function init() {
    bind();
    await loadWebhook();
    try {
      state.models = await fetchModels();
      if (state.models.length) state.selectedModel = state.models[0];
      renderModels();
    } catch (error) {
      $('modelsTrack').innerHTML = `<div class="empty-models">${escapeHtml(error?.message || error)}</div>`;
    }
    if (!state.webhook && new URLSearchParams(location.search).get('admin') === '1') toast('Configure o webhook desta página de teste na engrenagem.');
  }

  init();
})();
