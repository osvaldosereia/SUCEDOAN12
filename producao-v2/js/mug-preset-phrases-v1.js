const ACTIVE_BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || 'mug-phrases-v1';

const PHRASES = Object.freeze([
  "Deus ainda escreve milagres.",
  "Onde há fé, há caminho.",
  "Jesus, meu porto seguro.",
  "Minha força vem do Senhor.",
  "Deus cuida de cada detalhe.",
  "A fé transforma o impossível.",
  "Com Deus, eu vou além.",
  "A graça me encontrou.",
  "Meu coração pertence a Jesus.",
  "Deus nunca perde o controle.",
  "Ore. Confie. Espere.",
  "Jesus é minha esperança.",
  "Deus faz florescer até o deserto.",
  "Minha paz tem nome: Jesus.",
  "A fé fala mais alto que o medo.",
  "Nas mãos de Deus estou seguro.",
  "Quando Deus guia, o caminho aparece.",
  "Minha história está nas mãos de Deus.",
  "Deus transforma lágrimas em testemunhos.",
  "Eu escolhi confiar em Deus.",
  "Que nunca me falte fé.",
  "Deus é maior que qualquer tempestade.",
  "Jesus é o centro de tudo.",
  "Minha esperança vem do céu.",
  "Deus conhece o caminho que eu não vejo.",
  "A oração muda primeiro o coração.",
  "Eu descanso nas promessas de Deus.",
  "Deus prepara enquanto eu espero.",
  "A presença de Deus é meu lar.",
  "Com Jesus, sempre existe recomeço.",
  "Minha fé não depende das circunstâncias.",
  "Deus transforma espera em propósito.",
  "Que minha vida seja uma oração.",
  "Tudo começa quando entregamos a Deus.",
  "O céu continua cuidando de mim.",
  "Deus sabe exatamente do que preciso.",
  "A graça de Deus me sustenta.",
  "Jesus acalma o que ninguém vê.",
  "Não caminho sozinho: Deus vai comigo.",
  "Minha resposta para o medo é a fé.",
  "Deus faz nascer esperança onde ninguém vê.",
  "Meu futuro pertence ao Senhor.",
  "Que Deus seja maior em mim.",
  "A fé enxerga antes dos olhos.",
  "Jesus é suficiente.",
  "Deus transforma cicatrizes em testemunho.",
  "Minha alma encontra descanso em Deus.",
  "Mesmo sem entender, eu confio.",
  "Que minha vida aponte para Jesus.",
  "Se Deus está comigo, sigo em paz.",
  "Jesus, razão da minha esperança.",
  "Com Jesus, nunca estou sozinho.",
  "Jesus faz morada em meu coração.",
  "Meu caminho começa em Jesus.",
  "Meu coração escolheu Jesus.",
  "Jesus, meu melhor amigo.",
  "Onde Jesus está, existe esperança.",
  "Meu coração descansa em Jesus.",
  "Jesus transforma vidas.",
  "Jesus é luz para meus caminhos.",
  "Meu lugar é perto de Jesus.",
  "Jesus me ensina a recomeçar.",
  "Eu pertenço a Jesus.",
  "Jesus é meu norte.",
  "Que Jesus conduza meus passos.",
  "Jesus é amor que não desiste.",
  "Caminhando com Jesus.",
  "Jesus faz tudo novo.",
  "Meu coração bate por Jesus.",
  "Jesus é minha direção.",
  "Que seja feita a vontade de Jesus.",
  "Onde estiver, quero levar Jesus.",
  "Jesus vive em mim.",
  "Com Jesus, a esperança renasce.",
  "Jesus, fica sempre comigo.",
  "Maria, passa na frente.",
  "Mãe Maria, cuida de mim.",
  "Com Maria, caminho até Jesus.",
  "Maria, minha mãe e intercessora.",
  "Ave Maria, cheia de graça.",
  "Sob o manto de Maria, sigo em paz.",
  "Maria me ensina a dizer sim a Deus.",
  "Mãe de Jesus, rogai por nós.",
  "Maria, exemplo de fé e amor.",
  "Meu coração confia em Maria.",
  "Com Maria, tudo por Jesus.",
  "Maria, segura minha mão.",
  "Nossa Senhora, protege minha família.",
  "Maria, ensina-me a confiar.",
  "Que o sim de Maria inspire o meu.",
  "Maria, mãe que nunca abandona.",
  "No colo de Maria encontro paz.",
  "Maria, leva minhas preces a Jesus.",
  "Nossa Senhora, caminho de ternura.",
  "Maria, estrela que aponta para Jesus.",
  "Mãe do céu, olha por mim.",
  "Com Maria, minha fé floresce.",
  "Maria, exemplo de entrega.",
  "Sob teu manto, Mãe, quero permanecer.",
  "Maria, mãe de amor e esperança.",
  "Vem, Espírito Santo.",
  "Espírito Santo, habita em mim.",
  "Que o Espírito Santo guie meus passos.",
  "Espírito Santo, renova meu coração.",
  "Onde o Espírito sopra, nasce vida.",
  "Espírito Santo, minha inspiração.",
  "Vem incendiar meu coração.",
  "Espírito Santo, ilumina minhas escolhas.",
  "Que eu seja conduzido pelo Espírito Santo.",
  "Espírito Santo, faz morada em mim.",
  "Vem, Espírito de Deus.",
  "Que o fogo do Espírito nunca se apague.",
  "Espírito Santo, fortalece minha fé.",
  "Sopra em mim, Espírito Santo.",
  "Onde há o Espírito, há liberdade.",
  "Espírito Santo, transforma minha vida.",
  "Que tua luz, Espírito Santo, me conduza.",
  "Vem renovar tudo em mim.",
  "Espírito Santo, meu doce hóspede.",
  "Meu coração é morada do Espírito Santo.",
  "São José, rogai por nós.",
  "São José, protege minha família.",
  "São José, exemplo de pai e trabalhador.",
  "São José, guia meus passos.",
  "Com São José, aprendo a confiar.",
  "São José, homem justo e fiel.",
  "São José, guardião da minha casa.",
  "São José, protege meu trabalho.",
  "São José, ensina-me o silêncio de Deus.",
  "São José, cuida de minha família.",
  "São José, modelo de humildade.",
  "José confiou. Eu também confio.",
  "São José, força dos pais.",
  "São José, amigo nas dificuldades.",
  "São José, intercede por meu lar.",
  "Que eu tenha a coragem de São José.",
  "São José, protetor dos trabalhadores.",
  "São José, ensina-me a servir.",
  "São José, guardião do meu caminho.",
  "Com São José, tudo para Jesus.",
  "Minha família é bênção de Deus.",
  "Deus abençoe este lar.",
  "Família: presente de Deus.",
  "Onde há amor, Deus faz morada.",
  "Nossa casa pertence ao Senhor.",
  "Que Deus proteja nossa família.",
  "Família que ora permanece unida.",
  "Deus no centro da nossa família.",
  "Lar abençoado, coração agradecido.",
  "Que nunca falte Deus em nossa casa.",
  "Minha maior riqueza é minha família.",
  "Nossa família vive pela fé.",
  "Deus escreve nossa história em família.",
  "Que o amor de Deus reine neste lar.",
  "Aqui moram fé, amor e esperança.",
  "Família é onde Deus multiplica o amor.",
  "Nossa casa, nossa fé, nosso amor.",
  "Que Jesus seja sempre bem-vindo neste lar.",
  "Lar doce lar, Deus doce presença.",
  "Deus cuide de quem eu amo.",
  "Amar é deixar Deus acontecer em nós.",
  "Quem ama carrega um pouco do céu.",
  "O amor é sempre o melhor caminho.",
  "Amor que vem de Deus não tem fim.",
  "Ame mais. Julgue menos.",
  "Gratidão transforma pouco em muito.",
  "Coração grato, vida abençoada.",
  "Hoje eu escolho agradecer.",
  "Gratidão também é oração.",
  "Que meu coração transborde amor.",
  "Deus me amou primeiro.",
  "Espalhe amor por onde passar.",
  "Que o amor seja minha resposta.",
  "A gratidão aproxima o coração de Deus.",
  "Amor, fé e uma boa dose de esperança.",
  "Deus mora onde o amor é verdadeiro.",
  "Ame como Jesus ensinou.",
  "Um coração que agradece nunca está vazio.",
  "Tudo fica mais bonito quando há amor.",
  "Que eu nunca me esqueça de agradecer.",
  "Deus é bom o tempo todo.",
  "Café, fé e gratidão.",
  "Fé para hoje.",
  "Jesus comigo, sempre.",
  "Abençoada por Deus.",
  "Abençoado por Deus.",
  "Movido pela fé.",
  "Guiada pela fé.",
  "Guiado pela fé.",
  "Deus na frente.",
  "Tudo pela fé.",
  "Escolhi confiar.",
  "Jesus cuida de mim.",
  "Deus provê.",
  "Deus é fiel.",
  "Fé acima do medo.",
  "Primeiro Deus.",
  "Deus, família e café.",
  "Fé que não desiste.",
  "Com Deus, sempre."
]);

