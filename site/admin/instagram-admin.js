(() => {
  "use strict";
  const root = document.getElementById("instagram-admin-root");
  if (!root) return;
  const state = { data: null, editing: null, loading: false, busy: false, error: "", message: "", creativeForm: { phrase:"", theme:"", extra_info:"" } };
  const days = [[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"],[7,"Dom"]];
  const labels = { story:"Stories", feed:"Feed", carousel:"Carrossel", active:"Ativa", paused:"Pausada", archived:"Arquivada", queued:"Na fila", running:"Processando", pending:"Aguardando", assets_ready:"Preparada", container_created:"Preparando mídia", publishing:"Publicando", published:"Publicada", failed:"Falhou", needs_review:"Verificar no Instagram", skipped:"Ignorada", asset_ready:"Imagem pronta", generating:"Gerando", ready:"Pronta para aprovar", publishing:"Enviando" };
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
  const dateTime = (value) => {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short", timeZone:"America/Cuiaba" }).format(new Date(value)); } catch { return esc(value); }
  };
  const formatDays = (value) => (Array.isArray(value) ? value : []).map((day) => days.find((entry) => entry[0] === Number(day))?.[1]).filter(Boolean).join(", ");
  async function request(action, payload = {}) {
    const config = window.DONA_SITE_CONFIG || {};
    const url = String(config.supabaseUrl || "").replace(/\/$/, "");
    const code = typeof window.DonaAdminAuth?.getCode === "function" ? window.DonaAdminAuth.getCode() : "";
    if (!url || !config.publishableKey || !code) throw new Error("Entre novamente no admin para gerenciar as automações.");
    const response = await fetch(url + "/functions/v1/instagram-automation-manager-v1", {
      method:"POST", cache:"no-store",
      headers:{ "Content-Type":"application/json", apikey:config.publishableKey, "x-admin-code":code },
      body:JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente no admin.");
      throw new Error(result.message || result.error || "Não foi possível concluir a solicitação.");
    }
    return result;
  }

  async function requestDownload(id) {
    const config = window.DONA_SITE_CONFIG || {};
    const url = String(config.supabaseUrl || "").replace(/\/$/, "");
    const code = typeof window.DonaAdminAuth?.getCode === "function" ? window.DonaAdminAuth.getCode() : "";
    if (!url || !config.publishableKey || !code) throw new Error("Entre novamente no admin para baixar a arte.");
    const response = await fetch(url + "/functions/v1/instagram-automation-manager-v1", {
      method:"POST", cache:"no-store",
      headers:{ "Content-Type":"application/json", apikey:config.publishableKey, "x-admin-code":code },
      body:JSON.stringify({ action:"download_story", id })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || result.error || "Não foi possível baixar a arte.");
    }
    return await response.blob();
  }

  function badge(value) {
    const key = String(value || "");
    return '<span class="ig-status ig-status-' + esc(key) + '">' + esc(labels[key] || key || "—") + '</span>';
  }
  function accountMarkup(account, offerCount) {
    const connected = account?.connected;
    const quota = account?.quota;
    return '<section class="ig-account-card">'
      + '<div><p class="ig-eyebrow">CONTA E PUBLICAÇÃO</p><h3>' + (connected ? 'Instagram conectado' : 'Conexão pendente') + '</h3>'
      + '<p>' + (connected ? (account.username ? '@' + esc(account.username) + ' · ' : '') + 'Cota Meta: ' + esc(quota?.usage ?? "—") + ' de ' + esc(quota?.total ?? "—") : esc(account?.error || "A conta precisa ser verificada.")) + '</p>'
      + '<small>' + esc(offerCount || 0) + ' ofertas disponíveis · Horário de Cuiabá</small></div>'
      + '<button class="button button-outline" type="button" data-action="refresh">Atualizar</button></section>';
  }
  function automationCard(item) {
    const id = esc(item.id);
    const schedule = formatDays(item.schedule_days) + " · " + (Array.isArray(item.schedule_times) ? item.schedule_times.join(", ") : "");
    const amount = item.content_format === "story" ? "48 produtos · 8 Stories" : item.content_format === "feed" ? "1 produto · imagem única" : esc(item.products_per_post) + " produtos · carrossel";
    return '<article class="ig-automation-card">'
      + '<div class="ig-automation-main"><div class="ig-card-title"><h3>' + esc(item.name) + '</h3>' + badge(item.status) + '</div>'
      + '<p>' + esc(labels[item.content_format] || item.content_format) + ' · ' + amount + '</p><p class="ig-muted">' + esc(schedule) + '</p>'
      + (item.caption_template ? '<p class="ig-caption-preview">' + esc(item.caption_template) + '</p>' : '') + '</div>'
      + '<div class="ig-card-actions">'
      + '<button class="button button-outline" type="button" data-action="edit" data-id="' + id + '">Editar</button>'
      + '<button class="button button-outline" type="button" data-action="run" data-id="' + id + '">' + (item.content_format === "story" ? "Enfileirar 8 Stories" : "Enviar à fila") + '</button>'
      + '<button class="button button-outline" type="button" data-action="toggle" data-active="' + (item.status !== "active") + '" data-id="' + id + '">' + (item.status === "active" ? "Pausar" : "Ativar") + '</button>'
      + '<button class="button button-quiet" type="button" data-action="archive" data-id="' + id + '">Arquivar</button></div></article>';
  }
  function formMarkup() {
    const item = state.editing || {};
    const checkedDays = Array.isArray(item.schedule_days) ? item.schedule_days.map(Number) : [1,2,3,4,5,6];
    const fmt = item.content_format || "feed";
    const controls = days.map(([value,label]) => '<label class="ig-day"><input type="checkbox" name="schedule_days" value="' + value + '"' + (checkedDays.includes(value) ? " checked" : "") + '><span>' + label + '</span></label>').join("");
    return '<form id="instagram-automation-form" class="ig-form">'
      + '<div class="ig-form-heading"><div><h3>' + (item.id ? "Editar automação" : "Nova automação") + '</h3><p>A origem atual são as ofertas do dia.</p></div><button type="button" class="button button-outline" data-action="cancel">Fechar</button></div>'
      + '<input type="hidden" name="id" value="' + esc(item.id || "") + '">'
      + '<div class="ig-form-grid"><label>Nome da automação<input name="name" maxlength="80" required value="' + esc(item.name || "") + '" placeholder="Ex.: Ofertas no Feed"></label>'
      + '<label>Formato<select name="content_format"><option value="story"' + (fmt==="story"?" selected":"") + '>Stories das ofertas</option><option value="feed"' + (fmt==="feed"?" selected":"") + '>Post único no Feed</option><option value="carousel"' + (fmt==="carousel"?" selected":"") + '>Carrossel no Feed</option></select></label>'
      + '<label class="ig-carousel-count">Produtos por carrossel<select name="products_per_post">' + [2,3,4,5,6,7,8,9,10].map((n) => '<option value="' + n + '"' + (Number(item.products_per_post || 5)===n?" selected":"") + '>' + n + ' imagens</option>').join("") + '</select></label>'
      + '<label>Horários, separados por vírgula<input name="schedule_times" required value="' + esc((item.schedule_times || ["07:05"]).join(", ")) + '" placeholder="07:05, 12:00"><small>Em intervalos de 5 minutos, no fuso de Cuiabá.</small></label>'
      + '<fieldset class="ig-days"><legend>Dias de publicação</legend><div>' + controls + '</div></fieldset>'
      + '<label class="ig-caption">Legenda do Feed (opcional)<textarea name="caption_template" rows="3" maxlength="2200" placeholder="Legenda para post único ou carrossel">' + esc(item.caption_template || "") + '</textarea></label>'
      + '<label class="ig-active"><input name="active" type="checkbox"' + (item.status === "paused" ? "" : " checked") + '> Automação ativa</label></div>'
      + '<p class="ig-form-note">Stories usa as 8 imagens diárias já geradas. Feed e carrossel são montados com produtos e fotos existentes, sem geração paga por IA. Carrosséis aceitam até 10 imagens.</p>'
      + '<div class="ig-form-actions"><button type="submit" class="button button-primary">Salvar automação</button></div></form>';
  }
  function jobMarkup(job) {
    const items = Array.isArray(job.items) ? job.items : [];
    const itemList = items.length ? '<ol class="ig-job-items">' + items.map((item) => '<li>' + esc(item.item_number) + '. ' + esc(item.product_name || "Produto") + ' ' + badge(item.status) + (item.last_error ? '<small>' + esc(item.last_error) + '</small>' : '') + '</li>').join("") + '</ol>' : "";
    const events = Array.isArray(job.events) ? job.events : [];
    const eventList = events.length ? '<ol class="ig-events">' + events.map((event) => '<li><time>' + dateTime(event.created_at) + '</time><span>' + esc(String(event.event_type || "").replace(/_/g, " ")) + '</span><p>' + esc(event.message) + '</p></li>').join("") + '</ol>' : "";
    const retry = job.status === "failed" ? '<button class="button button-outline" type="button" data-action="retry" data-id="' + esc(job.id) + '">Tentar novamente</button>' : "";
    return '<details class="ig-job"><summary><span>' + esc(job.automation_name) + ' · ' + esc(labels[job.content_format] || job.content_format) + '</span><span>' + dateTime(job.scheduled_for) + '</span>' + badge(job.status) + '</summary>'
      + '<div class="ig-job-content"><p>' + (job.published_at ? 'Publicado em ' + dateTime(job.published_at) : 'Criado em ' + dateTime(job.created_at)) + (job.run_kind === "manual" ? ' · Execução manual' : '') + '</p>'
      + (job.last_error ? '<p class="ig-error">' + esc(job.last_error) + '</p>' : '') + itemList + (eventList ? '<h4>Etapas registradas</h4>' + eventList : '') + retry + '</div></details>';
  }
  function storyHistoryMarkup(rows) {
    const list = (rows || []).slice(0, 30);
    if (!list.length) return '<p class="ig-empty">Ainda não há registros do publicador de Stories.</p>';
    return '<div class="ig-story-history">' + list.map((row) => '<div><strong>' + esc(row.offer_date) + ' · imagem ' + esc(row.image_number) + '</strong>' + badge(row.status) + '<small>' + (row.published_at ? 'Publicado ' + dateTime(row.published_at) : esc(row.last_error || row.updated_at || "")) + '</small></div>').join("") + '</div>';
  }

  function storyCreativeCard(item) {
    const disabled = state.busy ? " disabled" : "";
    const preview = item.preview_url
      ? '<img src="' + esc(item.preview_url) + '" alt="Prévia do Story: ' + esc(item.phrase) + '" loading="lazy">'
      : '<div class="ig-creative-placeholder">' + esc(labels[item.status] || item.status) + '</div>';
    const size = Number(item.image_size_bytes || 0);
    const cost = Number(item.estimated_cost_usd || 0.005).toFixed(3).replace(".", ",");
    const publish = item.status === "ready"
      ? '<button class="button button-primary" type="button" data-action="publish" data-id="' + esc(item.id) + '"' + disabled + '>Aprovar e publicar no Stories</button>'
      : "";
    const download = item.preview_url
      ? '<button class="button button-outline" type="button" data-action="download" data-id="' + esc(item.id) + '"' + disabled + '>Baixar JPG</button>'
      : "";
    return '<article class="ig-creative-card">' + preview
      + '<div class="ig-creative-details"><div class="ig-card-title"><h3>' + esc(item.theme) + '</h3>' + badge(item.status) + '</div>'
      + '<p class="ig-creative-phrase">“' + esc(item.phrase) + '”</p>'
      + (item.extra_info ? '<p class="ig-muted">' + esc(item.extra_info) + '</p>' : '')
      + '<small>' + dateTime(item.created_at) + ' · ' + esc(item.model) + ' / low'
      + (size ? ' · ' + Math.ceil(size / 1024) + ' KB' : '')
      + ' · estimativa US$ ' + cost + '</small>'
      + (item.last_error ? '<p class="ig-error">' + esc(item.last_error) + '</p>' : '')
      + '<div class="ig-creative-actions">' + download + publish + '</div></div></article>';
  }
  function storyStudioMarkup(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const form = state.creativeForm || {};
    const disabled = state.busy ? " disabled" : "";
    return '<section class="ig-panel ig-story-studio"><div class="ig-section-heading"><div><h2>Criar e testar um Story</h2><p>Escreva a frase e o tema. Confira a prévia, baixe no celular ou aprove a publicação.</p></div></div>'
      + '<p class="ig-form-note">Cada clique gera uma imagem vertical com GPT-Image-2 em qualidade low. A logo e os textos são aplicados pela loja para ficarem legíveis. Referência de custo: cerca de US$ 0,005 por imagem vertical padrão; pode variar com as dimensões. A arte final é comprimida para até 100 KB.</p>'
      + '<form id="instagram-story-creative-form" class="ig-story-creative-form">'
      + '<label>Frase da arte<textarea name="phrase" rows="2" maxlength="112" required placeholder="Ex.: Cuidar da casa também é cuidar de quem você ama.">' + esc(form.phrase || "") + '</textarea><small>Até 112 caracteres.</small></label>'
      + '<label>Tema visual<input name="theme" maxlength="60" required value="' + esc(form.theme || "") + '" placeholder="Ex.: casa acolhedora, café da manhã, economia"></label>'
      + '<label>Informação adicional (opcional)<textarea name="extra_info" rows="2" maxlength="160" placeholder="Detalhe que deve aparecer na arte">' + esc(form.extra_info || "") + '</textarea><small>Até 160 caracteres.</small></label>'
      + '<button class="button button-primary" type="submit"' + disabled + '>Gerar prévia da arte</button></form>'
      + '<div class="ig-creative-history"><h3>Prévia e histórico de artes</h3>'
      + (list.length ? list.map(storyCreativeCard).join("") : '<p class="ig-empty">Nenhuma arte criada ainda. Gerar a prévia não publica no Instagram.</p>')
      + '</div></section>';
  }

  function render() {
    const data = state.data || {};
    const counts = data.counts || {};
    const automations = Array.isArray(data.automations) ? data.automations : [];
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    root.innerHTML = '<div class="ig-manager">'
      + (state.error ? '<p class="ig-error" role="alert">' + esc(state.error) + '</p>' : '')
      + (state.message ? '<p class="ig-success" role="status">' + esc(state.message) + '</p>' : '')
      + '<div class="ig-metrics"><div><strong>' + esc(counts.active || 0) + '</strong><span>Automações ativas</span></div><div><strong>' + esc(counts.pending || 0) + '</strong><span>Na fila</span></div><div><strong>' + esc(counts.published_7d || 0) + '</strong><span>Publicadas em 7 dias</span></div><div><strong>' + esc(counts.attention || 0) + '</strong><span>Precisam de atenção</span></div></div>'
      + accountMarkup(data.account, data.offer_count)
      + storyStudioMarkup(data.story_creatives)
      + '<section class="ig-panel"><div class="ig-section-heading"><div><h2>Automações</h2><p>Crie rotinas separadas para Stories, Feed ou carrossel.</p></div><button class="button button-primary" type="button" data-action="new">Nova automação</button></div>'
      + (automations.length ? automations.map(automationCard).join("") : '<p class="ig-empty">Nenhuma automação cadastrada.</p>')
      + (state.editing ? formMarkup() : '')
      + '</section>'
      + '<section class="ig-panel"><div class="ig-section-heading"><div><h2>Histórico de execuções</h2><p>Últimas 100 execuções; abra uma linha para ver produtos, erros e opção de nova tentativa.</p></div><button class="button button-outline" type="button" data-action="refresh">Atualizar</button></div>'
      + (jobs.length ? jobs.map(jobMarkup).join("") : '<p class="ig-empty">Ainda não há execuções registradas.</p>') + '</section>'
      + '<section class="ig-panel"><div class="ig-section-heading"><div><h2>Registro dos Stories</h2><p>Imagens publicadas nos últimos 30 dias.</p></div></div>' + storyHistoryMarkup(data.story_history) + '</section>'
      + '</div>';
    const form = root.querySelector("#instagram-automation-form");
    const format = form?.elements.content_format;
    const count = form?.querySelector(".ig-carousel-count");
    if (count) count.hidden = format.value !== "carousel";
    if (format) format.addEventListener("change", () => { if (count) count.hidden = format.value !== "carousel"; });
    if (form) form.addEventListener("submit", saveForm);
    const creativeForm = root.querySelector("#instagram-story-creative-form");
    if (creativeForm) {
      creativeForm.addEventListener("input", (event) => {
        const field = event.target;
        if (field.name in state.creativeForm) state.creativeForm[field.name] = field.value;
      });
      creativeForm.addEventListener("submit", generateStory);
    }
  }
  async function load() {
    if (state.loading) return;
    state.loading = true;
    root.innerHTML = '<div class="ig-manager"><p class="admin-muted">Carregando automações do Instagram…</p></div>';
    try { state.data = await request("dashboard"); state.error = ""; }
    catch (error) { state.error = error.message || "Não foi possível carregar as automações."; }
    finally { state.loading = false; render(); }
  }
  async function saveForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const payload = {
      id: f.get("id") || "",
      name: f.get("name"),
      content_format: f.get("content_format"),
      products_per_post: Number(f.get("products_per_post") || 5),
      schedule_days: [...form.querySelectorAll('[name="schedule_days"]:checked')].map((el) => Number(el.value)),
      schedule_times: String(f.get("schedule_times") || "").split(/[,;\n]+/).map((v) => v.trim()).filter(Boolean),
      caption_template: f.get("caption_template") || "",
      active: f.get("active") === "on"
    };
    state.busy = true;
    try {
      await request("save_automation", payload);
      state.editing = null; state.message = "Automação salva."; state.error = "";
      state.data = await request("dashboard");
    } catch (error) { state.error = error.message || "Não foi possível salvar a automação."; }
    finally { state.busy = false; render(); }
  }
  async function generateStory(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = { phrase:values.get("phrase"), theme:values.get("theme"), extra_info:values.get("extra_info") || "" };
    state.creativeForm = payload;
    state.busy = true; state.error = ""; state.message = "Gerando a imagem. Isso pode levar um pouco…"; render();
    try {
      await request("generate_story", payload);
      state.data = await request("dashboard");
      state.error = ""; state.message = "Prévia pronta. Revise a arte e aprove a publicação somente se estiver correta.";
    } catch (error) {
      state.error = error.message || "Não foi possível gerar a arte.";
      try { state.data = await request("dashboard"); } catch {}
    } finally { state.busy = false; render(); }
  }
  async function downloadStory(id) {
    if (state.busy) return;
    state.busy = true; state.error = ""; state.message = ""; render();
    try {
      const blob = await requestDownload(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "dona-antonia-story-" + id.slice(0, 8) + ".jpg";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      state.message = "Download iniciado. No celular, procure o JPG em Downloads ou no app Arquivos.";
    } catch (error) { state.error = error.message || "Não foi possível baixar a arte."; }
    finally { state.busy = false; render(); }
  }
  async function runAction(button) {
    const action = button.dataset.action, id = button.dataset.id;
    if (action === "publish") {
      if (!window.confirm("Aprovar e publicar esta arte agora nos Stories do Instagram?")) return;
      state.busy = true; state.error = ""; state.message = "Enviando o Story aprovado…"; render();
      try {
        await request("publish_story", { id });
        state.message = "Story publicado no Instagram.";
      } catch (error) { state.error = error.message || "Não foi possível confirmar a publicação."; }
      try { state.data = await request("dashboard"); } catch {}
      state.busy = false; render(); return;
    }
    if (action === "new") { state.editing = { name:"", content_format:"feed", products_per_post:5, schedule_days:[1,2,3,4,5,6], schedule_times:["07:05"], status:"active", caption_template:"" }; render(); return; }
    if (action === "cancel") { state.editing = null; render(); return; }
    if (action === "edit") { state.editing = state.data.automations.find((row) => row.id === id) || null; render(); return; }
    if (action === "refresh") { state.message = ""; await load(); return; }
    if (action === "archive" && !window.confirm("Arquivar esta automação? O histórico será mantido.")) return;
    state.busy = true;
    try {
      if (action === "run") { await request("run_now", { id }); state.message = "Publicação colocada na fila. O agendador verifica a fila a cada cinco minutos."; }
      else if (action === "toggle") { await request("toggle_automation", { id, active: button.dataset.active === "true" }); state.message = "Status atualizado."; }
      else if (action === "archive") { await request("archive_automation", { id }); state.message = "Automação arquivada; o histórico foi preservado."; }
      else if (action === "retry") { await request("retry_job", { id }); state.message = "Publicação recolocada na fila."; }
      state.data = await request("dashboard"); state.error = "";
    } catch (error) { state.error = error.message || "Não foi possível concluir a ação."; }
    finally { state.busy = false; render(); }
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button && !state.busy) {
      if (button.dataset.action === "download") downloadStory(button.dataset.id);
      else runAction(button);
    }
  });
  window.DonaInstagramAdmin = { load };
})();