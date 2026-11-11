(function () {
  "use strict";

  const root = document.getElementById("jornada");
  if (!root) return;

  // Temas complementares de formacao; nao substituem o texto do livro.
  const WEEKS = [
    ["O chamado de Deus e o compromisso pessoal", "Recomeçar a vida de oração e aprender a responder ao chamado de Deus.", "Reservar dez minutos por dia exclusivamente para a oração.", "O que mais tem dificultado minha intimidade com Deus?"],
    ["O silêncio e a capacidade de ouvir", "Escutar a Deus e as pessoas antes de reagir ou julgar.", "Escutar alguém com atenção, sem interromper nem julgar.", "Tenho ouvido para compreender ou apenas para responder?"],
    ["A fé que se transforma em obediência", "Reconhecer responsabilidades e agir mesmo diante da incerteza.", "Assumir uma responsabilidade importante que está sendo adiada.", "Que responsabilidade Deus está me pedindo que assuma?"],
    ["Amor, presença e responsabilidade familiar", "Ser presença cuidadosa na família, sem confundir cuidado com controle.", "Dedicar tempo de qualidade a uma pessoa da família, sem celular.", "Minha família recebe minha presença ou apenas meu tempo que sobra?"],
    ["Coragem diante das dificuldades", "Enfrentar problemas com fé, prudência e serenidade.", "Enfrentar de forma responsável algo que vem sendo evitado.", "Quando surgem dificuldades, enfrento, fujo ou reclamo?"],
    ["Dignidade do trabalho e espírito de serviço", "Viver o trabalho com honestidade e ajudar sem esperar reconhecimento.", "Prestar uma ajuda concreta a alguém sem buscar recompensa.", "O que minhas atitudes no trabalho revelam sobre minha fé?"],
    ["Humildade, perdão e reconciliação", "Aprender a reconhecer erros e buscar a paz.", "Reconhecer um erro e, quando apropriado, pedir perdão.", "Por que às vezes é tão difícil reconhecer que estou errado?"],
    ["Integridade, respeito e domínio próprio", "Combater hábitos prejudiciais com realismo e perseverança.", "Escolher um hábito prejudicial e começar a modificá-lo.", "Que hábito preciso dominar para ser um homem mais íntegro?"],
    ["Cuidar e proteger sem controlar", "Cultivar uma presença segura, acolhedora e respeitosa.", "Oferecer escuta e apoio verdadeiro a alguém que precise.", "Tenho cuidado de quem confia em mim com respeito e atenção?"],
    ["Paciência, equilíbrio e perseverança", "Responder com maturidade aos conflitos e às contrariedades.", "Praticar uma resposta serena diante de uma situação difícil.", "Como reajo quando as coisas não acontecem como quero?"],
    ["Amizade, fraternidade e confiança", "Aprender a receber ajuda, oferecer presença e cultivar amizades.", "Procurar um irmão do grupo para escutar e oferecer oração.", "Consigo pedir ajuda quando estou enfrentando dificuldades?"],
    ["Fé concreta e caridade", "Transformar a oração em serviço e atenção aos outros.", "Praticar uma ação de caridade individual ou em grupo.", "Como minha fé pode melhorar concretamente a vida de alguém?"],
    ["Gratidão, testemunho e continuidade", "Reconhecer os frutos da jornada e manter os bons compromissos.", "Assumir uma prática espiritual para os próximos três meses.", "O que estes 91 dias mudaram na minha maneira de viver?"]
  ];
  const ROUTINE = [
    ["Dia 1", "Leitura, oração e lançamento do desafio."],
    ["Dia 2", "Leitura e primeiro passo da atitude prática."],
    ["Dia 3", "Leitura e reflexão pessoal silenciosa."],
    ["Dia 4", "Leitura e pergunta de reflexão no WhatsApp."],
    ["Dia 5", "Leitura e oração pelas famílias e pelos irmãos."],
    ["Dia 6", "Leitura, intenções opcionais e preparação da reunião."],
    ["Dia 7", "Leitura e encontro semanal de uma hora."]
  ];
  const K_CHALLENGES = "saojose91-desafios-v1";
  const K_MEMBERS = "saojose91-irmaos-v1";
  const K_SETTINGS = "saojose91-settings-v1";
  function fromStorage(key, fallback) {
    try {
      const val = JSON.parse(localStorage.getItem(key) || "null");
      return val === null ? fallback : val;
    } catch (_) { return fallback; }
  }
  function persist(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { notify("Não foi possível salvar os dados neste aparelho."); return false; }
  }
  function safe(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  let completed = fromStorage(K_CHALLENGES, []);
  if (!Array.isArray(completed)) completed = [];
  completed = Array.from(new Set(completed.map(Number).filter(function (v) { return Number.isInteger(v) && v >= 1 && v <= 13; })));
  let names = fromStorage(K_MEMBERS, []);
  if (!Array.isArray(names)) names = [];
  names = Array.from({ length: 9 }, function (_, i) {
    return typeof names[i] === "string" && names[i].trim() ? names[i].trim().slice(0, 70) : "Irmão " + (i + 1);
  });
  function currentSelectedWeek() {
    const n = Number((document.getElementById("reflection-week").textContent || "").replace(/\D/g, ""));
    return Number.isInteger(n) && n >= 1 && n <= 13 ? n : 1;
  }
  let week = currentSelectedWeek();
  let tab = "formacao";

  function notify(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(function () { toast.classList.remove("is-visible"); }, 3000);
  }
  function share(text) {
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  }
  async function copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement("textarea");
        field.value = text;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        if (!document.execCommand("copy")) throw new Error("copy unavailable");
        field.remove();
      }
      notify("Texto copiado.");
    } catch (_) {
      notify("Não foi possível copiar automaticamente. Use o botão do WhatsApp.");
    }
  }
  function rosterText() {
    return "Fraternidades — Homens de São José\n\n" +
      [0, 1, 2].map(function (trio) {
        return "Trio " + (trio + 1) + ": " + names.slice(trio * 3, trio * 3 + 3).join(", ");
      }).join("\n") + "\n\nNinguém caminha sozinho para Cristo.";
  }
  function message(kind) {
    const start = (week - 1) * 7 + 1;
    const end = week * 7;
    const w = WEEKS[week - 1];
    const settings = fromStorage(K_SETTINGS, {});
    const time = /^\d{2}:\d{2}$/.test(settings.meetingTime || "") ? settings.meetingTime : "horário combinado";
    const days = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
    const when = /^[0-6]$/.test(String(settings.meetingDay)) ? days[Number(settings.meetingDay)] : "dia combinado";
    if (kind === "inicio") return "🙏 HOMENS DE SÃO JOSÉ — SEMANA " + week +
      "\n\nIrmãos, nesta semana vamos ler os dias " + start + " a " + end + " do nosso livro." +
      "\n\nVirtude da semana: " + w[0] + "\nNosso desafio: " + w[2] +
      "\n\nA pergunta é: o que Deus quer transformar em mim?\n\nNinguém caminha sozinho para Cristo!";
    if (kind === "pergunta") return "🙏 Reflexão da semana " + week + "\n\n" + w[3] +
      "\n\nQuem desejar pode partilhar uma frase ou um áudio breve. Não é obrigatório responder.";
    if (kind === "intencoes") return "🙏 Irmãos, vamos rezar uns pelos outros e por nossas famílias." +
      "\n\nSe alguém desejar, pode colocar aqui uma intenção de oração, sem precisar explicar detalhes. São José, rogai por nós!";
    if (kind === "reuniao") return "🙏 Irmãos, nosso encontro semanal será " + when + ", às " + time +
      ".\n\n📖 Leituras: dias " + start + " a " + end + ".\n" +
      "Condução: " + names[(week - 1) % 9] + ".\n\nPreparem uma reflexão simples: qual leitura mais tocou vocês e como aplicá-la à vida?" +
      (settings.meetingLink ? "\n\nAcesso: " + settings.meetingLink : "") +
      "\n\nSão José, rogai por nós!";
    return "Homens de São José — Semana " + week + "\nDesafio: " + w[2];
  }
  const actions = [
    ["inicio", "Dia 1 · Abertura", "Apresentar as leituras e o desafio semanal."],
    ["pergunta", "Dia 4 · Reflexão", "Fazer uma pergunta simples, sem cobrança de resposta."],
    ["intencoes", "Dia 6 · Intenções", "Convidar à oração por quem precisar."],
    ["reuniao", "Dia 7 · Encontro", "Lembrar o horário e a condução da reunião."]
  ];

  function render() {
    const w = WEEKS[week - 1];
    const first = (week - 1) * 7 + 1;
    const last = week * 7;
    const leader = names[(week - 1) % 9];
    const done = completed.includes(week);
    root.innerHTML = [
      '<div class="journey-header"><div><p class="panel-kicker">Espiritualidade · Fraternidade · Formação</p>',
      '<h2>Viver os ensinamentos de São José</h2>',
      '<p>Uma atitude concreta por semana. A leitura continua sendo feita no seu exemplar do livro.</p></div>',
      '<div class="journey-count"><strong>' + completed.length + '/13</strong><span>desafios vividos</span></div></div>',
      '<div class="journey-tabs" role="group" aria-label="Áreas da caminhada">',
      '<button type="button" data-journey-tab="formacao" aria-pressed="' + (tab === "formacao") + '" class="' + (tab === "formacao" ? "active" : "") + '">Formação</button>',
      '<button type="button" data-journey-tab="whatsapp" aria-pressed="' + (tab === "whatsapp") + '" class="' + (tab === "whatsapp" ? "active" : "") + '">WhatsApp</button>',
      '<button type="button" data-journey-tab="fraternidade" aria-pressed="' + (tab === "fraternidade") + '" class="' + (tab === "fraternidade" ? "active" : "") + '">Fraternidade</button></div>',
      '<div id="journey-formacao" class="journey-view" ' + (tab === "formacao" ? "" : "hidden") + '>',
      '<article class="journey-feature"><div class="journey-overline">Semana ' + week + ' de 13 <span>·</span> Dias ' + first + '–' + last + '</div>',
      '<h3>' + safe(w[0]) + '</h3><p>' + safe(w[1]) + '</p>',
      '<div class="journey-challenge"><small>Desafio para viver na prática</small><strong>' + safe(w[2]) + '</strong>',
      '<button type="button" data-challenge-toggle aria-pressed="' + done + '" class="button ' + (done ? "button-light" : "button-primary") + ' button-small">' + (done ? "✓ Desafio vivido · desfazer" : "Marcar desafio como vivido") + '</button></div>',
      '<div class="journey-question"><small>Pergunta para a partilha</small><p>' + safe(w[3]) + '</p></div>',
      '<p class="journey-coordinator">Condução sugerida do encontro: <strong>' + safe(leader) + '</strong></p></article>',
      '<article class="journey-subcard"><h3>Ritmo da semana</h3>',
      '<div class="journey-routine">' + ROUTINE.map(function (r, i) {
        return '<div class="journey-routine-row"><b>' + safe(r[0]) + '</b><span>Leitura ' + (first + i) + ' · ' + safe(r[1]) + '</span></div>';
      }).join("") + '</div></article>',
      '<article class="journey-subcard"><h3>Três perguntas para o encontro</h3>',
      '<ol class="journey-questions"><li>O que Deus me ensinou nas leituras?</li>',
      '<li>Em que atitude pessoal preciso melhorar?</li>',
      '<li>O que farei de diferente na próxima semana?</li></ol>',
      '<p class="journey-muted">O encontro é espaço de escuta, não de avaliação. Partilhas são voluntárias.</p></article></div>',
      '<div id="journey-whatsapp" class="journey-view" ' + (tab === "whatsapp" ? "" : "hidden") + '>',
      '<div class="journey-intro"><h3>Mensagens da semana ' + week + '</h3>',
      '<p>Use apenas quatro mensagens organizadas por semana. Os botões abrem o envio manual; nada é enviado automaticamente.</p></div>',
      '<div class="journey-message-grid">' + actions.map(function (a) {
        return '<article class="journey-message"><h4>' + safe(a[1]) + '</h4><p>' + safe(a[2]) + '</p>' +
          '<div class="journey-message-actions"><button type="button" class="button button-primary button-small" data-whatsapp="' + a[0] + '">Enviar</button>' +
          '<button type="button" class="button button-light button-small" data-copy="' + a[0] + '">Copiar</button></div></article>';
      }).join("") + '</div>',
      '<div class="journey-tip">Sugestão: não cobrar respostas diárias, não publicar rankings e oferecer apoio individual a quem faltar.</div></div>',
      '<div id="journey-fraternidade" class="journey-view" ' + (tab === "fraternidade" ? "" : "hidden") + '>',
      '<div class="journey-intro"><h3>Nossos nove irmãos</h3>',
      '<p>Edite os nomes para organizar os três trios e o rodízio de condução. Os nomes ficam salvos apenas neste aparelho.</p></div>',
      '<div class="journey-trios">' + [0, 1, 2].map(function (trio) {
        return '<fieldset class="journey-trio"><legend>Trio ' + (trio + 1) + '</legend>' +
          [0, 1, 2].map(function (offset) {
            const i = trio * 3 + offset;
            return '<label>Irmão ' + (i + 1) + '<input type="text" maxlength="70" autocomplete="off" data-journey-name="' + i + '" value="' + safe(names[i]) + '"></label>';
          }).join("") + '</fieldset>';
      }).join("") + '</div>',
      '<p class="journey-coordinator">Responsável pela semana ' + week + ': <strong>' + safe(leader) + '</strong>. Cada um conduz pelo menos uma reunião.</p>',
      '<div class="journey-message-actions"><button type="button" class="button button-primary button-small" data-share-trios>Compartilhar trios</button>',
      '<button type="button" class="button button-light button-small" data-copy-trios>Copiar trios</button></div>',
      '<div class="journey-tip">Combinem uma conversa breve por semana dentro de cada trio. Cuidar, não fiscalizar. Não compartilhem confidências pessoais sem permissão.</div></div>',
      '<p class="journey-footnote">Privacidade: leituras, desafios, notas e nomes são locais a este dispositivo. Não existe ranking nem sincronização entre participantes. O envio pelo WhatsApp depende de sua ação.</p>'
    ].join("");
  }

  root.addEventListener("click", function (event) {
    const selected = event.target.closest("[data-journey-tab]");
    if (selected) {
      tab = selected.getAttribute("data-journey-tab");
      render();
      return;
    }
    if (event.target.closest("[data-challenge-toggle]")) {
      if (completed.includes(week)) completed = completed.filter(function (v) { return v !== week; });
      else completed.push(week);
      persist(K_CHALLENGES, completed);
      render();
      return;
    }
    const btnShare = event.target.closest("[data-whatsapp]");
    if (btnShare) { share(message(btnShare.getAttribute("data-whatsapp"))); return; }
    const btnCopy = event.target.closest("[data-copy]");
    if (btnCopy) { copy(message(btnCopy.getAttribute("data-copy"))); return; }
    if (event.target.closest("[data-share-trios]")) { share(rosterText()); return; }
    if (event.target.closest("[data-copy-trios]")) { copy(rosterText()); }
  });
  root.addEventListener("change", function (event) {
    const field = event.target.closest("[data-journey-name]");
    if (!field) return;
    const i = Number(field.getAttribute("data-journey-name"));
    if (!Number.isInteger(i) || i < 0 || i > 8) return;
    names[i] = field.value.trim().slice(0, 70) || "Irmão " + (i + 1);
    persist(K_MEMBERS, names);
    render();
  });
  const reflectionWeek = document.getElementById("reflection-week");
  if (reflectionWeek && "MutationObserver" in window) {
    new MutationObserver(function () {
      const next = currentSelectedWeek();
      if (next !== week) { week = next; render(); }
    }).observe(reflectionWeek, { childList: true, characterData: true, subtree: true });
  }
  render();
}());