const CATEGORIES = Object.freeze([
  ['all', 'Todas as categorias', 1, 200],
  ['fe', 'Fé, Deus e confiança', 1, 50],
  ['jesus', 'Jesus', 51, 75],
  ['maria', 'Nossa Senhora e Maria', 76, 100],
  ['espirito', 'Espírito Santo', 101, 120],
  ['sao-jose', 'São José', 121, 140],
  ['familia', 'Família e lar', 141, 160],
  ['amor', 'Amor e gratidão', 161, 180],
  ['curtas', 'Frases curtas para canecas', 181, 200],
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
  return CATEGORIES.find(([key, , start, end]) => key !== 'all' && number >= start && number <= end)?.[0] || 'all';
}

function installStyles() {
  if (document.getElementById('mugPresetPhrasesStyles')) return;
  const style = document.createElement('style');
  style.id = 'mugPresetPhrasesStyles';
  style.textContent = `
    #mugAutomationPanel.mugv7 .mug-preset-phrases{border:1px solid #e1e5dc;border-radius:11px;background:#fafbf8;padding:8px;display:grid;gap:7px}
    #mugAutomationPanel.mugv7 .mug-preset-phrases summary{cursor:pointer;font-size:11.5px;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:8px;list-style:none}
    #mugAutomationPanel.mugv7 .mug-preset-phrases summary::-webkit-details-marker{display:none}
    #mugAutomationPanel.mugv7 .mug-preset-count{font-size:9.5px;font-weight:700;color:#686d65;background:#eef0eb;border-radius:999px;padding:2px 6px}
    #mugAutomationPanel.mugv7 .mug-preset-body{display:grid;gap:6px;padding-top:7px}
    #mugAutomationPanel.mugv7 .mug-preset-search,
    #mugAutomationPanel.mugv7 .mug-preset-category,
    #mugAutomationPanel.mugv7 .mug-preset-select{width:100%;box-sizing:border-box;border:1px solid #cfd4cb;border-radius:9px;background:#fff;font:inherit;color:#222}
    #mugAutomationPanel.mugv7 .mug-preset-search,
    #mugAutomationPanel.mugv7 .mug-preset-category{padding:7px;font-size:10.5px}
    #mugAutomationPanel.mugv7 .mug-preset-select{min-height:170px;padding:4px;font-size:11px;line-height:1.25}
    #mugAutomationPanel.mugv7 .mug-preset-select option{padding:5px 4px}
    #mugAutomationPanel.mugv7 .mug-preset-help{font-size:9.5px;line-height:1.25;color:#6c7169}
    #mugAutomationPanel.mugv7 .mug-preset-actions{display:flex;gap:6px;align-items:center;justify-content:space-between}
    #mugAutomationPanel.mugv7 .mug-preset-actions button{padding:5px 7px!important;min-height:27px!important;font-size:9.5px!important}
    @media(max-width:900px){#mugAutomationPanel.mugv7 .mug-preset-select{min-height:145px;font-size:12px}}
  `;
  document.head.appendChild(style);
}

function renderOptions(picker) {
  const search = picker.querySelector('#mugPresetPhraseSearch');
  const category = picker.querySelector('#mugPresetPhraseCategory');
  const select = picker.querySelector('#mugPresetPhraseSelect');
  const count = picker.querySelector('#mugPresetPhraseCount');
  if (!search || !category || !select || !count) return;
  const query = normalize(search.value);
  const categoryKey = category.value || 'all';
  const filtered = PHRASES
    .map((phrase, index) => ({ phrase, index, category: categoryForIndex(index) }))
    .filter(item => categoryKey === 'all' || item.category === categoryKey)
    .filter(item => !query || normalize(item.phrase).includes(query));
  select.innerHTML = filtered.map(item => `<option value="${item.index}">${String(item.index + 1).padStart(3, '0')} · ${escapeHtml(item.phrase)}</option>`).join('');
  count.textContent = `${filtered.length}/${PHRASES.length}`;
  picker.dataset.filteredCount = String(filtered.length);
}

function applySelectedPhrase(panel, picker) {
  const select = picker.querySelector('#mugPresetPhraseSelect');
  const field = panel.querySelector('#mugv7Instruction');
  if (!select || !field || select.selectedIndex < 0) return;
  const index = Number(select.value);
  const phrase = PHRASES[index];
  if (!phrase) return;
  field.value = phrase;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  picker.querySelector('#mugPresetPhraseApplied').textContent = `Frase ${index + 1} aplicada.`;
}

function installPicker(panel) {
  if (!panel?.classList.contains('mugv7')) return false;
  if (panel.querySelector('#mugPresetPhrases')) return true;
  const instruction = panel.querySelector('.mugv7-instruction');
  if (!instruction) return false;
  installStyles();
  const picker = document.createElement('details');
  picker.className = 'mug-preset-phrases';
  picker.id = 'mugPresetPhrases';
  picker.open = true;
  picker.innerHTML = `
    <summary><span>200 frases prontas</span><span class="mug-preset-count" id="mugPresetPhraseCount">200/200</span></summary>
    <div class="mug-preset-body">
      <input class="mug-preset-search" id="mugPresetPhraseSearch" type="search" placeholder="Buscar frase..." autocomplete="off">
      <select class="mug-preset-category" id="mugPresetPhraseCategory" aria-label="Filtrar frases por categoria">
        ${CATEGORIES.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('')}
      </select>
      <select class="mug-preset-select" id="mugPresetPhraseSelect" size="8" aria-label="Frases prontas para caneca"></select>
      <div class="mug-preset-actions">
        <small class="mug-preset-help" id="mugPresetPhraseApplied">Selecione uma frase para preencher “Instrução complementar”.</small>
        <button class="button secondary compact" id="mugPresetPhraseClear" type="button">Limpar</button>
      </div>
    </div>`;
  instruction.insertAdjacentElement('afterend', picker);

  const search = picker.querySelector('#mugPresetPhraseSearch');
  const category = picker.querySelector('#mugPresetPhraseCategory');
  const select = picker.querySelector('#mugPresetPhraseSelect');
  search.addEventListener('input', () => renderOptions(picker));
  category.addEventListener('change', () => renderOptions(picker));
  select.addEventListener('change', () => applySelectedPhrase(panel, picker));
  select.addEventListener('dblclick', () => applySelectedPhrase(panel, picker));
  picker.querySelector('#mugPresetPhraseClear').addEventListener('click', () => {
    const field = panel.querySelector('#mugv7Instruction');
    if (field) {
      field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    select.selectedIndex = -1;
    picker.querySelector('#mugPresetPhraseApplied').textContent = 'Instrução complementar limpa.';
  });

  renderOptions(picker);
  panel.dataset.mugPresetPhrases = ACTIVE_BUILD;
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
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(() => activate(), 0), { once: true });
else setTimeout(() => activate(), 0);

export { PHRASES, CATEGORIES, installPicker };
