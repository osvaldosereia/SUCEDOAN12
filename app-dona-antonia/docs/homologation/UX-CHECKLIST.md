# UX & Accessibility Checklist — App Dona Antônia HML

**Estado:** homologação  
**Atualizado:** 18/09/2026

## Validado por código/testes

- [x] largura mínima de 320 px;
- [x] layout mobile-first;
- [x] safe areas;
- [x] foco visível via `:focus-visible`;
- [x] alvos principais e controles de toque críticos com altura mínima explícita de 44 px;
- [x] conversa com `aria-live="polite"`;
- [x] regiões principais com labels;
- [x] aviso offline anunciado com `role="status"`;
- [x] `prefers-reduced-motion`;
- [x] `prefers-contrast: more`;
- [x] suporte a `forced-colors`;
- [x] autocomplete de nome, telefone e endereço;
- [x] inputmode de telefone e número;
- [x] chips usam `aria-pressed`;
- [x] botões de quantidade possuem labels;
- [x] texto não depende exclusivamente de cor para estado;
- [x] conteúdo em cache permanece visível com aviso offline;
- [x] budgets internos definidos para primeira renderização, transição de rota e tamanhos de bundle/assets;
- [x] evaluator de budget falha fechado para métricas inválidas.

## Ainda exige ambiente/browser/aparelho real

- [ ] zoom/fonte grande a 200%;
- [ ] teclado virtual Android;
- [ ] teclado virtual iOS;
- [ ] VoiceOver em iPhone;
- [ ] TalkBack em Android;
- [ ] navegação por teclado em browser real;
- [ ] contraste medido por ferramenta automatizada;
- [ ] aparelho Android de entrada;
- [ ] rotação/reflow;
- [ ] primeira renderização medida contra o budget interno;
- [ ] transição de rota medida contra o budget interno;
- [ ] bundle final medido após build Vite contra os budgets definidos;
- [ ] APK/AAB final medido.

## Gate

A Rodada 23 permanece parcial até os testes em browser e aparelhos reais serem executados.
