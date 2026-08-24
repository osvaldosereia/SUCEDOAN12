const ACTIVE_BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || 'mug-motivational-phrases-v1';

const MOTIVATIONAL_PHRASES = Object.freeze([
  "Vai dar certo. Continue.",
  "Comece antes de estar pronto.",
  "Coragem também é hábito.",
  "Faça acontecer.",
  "Você consegue mais.",
  "O próximo passo importa.",
  "Continue em movimento.",
  "Escolha avançar.",
  "Desista de desistir.",
  "Hoje conta.",
  "Ainda dá tempo.",
  "Confie no processo.",
  "Faça por você.",
  "Ouse começar.",
  "Vai. Mesmo com medo.",
  "Menos dúvida. Mais atitude.",
  "Começar muda tudo.",
  "Você veio para crescer.",
  "Seja sua própria virada.",
  "Acredite e trabalhe.",
  "Sem pressa. Sem parar.",
  "Continue escolhendo você.",
  "Não diminua seus sonhos.",
  "Tente mais uma vez.",
  "Seu momento começa agora.",
  "Nem todo atraso é perda de tempo.",
  "Você não precisa saber tudo para começar.",
  "Crescer também é mudar de ideia.",
  "O conforto cobra caro pelos sonhos que adia.",
  "Talento abre portas. Constância mantém abertas.",
  "Às vezes, avançar é aprender a deixar ir.",
  "Nem toda resposta precisa chegar hoje.",
  "O futuro começa nas escolhas pequenas.",
  "Você não precisa correr para estar avançando.",
  "O que você repete se torna quem você é.",
  "Disciplina é lembrar o que você realmente quer.",
  "Um limite também pode ser um começo.",
  "A mudança começa quando a desculpa termina.",
  "Nem tudo que pesa merece ser carregado.",
  "Você cresce quando para de negociar seus sonhos.",
  "A direção vale mais que a velocidade.",
  "Existem portas que só aparecem depois do primeiro passo.",
  "Seu futuro observa o que você faz hoje.",
  "A coragem começa onde termina a certeza.",
  "Mudar de caminho também é seguir em frente.",
  "Algumas respostas chegam durante o caminho.",
  "Você não precisa provar o que já sabe sobre si.",
  "Paz também é uma forma de sucesso.",
  "Nem todo progresso faz barulho.",
  "Há força em saber recomeçar.",
  "Faça o importante antes do urgente.",
  "Sonho sem ação continua sendo ideia.",
  "Foco é dizer não ao que distrai seu sim.",
  "Resultados gostam de rotina.",
  "Trabalhe pelo que ainda não existe.",
  "Pequenos esforços constroem grandes resultados.",
  "Constância vence empolgação.",
  "Menos promessa. Mais execução.",
  "O plano melhora quando você começa.",
  "Não espere inspiração. Crie movimento.",
  "Faça bem feito. Depois faça melhor.",
  "Foco no que depende de você.",
  "Seu trabalho de hoje financia seus sonhos de amanhã.",
  "Prioridade é aquilo que recebe seu tempo.",
  "Planeje. Execute. Ajuste. Repita.",
  "Grandes resultados começam discretamente.",
  "Produtividade também é saber parar.",
  "Faça menos coisas. Faça melhor.",
  "Consistência é uma vantagem silenciosa.",
  "A diferença está no que você faz todo dia.",
  "Ideias valem mais quando saem do papel.",
  "Trabalhe até sua evolução ficar evidente.",
  "A disciplina trabalha quando a motivação dorme.",
  "Feito com constância supera perfeito adiado.",
  "Seu próximo nível exige novos hábitos.",
  "Você não precisa diminuir para caber.",
  "Confie em quem você está se tornando.",
  "Você merece ocupar espaço.",
  "Não peça desculpas por crescer.",
  "Sua voz merece ser ouvida.",
  "Você já venceu dias que pareciam impossíveis.",
  "Seja alguém de quem você se orgulha.",
  "Não terceirize sua autoestima.",
  "Você é maior que uma fase ruim.",
  "Pare de pedir permissão para ser você.",
  "Você não precisa convencer todo mundo.",
  "Reconheça sua própria evolução.",
  "Se escolha sem culpa.",
  "Sua diferença também é sua força.",
  "Você não nasceu para viver pela metade.",
  "Não se abandone para agradar alguém.",
  "Sua história não termina numa página difícil.",
  "Seja gentil com quem você está se tornando.",
  "Você merece os sonhos que leva a sério.",
  "Não confunda humildade com se diminuir.",
  "Você também merece seu próprio apoio.",
  "Acredite em você antes dos aplausos.",
  "Você não precisa ser perfeito para ser incrível.",
  "Sua melhor versão ainda está em construção.",
  "Tenha orgulho do quanto você avançou.",
  "Recomeçar também é vencer.",
  "Uma fase ruim não define uma vida inteira.",
  "Depois do caos, reorganize os sonhos.",
  "Você pode começar diferente desta vez.",
  "Cicatrizes também contam histórias de vitória.",
  "Todo fim libera espaço para alguma coisa nova.",
  "Respire. Recalcule. Continue.",
  "Você não perdeu tudo. Você aprendeu muito.",
  "Alguns finais são portas disfarçadas.",
  "Voltar ao começo não significa voltar ao zero.",
  "Recomeçar com experiência é começar mais forte.",
  "Você sobreviveu. Agora floresça.",
  "Não carregue ontem para dentro de hoje.",
  "Existe vida depois dos planos que deram errado.",
  "O que caiu pode ser reconstruído melhor.",
  "Às vezes, o plano B vira a melhor história.",
  "Seu passado explica. Não determina.",
  "Você ainda pode surpreender a própria história.",
  "Dê ao amanhã uma chance.",
  "Toda manhã oferece uma nova tentativa.",
  "Continue. A história ainda está acontecendo.",
  "Permita-se uma versão diferente do futuro.",
  "Não transforme uma queda em endereço.",
  "Levante diferente de como caiu.",
  "Recomeços combinam com gente corajosa.",
  "Nem tudo merece sua energia.",
  "Proteja sua paz.",
  "Respirar também faz parte do plano.",
  "Faça espaço para o que faz bem.",
  "Leve a vida a sério, não o tempo todo.",
  "Nem toda batalha precisa da sua presença.",
  "Que sua ambição não custe sua paz.",
  "Descansar não apaga seus objetivos.",
  "A vida também acontece entre uma meta e outra.",
  "Não espere as férias para começar a viver.",
  "Sucesso também é dormir em paz.",
  "Sua agenda não mede seu valor.",
  "Há dias de produzir e dias de respirar.",
  "Paz é riqueza que não cabe na conta bancária.",
  "Não tenha tanta pressa de chegar que esqueça de viver.",
  "Colecione momentos, não apenas conquistas.",
  "Uma vida bonita também precisa de pausas.",
  "Felicidade não precisa ser complicada.",
  "Simplifique o que rouba sua paz.",
  "Você não precisa abraçar todas as urgências.",
  "Viver bem também é saber dizer não.",
  "Celebre antes que tudo esteja perfeito.",
  "A vida fica melhor quando cabe nela você.",
  "Não adie alegria esperando perfeição.",
  "Que a vida seja grande, não apenas ocupada.",
  "Faça duvidarem. Depois faça acontecer.",
  "Seja impossível de ignorar.",
  "Pensar grande ainda é grátis.",
  "Tenha coragem para querer mais.",
  "Não aceite pequeno só porque é seguro.",
  "Você não precisa seguir mapas que não levam aos seus sonhos.",
  "Crie oportunidades que ainda não existem.",
  "Não espere a mesa. Construa a sua.",
  "Se não encontrar espaço, crie espaço.",
  "Seja mais curioso que inseguro.",
  "Não tenha medo de ser iniciante.",
  "Faça do seu jeito dar certo.",
  "Quem pensa diferente encontra caminhos diferentes.",
  "Seja ousado o bastante para tentar.",
  "Pare de ensaiar a vida.",
  "Não nasci para assistir minha própria história.",
  "Transforme “um dia” em “dia um”.",
  "Se ninguém tentou assim, melhor ainda.",
  "Ideias corajosas precisam de pessoas corajosas.",
  "Faça algo que seu futuro agradeça.",
  "Não limite o próximo capítulo pelo anterior.",
  "Seja excelente sem precisar anunciar.",
  "Sonhe grande. Comece pequeno. Continue sempre.",
  "Não espere confiança para agir. Aja para construí-la.",
  "O extraordinário começa parecendo exagero.",
  "Café primeiro. Grandes ideias depois.",
  "Café forte. Planos maiores ainda.",
  "Abastecida de café e propósito.",
  "Abastecido de café e coragem.",
  "Um gole. Uma ideia. Um passo.",
  "Café para acordar. Coragem para acontecer.",
  "Hoje tem café e possibilidade.",
  "Meu combustível tem aroma de café.",
  "Café quente. Cabeça fria.",
  "Grandes planos começam em pequenos goles.",
  "Café, foco e nenhuma desculpa.",
  "Comece o dia acreditando. E com café.",
  "Café na mão. Futuro em construção.",
  "Pausa para o café. Não para os sonhos.",
  "Meu plano começa depois deste gole.",
  "Café forte para ideias fortes.",
  "Acorde. Tome café. Surpreenda-se.",
  "Hoje eu sirvo café e determinação.",
  "Um café e eu resolvo.",
  "Menos drama. Mais café e atitude.",
  "Café: porque grandes decisões merecem companhia.",
  "Sonhos grandes pedem uma caneca cheia.",
  "A vida não vem pronta. O café também não.",
  "Café passado. Passado superado.",
  "Beba café. Crie possibilidades."
]);

