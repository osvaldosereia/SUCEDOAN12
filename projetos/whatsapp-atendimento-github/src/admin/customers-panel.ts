import type { CustomerListItem, CustomerRecord } from "../domain/customers";

export interface CustomersPanelModel {
  customers: CustomerListItem[];
  loaded: boolean;
  busy: boolean;
  query: string;
  editor: CustomerRecord | null;
  authorized: boolean;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function renderCustomerAddressEditor(address: CustomerRecord["addresses"][number], index: number): string {
  return `<fieldset class="customer-address" data-index="${index}">
    <legend>Endereço ${index + 1}</legend>
    ${address.id ? `<input type="hidden" name="address_id_${index}" value="${escapeHtml(address.id)}">` : ""}
    <div class="form-grid"><label>Identificação<input name="address_label_${index}" maxlength="80" value="${escapeHtml(address.label ?? "")}" placeholder="Casa, trabalho..."></label><label>CEP<input name="address_postal_${index}" inputmode="numeric" maxlength="9" value="${escapeHtml(address.postalCode)}" required></label></div>
    <div class="form-grid"><label>Rua / avenida<input name="address_street_${index}" maxlength="180" value="${escapeHtml(address.street)}" required></label><label>Número<input name="address_number_${index}" maxlength="40" value="${escapeHtml(address.number)}" required></label></div>
    <div class="form-grid"><label>Complemento<input name="address_complement_${index}" maxlength="120" value="${escapeHtml(address.complement ?? "")}"></label><label>Bairro<input name="address_neighborhood_${index}" maxlength="120" value="${escapeHtml(address.neighborhood)}" required></label></div>
    <div class="form-grid"><label>Cidade<input name="address_city_${index}" maxlength="120" value="${escapeHtml(address.city)}" required></label><label>UF<input name="address_state_${index}" maxlength="2" value="${escapeHtml(address.state)}" required></label></div>
    <label>Referência<input name="address_reference_${index}" maxlength="240" value="${escapeHtml(address.reference ?? "")}"></label>
    <div class="customer-address-actions"><label class="checkbox-label"><input type="checkbox" name="address_default_${index}" ${address.isDefault ? "checked" : ""}> Endereço principal</label><label class="checkbox-label"><input type="checkbox" name="address_active_${index}" ${address.isActive ? "checked" : ""}> Ativo para entrega</label><button type="button" class="text-button danger-text" data-action="customer-remove-address">Remover da lista</button></div>
  </fieldset>`;
}

export function renderCustomersPanel(model: CustomersPanelModel): string {
  if (!model.authorized) return `<section class="workspace-heading"><div><span class="eyebrow">Cadastro privado · Supabase</span><h1>Clientes</h1><p>Os dados pessoais ficam no banco privado e exigem acesso GitHub autorizado.</p></div></section><div class="empty-state"><strong>Acesso administrativo necessário</strong><span>Entre com a conta autorizada para pesquisar e manter clientes.</span></div>`;
  if (model.editor) {
    const customer = model.editor;
    return `<section class="workspace-heading"><div><span class="eyebrow">${customer.id ? "Editar registro privado" : "Novo registro privado"}</span><h1>${customer.id ? "Editar cliente" : "Cadastrar cliente"}</h1><p>Cliente e endereços são gravados no Supabase; nenhum dado pessoal vai para o GitHub.</p></div></section>
      <form id="customer-form" class="customer-editor-card" data-id="${escapeHtml(customer.id ?? "")}">
        <section><div class="section-title"><div><span class="eyebrow">Identificação</span><h2>Dados do cliente</h2></div></div>
          <div class="form-grid"><label>Nome completo<input name="customer_name" maxlength="160" value="${escapeHtml(customer.name)}" required></label><label>CPF / CNPJ<input name="customer_document" inputmode="numeric" maxlength="18" value="${escapeHtml(customer.cpfCnpj ?? "")}"></label></div>
          <div class="form-grid"><label>WhatsApp principal<input name="customer_phone" inputmode="tel" maxlength="20" value="${escapeHtml(customer.phoneE164)}" required><small>Use DDD; o servidor normaliza para E.164.</small></label><label>Preferência de resposta<select name="customer_preferred_reply"><option value="auto" ${customer.preferredReply === "auto" ? "selected" : ""}>Automático</option><option value="text" ${customer.preferredReply === "text" ? "selected" : ""}>Texto</option><option value="audio" ${customer.preferredReply === "audio" ? "selected" : ""}>Áudio</option></select></label></div>
          <label class="checkbox-label"><input type="checkbox" name="customer_active" ${customer.isActive ? "checked" : ""}> Cadastro ativo</label>
        </section>
        <section><div class="section-title"><div><span class="eyebrow">Entrega</span><h2>Endereços</h2></div><button type="button" class="button button-soft" data-action="customer-add-address">＋ Adicionar endereço</button></div>
          <div id="customer-address-list">${customer.addresses.map(renderCustomerAddressEditor).join("")}</div><p class="flow-muted">Omitir endereço existente da lista o desativa; o histórico fica preservado.</p>
        </section>
        <div class="modal-actions"><button type="button" class="button button-soft" data-action="customer-cancel-edit">Cancelar</button><button class="button button-primary" type="submit" ${model.busy ? "disabled" : ""}>Salvar cliente</button></div>
      </form>`;
  }
  return `<section class="workspace-heading"><div><span class="eyebrow">Cadastro privado · Supabase</span><h1>Clientes</h1><p>Pesquise, crie e edite clientes e seus endereços de entrega.</p></div><button class="button button-primary" data-action="customer-new">＋ Novo cliente</button></section>
    <form id="customer-search-form" class="toolbar"><label class="search-field"><span>⌕</span><input name="query" type="search" value="${escapeHtml(model.query)}" placeholder="Nome, telefone ou CPF/CNPJ"></label><button class="button button-soft" type="submit" ${model.busy ? "disabled" : ""}>Buscar</button><span class="subtle">${model.loaded ? `${model.customers.length} resultado(s)` : "A busca consulta o cadastro privado"}</span></form>
    ${!model.loaded ? `<div class="empty-state"><strong>Pesquise o cadastro protegido</strong><span>Os resultados só aparecem após autenticação e consulta pelo servidor.</span></div>` : model.customers.length ? `<div class="customer-list">${model.customers.map((customer) => `<article class="customer-list-row"><div><strong>${escapeHtml(customer.name || "Sem nome")}</strong><span>${escapeHtml(customer.phoneE164 || "Sem WhatsApp")}${customer.cpfCnpj ? ` · ${escapeHtml(customer.cpfCnpj)}` : ""}</span></div><span class="status-pill ${customer.isActive ? "is-active" : "is-inactive"}">${customer.isActive ? "Ativo" : "Inativo"}</span><button class="button button-soft" data-action="customer-edit" data-id="${escapeHtml(customer.id)}">Abrir cadastro</button></article>`).join("")}</div>` : `<div class="empty-state"><strong>Nenhum cliente encontrado</strong><span>Altere a busca ou crie um novo cadastro.</span></div>`}`;
}
