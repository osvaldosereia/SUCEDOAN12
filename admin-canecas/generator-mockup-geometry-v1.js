(() => {
  'use strict';

  const BUILD = '20260903-admin-canecas-mockup-geometry-v1';
  if (window.__CF_ADMIN_MUG_MOCKUP_GEOMETRY__ === BUILD) return;

  // Contrato físico usado pelo mockup. O arquivo mestre continua com 2400×960 px
  // para 24 × 9,5 cm; a faixa efetivamente visível é interrompida junto à alça.
  const GEOMETRY = Object.freeze({
    masterWidthPx: 2400,
    masterHeightPx: 960,
    masterWidthMm: 240,
    masterHeightMm: 95,
    mugCircumferenceMmApprox: 260,
    effectivePrintArcMmApprox: 235,
    handleGapMmApprox: 25,
    referenceWindowPx: 1344,
  });

  const COMMON = [
    'Use a imagem de referência como uma JANELA DE UMA ARTE HORIZONTAL CONTÍNUA já posicionada no arquivo de impressão; ela NÃO é um logotipo isolado para ser centralizado.',
    'A caneca é um cilindro de porcelana de aproximadamente 350 ml. A faixa de impressão envolve quase toda a circunferência, mas existe uma zona sem impressão junto à alça e às duas junções da alça.',
    'MAPEAMENTO OBRIGATÓRIO: preserve rigorosamente a coordenada horizontal, a escala relativa e a ordem esquerda→direita de todos os elementos da referência. NÃO mova o assunto principal para o centro só para deixar a fotografia mais bonita.',
    'O CENTRO horizontal da imagem de referência deve coincidir com o centro da face cilíndrica visível nesta vista. O conteúdo próximo às bordas da referência deve acompanhar a curvatura, ficar progressivamente comprimido/foreshortened e poderá desaparecer naturalmente ao contornar a lateral da caneca.',
    'Não estique a arte para preencher a caneca, não recorte novamente a composição, não aumente personagens, textos ou logos e não repita elementos para preencher espaço.',
    'A estampa deve seguir a superfície curva da porcelana com perspectiva e oclusão físicas: centro mais frontal, laterais recuando; nenhuma parte da arte pode atravessar a alça, aparecer sobre a alça ou sobre as junções da alça.',
    'Mantenha pequena margem física natural no topo e na base da área sublimável. A arte não deve parecer um adesivo plano flutuando sobre a caneca.',
    'NÃO espelhe, NÃO inverta horizontalmente, NÃO redesenhe, NÃO reescreva textos, NÃO altere cores, NÃO invente símbolos e NÃO reposicione elementos internos da arte.',
    'Fotografia quadrada 1:1 de e-commerce, caneca branca de porcelana 350 ml, ângulo 3/4 realista, iluminação suave de estúdio e fundo claro simples.',
  ];

  const HANDLE_LEFT = [
    ...COMMON,
    'VISTA 1 — ALÇA À ESQUERDA: a alça deve aparecer claramente à esquerda. Esta vista corresponde ao INÍCIO da arte horizontal / lado esquerdo do wrap.',
    'A borda esquerda do wrap é a região mais próxima da zona sem impressão da alça; portanto ela deve curvar para trás em direção à alça, e não ser trazida para o centro da frente da caneca.',
    'Mostre somente o que seria fisicamente visível deste lado do cilindro. Não puxe conteúdo do final/lado direito do wrap para esta face.',
  ].join(' ');

  const HANDLE_RIGHT = [
    ...COMMON,
    'VISTA 2 — ALÇA À DIREITA: a alça deve aparecer claramente à direita. Esta vista corresponde ao FINAL da arte horizontal / lado direito do wrap.',
    'A borda direita do wrap é a região mais próxima da zona sem impressão da alça; portanto ela deve curvar para trás em direção à alça, e não ser trazida para o centro da frente da caneca.',
    'Mostre somente o que seria fisicamente visível deste lado do cilindro. Não puxe conteúdo do início/lado esquerdo do wrap para esta face.',
  ].join(' ');

  function parseFinalize(init) {
    if (String(init?.method || 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') return null;
    if (!init.body.includes('finalize_mug_product')) return null;
    try {
      const outer = JSON.parse(init.body);
      const payload = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      if (payload?.action !== 'finalize_mug_product' || !payload?.request_id) return null;
      return { outer, payload };
    } catch {
      return null;
    }
  }

  function rewrite(init, parsed) {
    const payload = {
      ...parsed.payload,
      prompt_mockup_1: HANDLE_LEFT,
      prompt_mockup_2: HANDLE_RIGHT,
      mockup_orientation_contract: 'handle_left=art_start|handle_right=art_end',
      mockup_geometry_contract: 'cylindrical_wrap_preserve_absolute_x_no_recentering',
      mockup_geometry_version: BUILD,
      mockup_geometry_json: JSON.stringify(GEOMETRY),
      mockup_reference_semantics: 'each reference is an unwrapped cylindrical window; map full width 1:1; center of reference=center of visible mug face',
      mockup_forbid_recentering: true,
      mockup_forbid_handle_print: true,
    };
    const nextOuter = { ...parsed.outer };
    nextOuter.payload = typeof parsed.outer?.payload === 'string' ? JSON.stringify(payload) : payload;
    return { ...init, body: JSON.stringify(nextOuter) };
  }

  const previousFetch = window.fetch.bind(window);
  window.fetch = function geometryAwareFetch(input, init) {
    const parsed = parseFinalize(init);
    if (!parsed) return previousFetch(input, init);
    return previousFetch(input, rewrite(init, parsed));
  };

  window.__CF_ADMIN_MUG_MOCKUP_GEOMETRY__ = BUILD;
  window.__CF_ADMIN_MUG_MOCKUP_GEOMETRY_CONTRACT__ = GEOMETRY;
  document.documentElement.dataset.mugMockupGeometry = BUILD;
  console.info('[Admin Canecas] contrato geométrico de mockup ativo:', BUILD, GEOMETRY);
})();