const MOTIVATIONAL_CATEGORIES = Object.freeze([
  ['all', 'Todas as categorias motivacionais', 1, 200],
  ['curtas', 'Curtas, fortes e minimalistas', 1, 25],
  ['reflexivas', 'Inteligentes e reflexivas', 26, 50],
  ['foco', 'Foco, trabalho e produtividade', 51, 75],
  ['autoestima', 'Autoconfiança e autoestima', 76, 100],
  ['recomeco', 'Recomeço e superação', 101, 125],
  ['leveza', 'Leveza, equilíbrio e vida', 126, 150],
  ['atitude', 'Atitude, ousadia e personalidade', 151, 175],
  ['cafe', 'Café + motivação', 176, 200],
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function categoryForIndex(index) {
  const number = index + 1;
  return MOTIVATIONAL_CATEGORIES.find(([key, , start, end]) => key !== 'all' && number >= start && number <= end)?.[0] || 'all';
}

function installStyles() {
  if (document.getElementById('mugMotivationalPhrasesStyles')) return;
  const style = document.createElement('style');
  style.id = 'mugMotivationalPhrasesStyles';
  style.textContent = `
    #mugAutomationPanel.mugv7 .mug-motivational-phrases{border:1px solid #ddd8c8;border-radius:11px;background:#fffdf6;padding:8px;display:grid;gap:7px}
    #mugAutomationPanel.mugv7 .mug-motivational-phrases summary{cursor:pointer;font-size:11.5px;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:8px;list-style:none}
    #mugAutomationPanel.mugv7 .mug-motivational-phrases summary::-webkit-details-marker{display:none}
    #mugAutomationPanel.mugv7 .mug-motivational-count{font-size:9.5px;font-weight:700;color:#6a6250;background:#f2eddf;border-radius:999px;padding:2px 6px}
    #mugAutomationPanel.mugv7 .mug-motivational-body{display:grid;gap:6px;padding-top:7px}
    #mugAutomationPanel.mugv7 .mug-motivational-search,
    #mugAutomationPanel.mugv7 .mug-motivational-category,
    #mugAutomationPanel.mugv7 .mug-motivational-select{width:100%;box-sizing:border-box;border:1px solid #d5cfbd;border-radius:9px;background:#fff;font:inherit;color:#222}
    #mugAutomationPanel.mugv7 .mug-motivational-search,
    #mugAutomationPanel.mugv7 .mug-motivational-category{padding:7px;font-size:10.5px}
    #mugAutomationPanel.mugv7 .mug-motivational-select{min-height:170px;padding:4px;font-size:11px;line-height:1.25}
    #mugAutomationPanel.mugv7 .mug-motivational-select option{padding:5px 4px}
    #mugAutomationPanel.mugv7 .mug-motivational-help{font-size:9.5px;line-height:1.25;color:#706958}
    #mugAutomationPanel.mugv7 .mug-motivational-actions{display:flex;gap:6px;align-items:center;justify-content:space-between}
    #mugAutomationPanel.mugv7 .mug-motivational-actions button{padding:5px 7px!important;min-height:27px!important;font-size:9.5px!important}
    @media(max-width:900px){#mugAutomationPanel.mugv7 .mug-motivational-select{min-height:145px;font-size:12px}}
  `;
  document.head.appendChild(style);
}

function relabelReligiousPicker(panel) {
  const religious = panel.querySelector('#mugPresetPhrases');
  const title = religious?.querySelector('summary span:first-child');
  if (title) title.textContent = '200 frases religiosas';
  const firstOption = religious?.querySelector('#mugPresetPhraseCategory option[value="all"]');
  if (firstOption) firstOption.textContent = 'Todas as categorias religiosas';
}

function renderOptions(picker) {
  const search = picker.querySelector('#mugMotivationalPhraseSearch');
  const category = picker.querySelector('#mugMotivationalPhraseCategory');
  const select = picker.querySelector('#mugMotivationalPhraseSelect');
  const count = picker.querySelector('#mugMotivationalPhraseCount');
  if (!search || !category || !select || !count) return;
  const query = normalize(search.value);
  const categoryKey = category.value || 'all';
  const filtered = MOTIVATIONAL_PHRASES
    .map((phrase, index) => ({ phrase, index, category: categoryForIndex(index) }))
    .filter(item => categoryKey === 'all' || item.category === categoryKey)
    .filter(item => !query || normalize(item.phrase).includes(query));
  select.innerHTML = filtered.map(item => `<option value="${item.index}">${String(item.index + 1).padStart(3, '0')} · ${escapeHtml(item.phrase)}</option>`).join('');
  count.textContent = `${filtered.length}/${MOTIVATIONAL_PHRASES.length}`;
  picker.dataset.filteredCount = String(filtered.length);
}

function applySelectedPhrase(panel, picker) {
  const select = picker.querySelector('#mugMotivationalPhraseSelect');
  const field = panel.querySelector('#mugv7Instruction');
  if (!select || !field || select.selectedIndex < 0) return;
  const index = Number(select.value);
  const phrase = MOTIVATIONAL_PHRASES[index];
  if (!phrase) return;
  field.value = phrase;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  picker.querySelector('#mugMotivationalPhraseApplied').textContent = `Frase motivacional ${index + 1} aplicada.`;
}

function installPicker(panel) {
  if (!panel?.classList.contains('mugv7')) return false;
  relabelReligiousPicker(panel);
  if (panel.querySelector('#mugMotivationalPhrases')) return true;
  const religious = panel.querySelector('#mugPresetPhrases');
  const instruction = panel.querySelector('.mugv7-instruction');
  if (!instruction) return false;
  installStyles();
  const picker = document.createElement('details');
  picker.className = 'mug-motivational-phrases';
  picker.id = 'mugMotivationalPhrases';
  picker.open = true;
  picker.innerHTML = `
    <summary><span>200 frases motivacionais</span><span class="mug-motivational-count" id="mugMotivationalPhraseCount">200/200</span></summary>
    <div class="mug-motivational-body">
      <input class="mug-motivational-search" id="mugMotivationalPhraseSearch" type="search" placeholder="Buscar frase motivacional..." autocomplete="off">
      <select class="mug-motivational-category" id="mugMotivationalPhraseCategory" aria-label="Filtrar frases motivacionais por categoria">
        ${MOTIVATIONAL_CATEGORIES.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('')}
      </select>
      <select class="mug-motivational-select" id="mugMotivationalPhraseSelect" size="8" aria-label="Frases motivacionais para caneca"></select>
      <div class="mug-motivational-actions">
        <small class="mug-motivational-help" id="mugMotivationalPhraseApplied">Selecione uma frase para preencher “Instrução complementar”.</small>
        <button class="button secondary compact" id="mugMotivationalPhraseClear" type="button">Limpar</button>
      </div>
    </div>`;
  if (religious) religious.insertAdjacentElement('afterend', picker);
  else instruction.insertAdjacentElement('afterend', picker);

  const search = picker.querySelector('#mugMotivationalPhraseSearch');
  const category = picker.querySelector('#mugMotivationalPhraseCategory');
  const select = picker.querySelector('#mugMotivationalPhraseSelect');
  search.addEventListener('input', () => renderOptions(picker));
  category.addEventListener('change', () => renderOptions(picker));
  select.addEventListener('change', () => applySelectedPhrase(panel, picker));
  select.addEventListener('dblclick', () => applySelectedPhrase(panel, picker));
  picker.querySelector('#mugMotivationalPhraseClear').addEventListener('click', () => {
    const field = panel.querySelector('#mugv7Instruction');
    if (field) {
      field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    select.selectedIndex = -1;
    picker.querySelector('#mugMotivationalPhraseApplied').textContent = 'Instrução complementar limpa.';
  });

  renderOptions(picker);
  panel.dataset.mugMotivationalPhrases = ACTIVE_BUILD;
  return true;
}

function activate(attempt = 0) {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  const panel = document.getElementById('mugAutomationPanel');
  if (installPicker(panel)) return;
  if (attempt < 60) setTimeout(() => activate(attempt + 1), 100);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(() => activate(), 0);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') setTimeout(() => activate(), 0);
});

const observer = new MutationObserver(() => {
  if (window.adminV2CurrentRoute?.() === 'mug-studio') activate();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => activate(), 0), { once: true });
else setTimeout(() => activate(), 0);

export { MOTIVATIONAL_PHRASES, MOTIVATIONAL_CATEGORIES, installPicker };
