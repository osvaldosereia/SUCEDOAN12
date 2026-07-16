(function donaAntoniaNfeImportModule() {
  'use strict';

  const bridge = window.__DA_NFE_BRIDGE__;
  if (!bridge) {
    console.error('Entrada de NF-e: a ponte do admin não foi carregada.');
    let panel = document.getElementById('tab-nfe');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'tab-nfe';
      panel.className = 'panel hidden';
      document.querySelector('main.app')?.appendChild(panel);
    }
    if (panel) {
      const notice = document.createElement('div');
      notice.className = 'notice red';
      notice.textContent = 'A Entrada de NF-e não conseguiu iniciar porque o admin foi interrompido por outro erro. Recarregue a página; se continuar, esta mensagem identifica uma falha no index.';
      panel.replaceChildren(notice);
    }
    return;
  }

  const {
    state, norm, getKey, getName, productByKey, esc, textNorm, toNum, nowIso,
    setStatus, toast, runUiAction, saveLocal, renderProducts, renderSummary,
    syncNfeProductToFirebase
  } = bridge;

  const model = {
    items: [],
    note: null,
    message: 'Selecione o XML salvo da NF-e para começar.',
    messageType: 'gold',
    scannedKey: '',
    globalValidity: '',
    margin: 40,
    busy: false
  };

  const $ = id => document.getElementById(id);
  const number = value => Number(String(value ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
  const round = value => Math.round(number(value) * 100) / 100;
  const money = value => number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const safe = value => esc(String(value ?? ''));
  const digits = value => String(value ?? '').replace(/\D/g, '');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const itemById = id => model.items.find(item => item.id === id);
  const selectedProduct = item => item?.key ? productByKey(item.key) : null;
  const randomId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function nodeText(parent, ...names) {
    for (const name of names) {
      const node = parent?.getElementsByTagName(name)?.[0];
      const value = String(node?.textContent || '').trim();
      if (value) return value;
    }
    return '';
  }

  const DATE_MASK = '__/__/____';
  const DATE_DIGIT_POSITIONS = [0, 1, 3, 4, 6, 7, 8, 9];

  function dateMaskFromDigits(value) {
    const raw = digits(value).slice(0, 8);
    const chars = DATE_MASK.split('');
    raw.split('').forEach((digit, index) => {
      chars[DATE_DIGIT_POSITIONS[index]] = digit;
    });
    return chars.join('');
  }

  function dateValueFromMask(value) {
    const raw = digits(value).slice(0, 8);
    return raw.length ? dateMaskFromDigits(raw) : '';
  }

  function dateInputValue(value) {
    const raw = digits(value).slice(0, 8);
    return raw.length ? dateMaskFromDigits(raw) : '';
  }

  function selectNextDateDigit(input) {
    if (!input || typeof input.setSelectionRange !== 'function') return;
    const count = digits(input.value).slice(0, 8).length;
    if (count >= DATE_DIGIT_POSITIONS.length) {
      input.setSelectionRange(DATE_MASK.length, DATE_MASK.length);
      return;
    }
    const position = DATE_DIGIT_POSITIONS[count];
    input.setSelectionRange(position, position + 1);
  }

  function dateTimestamp(value) {
    const raw = String(value || '').trim();
    let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
      const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
      if (date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1])) return date.getTime();
      return NaN;
    }
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12).getTime();
    return NaN;
  }

  function validDate(value) {
    return Number.isFinite(dateTimestamp(value));
  }

  function entryList(product) {
    const value = product?.entradas_nfe;
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  }

  function lotList(product) {
    const value = product?.lotes;
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
  }

  function noteEntryId(item) {
    const noteId = model.note?.key || model.note?.number || model.note?.issuedAt || 'SEM_CHAVE';
    return `${noteId}|${item.groupKey}`;
  }

  function alreadyApplied(item, product = selectedProduct(item)) {
    if (!product) return false;
    const id = noteEntryId(item);
    return entryList(product).some(entry => String(entry?.id || '') === id);
  }

  function findByEan(ean) {
    const code = norm(ean);
    if (!code) return null;
    return state.produtos.find(product => {
      const values = [
        product.gtin, product.ean,
        ...(Array.isArray(product.ean_aliases) ? product.ean_aliases : [])
      ];
      return values.some(value => norm(value) === code);
    }) || null;
  }

  function productMatches(product, query) {
    const raw = String(query || '').trim();
    if (!raw) return false;
    const words = textNorm(raw);
    const code = norm(raw);
    return [
      getName(product), product.codigo, product.gtin, product.ean,
      product.id, product.firebaseKey, product.marca, product.embalagem
    ].some(value => textNorm(value).includes(words) || (code && norm(value).includes(code)));
  }

  function detectMultiplier({ name, commercialUnit, commercialQuantity, taxableUnit, taxableQuantity }) {
    const qCom = number(commercialQuantity);
    const qTrib = number(taxableQuantity);
    const unitCom = String(commercialUnit || '').trim().toUpperCase();
    const unitTrib = String(taxableUnit || '').trim().toUpperCase();

    if (qCom > 0 && qTrib > qCom && unitCom && unitTrib && unitCom !== unitTrib) {
      const ratio = qTrib / qCom;
      if (Number.isInteger(ratio) && ratio >= 2 && ratio <= 1000) {
        return { value: ratio, source: `NF-e: ${qTrib} ${unitTrib} ÷ ${qCom} ${unitCom}` };
      }
    }

    const haystack = `${String(name || '').toUpperCase()} ${unitCom}`
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ' ')
      .replace(/\s+/g, ' ');

    const patterns = [
      /(?:C\/|C\s*\/\s*|COM\s+)(\d{1,4})\s*(?:UN|UND|UNID|UNIDADE|UNIDADES)\b/,
      /(?:CAIXA|CX|FARDO|FD|DISPLAY|PACK|PACOTE|PCT)\s*(?:C\/|COM|DE)?\s*(\d{1,4})\s*(?:UN|UND|UNID|UNIDADE|UNIDADES)\b/,
      /\b(?:CX|FD|PCT|PACK)(\d{1,4})\b/
    ];

    for (const pattern of patterns) {
      const match = haystack.match(pattern);
      const value = Number(match?.[1]);
      if (Number.isInteger(value) && value >= 2 && value <= 1000) {
        return { value, source: `Detectado na descrição/embalagem: ${match[0]}` };
      }
    }

    return { value: 1, source: 'Produto unitário ou embalagem sem quantidade explícita' };
  }

  function allocateEqualDiscount(items, discountValue) {
    const totalCents = Math.max(0, Math.round(number(discountValue) * 100));
    const capacities = items.map(item => Math.max(0, Math.round(number(item.gross) * 100) - 1));
    const allocated = items.map(() => 0);
    let remaining = Math.min(totalCents, capacities.reduce((sum, value) => sum + value, 0));
    let active = capacities.map((capacity, index) => ({ capacity, index })).filter(row => row.capacity > 0);

    while (remaining > 0 && active.length) {
      const baseShare = Math.max(1, Math.floor(remaining / active.length));
      let progressed = 0;
      for (const row of active) {
        if (remaining <= 0) break;
        const room = row.capacity - allocated[row.index];
        if (room <= 0) continue;
        const give = Math.min(room, baseShare, remaining);
        allocated[row.index] += give;
        remaining -= give;
        progressed += give;
      }
      active = active.filter(row => allocated[row.index] < row.capacity);
      if (!progressed) break;
    }

    items.forEach((item, index) => {
      item.discount = allocated[index] / 100;
    });
  }

  function recalculateItem(item, preserveSale = false) {
    item.multiplier = Math.max(1, Math.floor(number(item.multiplier) || 1));
    item.incomingUnits = round(item.commercialQuantity * item.multiplier);
    item.net = Math.max(0, round(item.gross - item.discount));
    item.unitCost = item.incomingUnits > 0 ? round(item.net / item.incomingUnits) : 0;
    if (!preserveSale || !item.manualSale) {
      const margin = Math.min(95, Math.max(0, number(model.margin)));
      item.salePrice = margin < 100 ? round(item.unitCost / (1 - margin / 100)) : item.unitCost;
    }
  }

  function recalculateAll() {
    allocateEqualDiscount(model.items, model.note?.discount || 0);
    model.items.forEach(item => recalculateItem(item));
  }

  function parseXml(rawXml) {
    const raw = String(rawXml || '').trim();
    if (!raw) throw new Error('Selecione ou cole o XML completo da NF-e.');
    if (!raw.includes('<')) {
      const possibleKey = digits(raw);
      if (possibleKey.length === 44) {
        model.scannedKey = possibleKey;
        throw new Error('Chave da NF-e identificada. Agora selecione o arquivo XML salvo da mesma nota.');
      }
      throw new Error('O conteúdo informado não é um XML válido.');
    }

    const documentXml = new DOMParser().parseFromString(raw, 'application/xml');
    if (documentXml.querySelector('parsererror')) throw new Error('XML inválido ou incompleto.');

    const infNFe = documentXml.getElementsByTagName('infNFe')[0];
    if (!infNFe) throw new Error('O arquivo não possui a estrutura de uma NF-e autorizada.');

    const details = [...infNFe.getElementsByTagName('det')];
    if (!details.length) throw new Error('Não encontrei produtos dentro da NF-e.');

    const ide = infNFe.getElementsByTagName('ide')[0];
    const emit = infNFe.getElementsByTagName('emit')[0];
    const totals = infNFe.getElementsByTagName('ICMSTot')[0] || documentXml;
    const infId = String(infNFe.getAttribute('Id') || '').replace(/^NFe/i, '');
    const protocolKey = nodeText(documentXml, 'chNFe');
    const accessKey = digits(infId || protocolKey);

    if (model.scannedKey && accessKey && model.scannedKey !== accessKey) {
      throw new Error('A chave escaneada não corresponde ao XML selecionado.');
    }

    const note = {
      key: accessKey,
      number: nodeText(ide, 'nNF'),
      series: nodeText(ide, 'serie'),
      issuedAt: nodeText(ide, 'dhEmi', 'dEmi'),
      supplier: nodeText(emit, 'xNome'),
      supplierCnpj: digits(nodeText(emit, 'CNPJ', 'CPF')),
      gross: number(nodeText(totals, 'vProd')),
      discount: number(nodeText(totals, 'vDesc')),
      total: number(nodeText(totals, 'vNF')),
      lineCount: details.length
    };

    const grouped = new Map();

    details.forEach((detail, index) => {
      const productNode = detail.getElementsByTagName('prod')[0];
      if (!productNode) return;

      const ean = digits(nodeText(productNode, 'cEAN') || nodeText(productNode, 'cEANTrib'));
      const supplierCode = nodeText(productNode, 'cProd');
      const name = nodeText(productNode, 'xProd') || `Produto ${index + 1}`;
      const commercialQuantity = number(nodeText(productNode, 'qCom'));
      const taxableQuantity = number(nodeText(productNode, 'qTrib'));
      const commercialUnit = nodeText(productNode, 'uCom');
      const taxableUnit = nodeText(productNode, 'uTrib');
      const gross = number(nodeText(productNode, 'vProd')) ||
        round(number(nodeText(productNode, 'vUnCom')) * commercialQuantity);
      const groupKey = ean ? `EAN:${ean}` : `COD:${supplierCode || textNorm(name)}`;
      const detected = detectMultiplier({
        name, commercialUnit, commercialQuantity, taxableUnit, taxableQuantity
      });

      let item = grouped.get(groupKey);
      if (!item) {
        item = {
          id: randomId('nfe_item'),
          groupKey,
          lines: [],
          supplierCodes: [],
          ean,
          name,
          ncm: digits(nodeText(productNode, 'NCM')),
          cest: digits(nodeText(productNode, 'CEST')),
          packaging: commercialUnit,
          commercialQuantity: 0,
          taxableQuantity: 0,
          gross: 0,
          discount: 0,
          multiplier: detected.value,
          multiplierSource: detected.source,
          incomingUnits: 0,
          net: 0,
          unitCost: 0,
          salePrice: 0,
          manualSale: false,
          key: '',
          search: '',
          searchResults: [],
          searched: false,
          addStock: true,
          skipped: false,
          done: false,
          duplicate: false,
          validity: model.globalValidity,
          validityMode: 'earliest',
          noExpiry: false,
          choices: {
            name: 'old',
            gtin: 'old',
            ncm: 'old',
            packaging: 'old',
            cost: 'nfe',
            price: 'old'
          }
        };
        grouped.set(groupKey, item);
      }

      item.lines.push(index + 1);
      if (supplierCode && !item.supplierCodes.includes(supplierCode)) item.supplierCodes.push(supplierCode);
      item.commercialQuantity += commercialQuantity;
      item.taxableQuantity += taxableQuantity;
      item.gross += gross;
      if (detected.value > item.multiplier) {
        item.multiplier = detected.value;
        item.multiplierSource = detected.source;
      }
    });

    model.note = note;
    model.items = [...grouped.values()];

    for (const item of model.items) {
      const product = findByEan(item.ean);
      if (product) item.key = getKey(product);
      item.duplicate = alreadyApplied(item, product);
      if (product) {
        item.choices.ncm = product.ncm ? 'old' : 'nfe';
        item.choices.packaging = product.embalagem ? 'old' : 'nfe';
        item.choices.gtin = (product.gtin || product.ean) ? 'old' : 'nfe';
      }
    }

    recalculateAll();
    const duplicates = model.items.filter(item => item.duplicate).length;
    model.message = `${note.lineCount} linha(s) agrupadas em ${model.items.length} produto(s). Desconto rateado igualmente: ${money(note.discount)}.${duplicates ? ` ${duplicates} entrada(s) já aplicada(s) foram bloqueadas.` : ''}`;
    model.messageType = duplicates ? 'red' : 'green';
    render();
  }

  function ensureUi() {
    document.querySelectorAll('.tabs').forEach(nav => {
      if (nav.querySelector('[data-tab="nfe"]')) return;
      const button = document.createElement('button');
      button.className = 'tab';
      button.type = 'button';
      button.dataset.tab = 'nfe';
      button.textContent = 'Entrada de NF-e';
      const anchor = nav.querySelector('[data-tab="produtos"]') || nav.firstElementChild;
      anchor?.insertAdjacentElement('afterend', button);
    });

    let panel = $('tab-nfe');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'tab-nfe';
      panel.className = 'panel hidden';
      document.querySelector('main.app')?.appendChild(panel);
    }
    if (panel.dataset.nfeReady === '1') return;

    panel.dataset.nfeReady = '1';
    panel.innerHTML = `
      <div class="panel-head">
        <div class="panel-title">
          <h2>Entrada por XML de Nota Fiscal</h2>
          <p>Confira os produtos, registre lote e validade e atualize o Firebase com segurança.</p>
        </div>
        <label class="btn primary">↑ Selecionar XML da nota
          <input id="nfeFile" hidden type="file" accept=".xml,text/xml,application/xml">
        </label>
      </div>

      <div class="card pad">
        <div class="nfe-import-grid">
          <div class="field">
            <label>Chave da NF-e — leitor/pistola</label>
            <div class="nfe-inline">
              <input class="input" id="nfeAccessKey" inputmode="numeric" maxlength="44" placeholder="Escaneie os 44 números da chave">
              <button class="btn blue" type="button" data-nfe-action="read-key">Confirmar chave</button>
            </div>
            <small class="tiny">A chave confirma a nota. O navegador não baixa XML da SEFAZ sem certificado; selecione o XML salvo.</small>
          </div>
          <div class="field">
            <label>Ou cole o XML completo</label>
            <textarea id="nfePaste" class="textarea" placeholder="Cole aqui o conteúdo completo do XML"></textarea>
            <button class="btn" type="button" data-nfe-action="read-pasted">Ler XML colado</button>
          </div>
        </div>
        <div id="nfeMessage" class="notice gold" style="margin-top:10px"></div>
      </div>

      <div id="nfeControls"></div>
      <div id="nfeSummary"></div>
      <div id="nfeList" class="nfe-list"></div>
    `;
  }

  function currentValue(product, field) {
    if (!product) return '';
    const map = {
      name: product.nome || product.name || '',
      gtin: product.gtin || product.ean || '',
      ncm: product.ncm || '',
      packaging: product.embalagem || '',
      cost: number(product.preco_custo),
      price: number(product.preco)
    };
    return map[field];
  }

  function importedValue(item, field) {
    const map = {
      name: item.name,
      gtin: item.ean,
      ncm: item.ncm,
      packaging: item.packaging,
      cost: item.unitCost,
      price: item.salePrice
    };
    return map[field];
  }

  function formatField(field, value) {
    return ['cost', 'price'].includes(field) ? money(value) : (value || '—');
  }

  function compareRow(item, product, field, label) {
    const choice = item.choices[field];
    return `
      <tr>
        <th>${safe(label)}</th>
        <td><label><input type="radio" name="${safe(item.id + field)}" data-nfe-choice="${safe(field)}" value="old" ${choice === 'old' ? 'checked' : ''}> ${safe(formatField(field, currentValue(product, field)))}</label></td>
        <td><label><input type="radio" name="${safe(item.id + field)}" data-nfe-choice="${safe(field)}" value="nfe" ${choice === 'nfe' ? 'checked' : ''}> ${safe(formatField(field, importedValue(item, field)))}</label></td>
      </tr>
    `;
  }

  function searchResultsHtml(item) {
    if (!item.searched) return '';
    if (!item.searchResults.length) return '<div class="notice red">Nenhum produto encontrado. Tente nome, código ou EAN.</div>';
    return `
      <div class="nfe-search-results">
        ${item.searchResults.map(product => `
          <button class="btn small green" type="button" data-nfe-action="select-match" data-item-id="${safe(item.id)}" data-key="${safe(getKey(product))}">
            <span>Selecionar: ${safe(getName(product))}</span>
            <small>Cód. ${safe(product.codigo || '')} · EAN ${safe(product.gtin || product.ean || '—')}</small>
          </button>
        `).join('')}
      </div>
    `;
  }

  function itemCard(item) {
    const product = selectedProduct(item);
    const duplicate = item.duplicate || alreadyApplied(item, product);
    const statusClass = item.done ? 'green' : duplicate ? 'red' : product ? 'green' : 'gold';
    const statusText = item.done ? 'Entrada aplicada' : duplicate ? 'Esta NF-e já foi aplicada' : product ? 'Produto encontrado' : 'Produto sem correspondência';
    const currentValidity = product?.validade || 'não cadastrada';
    const futureValidity = item.noExpiry ? 'sem validade' : (item.validity || 'não informada');

    return `
      <article class="card nfe-card ${product ? 'matched' : ''} ${duplicate ? 'duplicate' : ''} ${item.done ? 'done' : ''}" data-item-id="${safe(item.id)}">
        <div class="nfe-card-head">
          <div>
            <span class="chip ${statusClass}">${safe(statusText)}</span>
            <h3>${safe(item.name)}</h3>
            <small>EAN ${safe(item.ean || 'não informado')} · código fornecedor ${safe(item.supplierCodes.join(', ') || '—')} · linha(s) ${safe(item.lines.join(', '))}</small>
          </div>
          ${product ? `<div class="nfe-current"><strong>${safe(getName(product))}</strong><small>Estoque atual: ${number(product.estoque)} · validade atual: ${safe(currentValidity)}</small></div>` : ''}
        </div>

        <div class="nfe-metrics">
          <span>Quantidade comercial <b>${round(item.commercialQuantity)} ${safe(item.packaging || 'un')}</b></span>
          <span>Bruto <b>${money(item.gross)}</b></span>
          <span>Desconto rateado <b>${money(item.discount)}</b></span>
          <span>Líquido <b>${money(item.net)}</b></span>
          <span>Entrada no estoque <b>${round(item.incomingUnits)} un.</b></span>
          <span>Custo por unidade <b>${money(item.unitCost)}</b></span>
        </div>

        <div class="nfe-entry-settings">
          <div class="field">
            <label>Divisor/multiplicador caixa → unidade</label>
            <input class="input" type="number" min="1" max="1000" step="1" data-nfe-field="multiplier" value="${safe(item.multiplier)}">
            <small class="tiny">${safe(item.multiplierSource)}</small>
          </div>
          <div class="field">
            <label>Validade do lote recebido</label>
            <input class="input" type="text" inputmode="numeric" pattern="[0-9]*" data-nfe-field="validity" value="${safe(dateInputValue(item.validity))}" placeholder="__/__/____" autocomplete="off" aria-label="Validade do lote no formato dia mês ano" ${item.noExpiry ? 'disabled' : ''}>
            <small class="tiny">Digite somente os 8 números. Cadastro atual: ${safe(currentValidity)}.</small>
          </div>
          <div class="field">
            <label>Como atualizar a validade do cadastro</label>
            <select class="select" data-nfe-field="validityMode" ${item.noExpiry ? 'disabled' : ''}>
              ${product ? `<option value="keep" ${item.validityMode === 'keep' || item.validityMode === 'history' ? 'selected' : ''}>Manter a validade do estoque atual</option>` : ''}
              <option value="earliest" ${item.validityMode === 'earliest' ? 'selected' : ''}>Manter a validade mais próxima</option>
              <option value="replace" ${item.validityMode === 'replace' ? 'selected' : ''}>Substituir pela validade deste lote</option>
            </select>
          </div>
          <label class="checkline"><input type="checkbox" data-nfe-field="noExpiry" ${item.noExpiry ? 'checked' : ''}> Produto sem validade</label>
          <label class="checkline"><input type="checkbox" data-nfe-field="addStock" ${item.addStock ? 'checked' : ''}> Somar ${round(item.incomingUnits)} un. ao estoque</label>
          <label class="checkline"><input type="checkbox" data-nfe-field="skipped" ${item.skipped ? 'checked' : ''}> Ignorar este item</label>
        </div>

        ${product ? `
          <table class="nfe-table">
            <thead><tr><th>Campo</th><th>Cadastro atual</th><th>Usar dados da NF-e</th></tr></thead>
            <tbody>
              ${compareRow(item, product, 'name', 'Nome')}
              ${compareRow(item, product, 'gtin', 'EAN / GTIN')}
              ${compareRow(item, product, 'ncm', 'NCM')}
              ${compareRow(item, product, 'packaging', 'Embalagem')}
              ${compareRow(item, product, 'cost', 'Preço de custo')}
              ${compareRow(item, product, 'price', 'Preço de venda')}
              <tr><th>Validade</th><td>${safe(currentValidity)}</td><td>${safe(futureValidity)}</td></tr>
            </tbody>
          </table>

          <div class="toolbar nfe-actions">
            <button class="btn green" type="button" data-nfe-action="save-stock" ${duplicate || item.done ? 'disabled' : ''}>Atualizar estoque e validade</button>
            <button class="btn primary" type="button" data-nfe-action="save-full" ${duplicate || item.done ? 'disabled' : ''}>Atualizar cadastro, estoque e validade</button>
          </div>
        ` : `
          <div class="nfe-new-product">
            <div class="nfe-edit-grid">
              <label>Nome<input class="input" data-nfe-field="name" value="${safe(item.name)}"></label>
              <label>EAN<input class="input" inputmode="numeric" data-nfe-field="ean" value="${safe(item.ean)}"></label>
              <label>NCM<input class="input" inputmode="numeric" data-nfe-field="ncm" value="${safe(item.ncm)}"></label>
              <label>Embalagem<input class="input" data-nfe-field="packaging" value="${safe(item.packaging)}"></label>
              <label>Custo unitário<input class="input" data-nfe-field="unitCost" value="${safe(item.unitCost)}"></label>
              <label>Preço sugerido<input class="input" data-nfe-field="salePrice" value="${safe(item.salePrice)}"></label>
            </div>

            <div class="nfe-manual-search">
              <input class="input" data-nfe-search value="${safe(item.search)}" placeholder="Buscar produto existente por nome, código ou EAN">
              <button class="btn blue" type="button" data-nfe-action="find-product">Buscar no Firebase</button>
            </div>
            ${searchResultsHtml(item)}

            <div class="notice gold">O produto novo será criado inativo e na categoria “A CLASSIFICAR” para revisão.</div>

            <button class="btn green block" type="button" data-nfe-action="create-product" ${duplicate || item.done ? 'disabled' : ''}>Criar produto e aplicar entrada no Firebase</button>
          </div>
        `}
      </article>
    `;
  }

  function render() {
    ensureUi();
    const message = $('nfeMessage');
    if (message) {
      message.className = `notice ${model.messageType || 'gold'}`;
      message.textContent = model.message;
    }

    const controls = $('nfeControls');
    const summary = $('nfeSummary');
    const list = $('nfeList');
    if (!controls || !summary || !list) return;

    if (!model.items.length || !model.note) {
      controls.innerHTML = '';
      summary.innerHTML = '';
      list.innerHTML = '';
      return;
    }

    controls.innerHTML = `
      <div class="card pad nfe-global-controls">
        <div class="field">
          <label>Validade para todos os produtos</label>
          <div class="nfe-inline">
            <input class="input" id="nfeGlobalValidity" type="text" inputmode="numeric" pattern="[0-9]*" value="${safe(dateInputValue(model.globalValidity))}" placeholder="__/__/____" autocomplete="off" aria-label="Validade para todos os produtos no formato dia mês ano">
            <button class="btn blue" type="button" data-nfe-action="apply-validity-all">Aplicar validade em todos</button>
          </div>
        </div>
        <div class="field">
          <label>Margem para preço sugerido</label>
          <div class="nfe-inline"><input class="input" id="nfeMargin" type="number" min="0" max="95" value="${safe(model.margin)}"><span>%</span></div>
        </div>
        <div class="notice gold"><strong>Rateio:</strong> o desconto total da nota é dividido igualmente entre os produtos agrupados, sem permitir custo negativo.</div>
        <div class="toolbar">
          <button class="btn primary" type="button" data-nfe-action="apply-all">Aplicar entrada completa da nota</button>
          <button class="btn red" type="button" data-nfe-action="clear-note">Limpar nota</button>
        </div>
      </div>
    `;

    const duplicateCount = model.items.filter(item => item.duplicate || alreadyApplied(item)).length;
    const matchedCount = model.items.filter(item => selectedProduct(item)).length;
    summary.innerHTML = `
      <div class="nfe-summary">
        <div><span>NF-e</span><b>${safe(model.note.number || '—')}</b><small>Série ${safe(model.note.series || '—')}</small></div>
        <div><span>Fornecedor</span><b>${safe(model.note.supplier || '—')}</b><small>${safe(model.note.supplierCnpj || '')}</small></div>
        <div><span>Valor da nota</span><b>${money(model.note.total)}</b><small>Desconto ${money(model.note.discount)}</small></div>
        <div><span>Produtos</span><b>${model.items.length}</b><small>${matchedCount} encontrados · ${duplicateCount} já aplicados</small></div>
      </div>
    `;
    list.innerHTML = model.items.map(itemCard).join('');
  }

  async function searchFirebase(item) {
    const query = String(item.search || '').trim();
    if (!query) throw new Error('Digite nome, código ou EAN para pesquisar.');

    item.searched = true;
    item.searchResults = [];
    const local = state.produtos.filter(product => productMatches(product, query));

    try {
      const base = String(state.settings.firebaseUrl || '').replace(/\/$/, '');
      const node = String(state.settings.produtosNode || 'produtos').replace(/^\/|\/$/g, '');
      if (!base) throw new Error('Firebase não configurado no admin.');
      const response = await fetch(`${base}/${node}.json`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Firebase retornou ${response.status}`);
      const data = await response.json();
      const remote = Object.entries(data || {})
        .filter(([, product]) => product && typeof product === 'object')
        .map(([key, product]) => ({
          ...product,
          firebaseKey: product.firebaseKey || key,
          id: product.id || key,
          codigo: product.codigo || product.sku || key
        }));

      remote.forEach(product => {
        const current = state.produtos.find(row => getKey(row) === getKey(product));
        if (current) Object.assign(current, product);
        else state.produtos.push(product);
      });
      item.searchResults = remote.filter(product => productMatches(product, query)).slice(0, 15);
      if (!item.searchResults.length) item.searchResults = local.slice(0, 15);
    } catch (error) {
      item.searchResults = local.slice(0, 15);
      if (!item.searchResults.length) throw error;
    }
  }

  function buildPatch(item, product, onlyStock) {
    if (onlyStock) return {};
    const patch = {};

    if (!product) {
      patch.firebaseKey = item.key;
      patch.id = item.key;
      patch.codigo = item.ean || item.supplierCodes[0] || `NFE${String(Date.now()).slice(-8)}`;
      patch.nome = String(item.name || '').trim();
      patch.gtin = digits(item.ean);
      patch.ncm = digits(item.ncm);
      patch.embalagem = String(item.packaging || '').trim() || 'UN';
      patch.preco_custo = round(item.unitCost);
      patch.preco = round(item.salePrice);
      patch.estoque = 0;
      patch.situacao = 'I';
      patch.categoria = 'A CLASSIFICAR';
      patch.subcategoria = '';
      patch.subsubcategoria = '';
      patch.marca = '';
      patch.fornecedor = model.note?.supplier || '';
      patch.descricao = '';
      if (item.photo) patch.url_imagem = item.photo;
      return patch;
    }

    const map = {
      name: 'nome',
      gtin: 'gtin',
      ncm: 'ncm',
      packaging: 'embalagem',
      cost: 'preco_custo',
      price: 'preco'
    };
    Object.entries(map).forEach(([field, target]) => {
      if (item.choices[field] === 'nfe') patch[target] = importedValue(item, field);
    });
    if (item.ean && norm(item.ean) !== norm(product.gtin || product.ean)) {
      patch.ean_aliases = [...new Set([
        ...(Array.isArray(product.ean_aliases) ? product.ean_aliases : []),
        item.ean
      ].filter(Boolean))];
    }
    return patch;
  }

  function makeNewKey(item) {
    const preferred = digits(item.ean);
    if (preferred && !productByKey(preferred)) return preferred;
    return `produto_nfe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  async function applyItem(item, { onlyStock = false, create = false, deferRender = false } = {}) {
    if (!item || item.skipped || item.done) return { skipped: true };
    if (typeof syncNfeProductToFirebase !== 'function') throw new Error('A rotina segura de salvamento da NF-e não foi carregada.');

    let product = selectedProduct(item);
    if (!product && !create) throw new Error(`${item.name}: selecione um produto ou use “Criar produto”.`);
    if (product && alreadyApplied(item, product)) {
      item.duplicate = true;
      throw new Error(`${item.name}: esta NF-e já foi aplicada e não pode somar o estoque novamente.`);
    }

    item.multiplier = Math.max(1, Math.floor(number(item.multiplier) || 1));
    recalculateItem(item, true);

    const stockDelta = item.addStock ? round(item.incomingUnits) : 0;
    if (stockDelta > 0 && !item.noExpiry) {
      if (!item.validity) throw new Error(`${item.name}: informe a validade do lote ou marque “Produto sem validade”.`);
      if (!validDate(item.validity)) throw new Error(`${item.name}: a validade deve estar no formato dia/mês/ano.`);
    }

    if (!product) {
      item.key = makeNewKey(item);
      if (!String(item.name || '').trim()) throw new Error('O produto novo precisa ter nome.');
      if (!String(item.packaging || '').trim()) throw new Error(`${item.name}: informe a embalagem.`);
    } else {
      item.key = getKey(product);
    }

    const patch = buildPatch(item, product, onlyStock);
    const entryId = noteEntryId(item);
    const entry = {
      id: entryId,
      chave_nfe: model.note?.key || '',
      numero_nfe: model.note?.number || '',
      serie_nfe: model.note?.series || '',
      fornecedor: model.note?.supplier || '',
      fornecedor_documento: model.note?.supplierCnpj || '',
      emitida_em: model.note?.issuedAt || '',
      recebida_em: nowIso(),
      codigo_fornecedor: item.supplierCodes.join(','),
      ean: item.ean || '',
      nome_xml: item.name,
      linhas_xml: item.lines,
      quantidade_comercial: round(item.commercialQuantity),
      multiplicador: item.multiplier,
      quantidade_estoque: stockDelta,
      valor_bruto: round(item.gross),
      desconto_rateado: round(item.discount),
      valor_liquido: round(item.net),
      custo_unitario: round(item.unitCost),
      validade: item.noExpiry ? '' : item.validity,
      modo_validade: item.validityMode,
      sem_validade: item.noExpiry,
      atualizou_cadastro: !onlyStock
    };

    const lot = stockDelta > 0 ? {
      id: entryId,
      chave_nfe: model.note?.key || '',
      numero_nfe: model.note?.number || '',
      fornecedor: model.note?.supplier || '',
      validade: item.noExpiry ? '' : item.validity,
      sem_validade: item.noExpiry,
      quantidade_entrada: stockDelta,
      quantidade_restante: stockDelta,
      custo_unitario: round(item.unitCost),
      recebido_em: nowIso()
    } : null;

    const result = await syncNfeProductToFirebase({
      key: item.key,
      patch,
      stockDelta,
      entry,
      lot,
      validity: item.noExpiry ? '' : item.validity,
      validityMode: item.validityMode
    });

    if (result?.duplicate) {
      item.duplicate = true;
      throw new Error(`${item.name}: esta entrada já estava registrada no Firebase.`);
    }

    item.key = result?.key || item.key;
    item.done = true;
    item.duplicate = false;
    model.message = `${item.name}: entrada aplicada com sucesso no Firebase.`;
    model.messageType = 'green';
    saveLocal();
    if (!deferRender) {
      renderProducts();
      renderSummary();
      render();
    }
    return result;
  }

  async function applyAll(button) {
    const pending = model.items.filter(item => !item.skipped && !item.done && !item.duplicate);
    if (!pending.length) throw new Error('Não há itens pendentes para aplicar.');

    const failures = [];
    let completed = 0;

    for (const item of pending) {
      button.textContent = `Aplicando ${completed + 1}/${pending.length}...`;
      try {
        await applyItem(item, { onlyStock: false, create: !selectedProduct(item), deferRender: true });
        completed++;
      } catch (error) {
        failures.push(`${item.name}: ${error.message}`);
      }
      await sleep(120);
    }

    model.message = failures.length
      ? `${completed} item(ns) aplicado(s). ${failures.length} falharam: ${failures.slice(0, 3).join(' | ')}`
      : `${completed} produto(s) da NF-e foram cadastrados/atualizados com sucesso.`;
    model.messageType = failures.length ? 'red' : 'green';
    saveLocal();
    renderProducts();
    renderSummary();
    render();
  }

  function clearNote() {
    model.items = [];
    model.note = null;
    model.message = 'Nota limpa. Selecione outro XML para começar.';
    model.messageType = 'gold';
    model.scannedKey = '';
    const keyInput = $('nfeAccessKey');
    const paste = $('nfePaste');
    const file = $('nfeFile');
    if (keyInput) keyInput.value = '';
    if (paste) paste.value = '';
    if (file) file.value = '';
    render();
  }

  function itemFromElement(element) {
    return itemById(element.closest?.('[data-item-id]')?.dataset.itemId);
  }

  function updateDateTarget(target, rawDigits) {
    const raw = digits(rawDigits).slice(0, 8);
    const masked = raw.length ? dateMaskFromDigits(raw) : '';
    target.value = masked;

    if (target.id === 'nfeGlobalValidity') {
      model.globalValidity = dateValueFromMask(masked);
    } else {
      const item = itemFromElement(target);
      if (item) item.validity = dateValueFromMask(masked);
    }
    requestAnimationFrame(() => selectNextDateDigit(target));
  }

  document.addEventListener('keydown', event => {
    const target = event.target;
    if (target.id !== 'nfeGlobalValidity' && target.dataset.nfeField !== 'validity') return;
    if (target.disabled || event.ctrlKey || event.metaKey || event.altKey) return;

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const current = digits(target.value).slice(0, 8);
      const allSelected = target.selectionStart === 0 && target.selectionEnd === target.value.length;
      const base = allSelected || current.length >= 8 ? '' : current;
      updateDateTarget(target, `${base}${event.key}`);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      const current = digits(target.value).slice(0, 8);
      updateDateTarget(target, current.slice(0, -1));
    }
  });

  document.addEventListener('input', event => {
    const target = event.target;
    if (target.id === 'nfeAccessKey') {
      target.value = digits(target.value).slice(0, 44);
      return;
    }
    if (target.id === 'nfeGlobalValidity') {
      updateDateTarget(target, target.value);
      return;
    }
    if (target.id === 'nfeMargin') {
      model.margin = Math.min(95, Math.max(0, number(target.value)));
      return;
    }

    const item = itemFromElement(target);
    if (!item) return;

    if (target.hasAttribute('data-nfe-search')) {
      item.search = target.value;
      item.searched = false;
      return;
    }

    const field = target.dataset.nfeField;
    if (!field) return;
    if (field === 'validity') {
      updateDateTarget(target, target.value);
      return;
    }
    if (field === 'name' || field === 'ean' || field === 'ncm' || field === 'packaging') {
      item[field] = target.value;
      return;
    }
    if (field === 'unitCost') {
      item.unitCost = round(target.value);
      return;
    }
    if (field === 'salePrice') {
      item.salePrice = round(target.value);
      item.manualSale = true;
    }
  });

  document.addEventListener('focusin', event => {
    const target = event.target;
    if (target.id !== 'nfeGlobalValidity' && target.dataset.nfeField !== 'validity') return;
    requestAnimationFrame(() => {
      if (digits(target.value).length) target.select();
      else selectNextDateDigit(target);
    });
  });

  document.addEventListener('change', event => {
    const target = event.target;

    if (target.id === 'nfeFile') {
      const file = target.files?.[0];
      if (!file) return;
      file.text()
        .then(parseXml)
        .catch(error => {
          model.message = error.message;
          model.messageType = 'red';
          render();
        });
      return;
    }

    const item = itemFromElement(target);
    if (!item) return;

    if (target.dataset.nfeChoice) {
      item.choices[target.dataset.nfeChoice] = target.value;
      render();
      return;
    }

    const field = target.dataset.nfeField;
    if (!field) return;

    if (field === 'multiplier') {
      item.multiplier = Math.max(1, Math.floor(number(target.value) || 1));
      item.multiplierSource = 'Ajustado manualmente';
      recalculateItem(item);
      render();
    } else if (field === 'validityMode') {
      item.validityMode = target.value;
      render();
    } else if (field === 'addStock' || field === 'skipped' || field === 'noExpiry') {
      item[field] = target.checked;
      if (field === 'noExpiry' && target.checked) item.validity = '';
      render();
    }
  });

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-nfe-action]');
    if (!button) return;
    const action = button.dataset.nfeAction;
    const item = itemFromElement(button);

    if (action === 'read-key') {
      const key = digits($('nfeAccessKey')?.value);
      if (key.length !== 44) {
        model.message = 'A chave da NF-e precisa ter exatamente 44 números.';
        model.messageType = 'red';
      } else {
        model.scannedKey = key;
        model.message = 'Chave confirmada. Agora selecione o XML salvo da mesma nota.';
        model.messageType = 'green';
      }
      render();
      return;
    }

    if (action === 'read-pasted') {
      try {
        parseXml($('nfePaste')?.value || '');
      } catch (error) {
        model.message = error.message;
        model.messageType = 'red';
        render();
      }
      return;
    }

    if (action === 'apply-validity-all') {
      const value = dateValueFromMask($('nfeGlobalValidity')?.value || model.globalValidity);
      if (!validDate(value)) {
        model.message = 'Informe uma validade válida no formato dia/mês/ano.';
        model.messageType = 'red';
        render();
        return;
      }
      model.globalValidity = value;
      model.items.forEach(row => {
        row.validity = value;
        row.noExpiry = false;
      });
      model.message = `Validade ${value} aplicada a todos os produtos da nota.`;
      model.messageType = 'green';
      render();
      return;
    }

    if (action === 'clear-note') {
      clearNote();
      return;
    }

    if (action === 'select-match' && item) {
      item.key = button.dataset.key;
      item.searchResults = [];
      item.searched = false;
      item.duplicate = alreadyApplied(item);
      const product = selectedProduct(item);
      if (product) {
        item.choices.ncm = product.ncm ? 'old' : 'nfe';
        item.choices.packaging = product.embalagem ? 'old' : 'nfe';
        item.choices.gtin = (product.gtin || product.ean) ? 'old' : 'nfe';
      }
      render();
      return;
    }

    if (action === 'find-product' && item) {
      const input = button.closest('.nfe-manual-search')?.querySelector('[data-nfe-search]');
      item.search = String(input?.value || item.search || '').trim();
      runUiAction(button, 'Buscando no Firebase...', async () => {
        await searchFirebase(item);
        model.message = item.searchResults.length
          ? `${item.searchResults.length} produto(s) encontrado(s).`
          : 'Nenhum produto encontrado.';
        model.messageType = item.searchResults.length ? 'green' : 'red';
        render();
      }).catch(error => {
        model.message = `Falha na busca: ${error.message}`;
        model.messageType = 'red';
        toast(model.message, 'err');
        render();
      });
      return;
    }

    if (action === 'save-stock' && item) {
      runUiAction(button, 'Atualizando estoque e lote...', () => applyItem(item, { onlyStock: true }))
        .catch(error => {
          model.message = error.message;
          model.messageType = 'red';
          toast(error.message, 'err');
          render();
        });
      return;
    }

    if (action === 'save-full' && item) {
      runUiAction(button, 'Atualizando cadastro e estoque...', () => applyItem(item, { onlyStock: false }))
        .catch(error => {
          model.message = error.message;
          model.messageType = 'red';
          toast(error.message, 'err');
          render();
        });
      return;
    }

    if (action === 'create-product' && item) {
      runUiAction(button, 'Criando produto e aplicando entrada...', () => applyItem(item, { create: true }))
        .catch(error => {
          model.message = error.message;
          model.messageType = 'red';
          toast(error.message, 'err');
          render();
        });
      return;
    }

    if (action === 'apply-all') {
      runUiAction(button, 'Aplicando entrada...', () => applyAll(button))
        .catch(error => {
          model.message = error.message;
          model.messageType = 'red';
          toast(error.message, 'err');
          render();
        });
      return;
    }


  });

  const style = document.createElement('style');
  style.textContent = `
    .nfe-import-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .nfe-inline{display:flex;align-items:center;gap:8px}
    .nfe-inline .input{flex:1}
    .nfe-list{display:grid;gap:14px;margin-top:14px}
    .nfe-card{padding:16px;border-left:5px solid var(--gold)}
    .nfe-card.matched{border-left-color:var(--green)}
    .nfe-card.duplicate{border-left-color:var(--red);opacity:.82}
    .nfe-card.done{border-left-color:var(--green);background:#fbfffc}
    .nfe-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    .nfe-card-head h3{margin:7px 0 4px;font-size:16px}
    .nfe-card-head small,.nfe-current small{display:block;color:var(--muted);font-size:11px}
    .nfe-current{text-align:right;max-width:40%}
    .nfe-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin:13px 0}
    .nfe-metrics span{padding:8px;border:1px solid var(--line);border-radius:10px;background:#fafafa;font-size:10px}
    .nfe-metrics b{display:block;margin-top:3px;font-size:12px}
    .nfe-entry-settings{display:grid;grid-template-columns:1fr 1fr 1.2fr auto auto auto;gap:10px;align-items:end;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fffdf7}
    .nfe-entry-settings .checkline{padding-bottom:9px}
    .nfe-table{width:100%;margin-top:12px;border-collapse:collapse;font-size:11px}
    .nfe-table th,.nfe-table td{padding:8px;border:1px solid var(--line);text-align:left;vertical-align:top}
    .nfe-table th{background:#fafafa}
    .nfe-table label{display:flex;gap:5px;align-items:flex-start}
    .nfe-photo{display:flex;gap:12px;align-items:flex-start;margin-top:12px;padding:10px;border:1px solid var(--line);border-radius:12px}
    .nfe-photo img{width:86px;height:86px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:10px}
    .nfe-photo>div{flex:1}
    .nfe-photo label{font-size:11px;font-weight:800}
    .nfe-new-product{display:grid;gap:10px;margin-top:12px}
    .nfe-edit-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    .nfe-edit-grid label{font-size:11px;font-weight:800}
    .nfe-manual-search{display:grid;grid-template-columns:1fr auto;gap:8px}
    .nfe-search-results{display:flex;flex-wrap:wrap;gap:7px}
    .nfe-search-results .btn{display:flex;flex-direction:column;align-items:flex-start}
    .nfe-search-results small{font-size:9px}
    .nfe-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:13px 0}
    .nfe-summary>div{padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}
    .nfe-summary span,.nfe-summary small,.nfe-summary b{display:block}
    .nfe-summary span,.nfe-summary small{font-size:10px;color:var(--muted)}
    .nfe-summary b{font-size:14px;margin:4px 0}
    .nfe-global-controls{display:grid;grid-template-columns:1fr .55fr 1.3fr auto;gap:12px;align-items:end;margin-top:13px}
    .nfe-actions{margin-top:12px}
    @media(max-width:1150px){
      .nfe-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
      .nfe-entry-settings{grid-template-columns:1fr 1fr}
      .nfe-global-controls{grid-template-columns:1fr 1fr}
    }
    @media(max-width:720px){
      .nfe-import-grid,.nfe-edit-grid,.nfe-summary,.nfe-global-controls{grid-template-columns:1fr}
      .nfe-card-head,.nfe-photo,.nfe-inline{flex-direction:column;align-items:stretch}
      .nfe-current{text-align:left;max-width:none}
      .nfe-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      .nfe-entry-settings{grid-template-columns:1fr}
      .nfe-manual-search{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);

  ensureUi();
  render();
})();
