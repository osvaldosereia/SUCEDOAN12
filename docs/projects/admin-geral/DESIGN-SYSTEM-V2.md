# Admin Design System 2.0 — contrato de uso

## Escopo
A folha `admin/admin-design-system-v2.css` é aditiva e opt-in. Componentes V2 devem viver dentro de `.da-v2`. Durante a migração, não remover `styles.css`, `style.css`, `mobile-priority.css` ou CSS de módulo apenas para adotar V2.

## Regras visuais
- texto operacional normal: 14–16px; não introduzir controles críticos com texto de 8–10px;
- alvo de toque base: 44px; em telefone, ações principais 48px;
- inputs em telefone: 16px para evitar zoom involuntário;
- uma ação primária dominante por contexto;
- erro/perigo não depende apenas de cor;
- formulário: label visível, ajuda/erro junto ao campo e estado de alteração não salva quando necessário;
- desktop pode usar tabela; fluxos principais precisam de representação em cards/lista no mobile;
- editor complexo: dialog/painel no desktop e fullscreen no telefone;
- filtros densos no mobile podem migrar para drawer/bottom-sheet;
- respeitar safe-area e `prefers-reduced-motion`.

## Componentes V2
Layout: `da-container`, `da-stack`, `da-cluster`, `da-grid`, `da-card`.

Ações: `da-btn`, `da-btn-primary`, `da-btn-danger`, `da-btn-quiet`, `da-sticky-actions`.

Formulários: `da-field`, `da-label`, `da-input`, `da-select`, `da-textarea`, `da-field-help`, `da-field-error`, `da-form-dirty`.

Navegação/filtros: `da-toolbar`, `da-toolbar-search`, `da-toolbar-actions`, `da-filter-chip`, `da-tabs`, `da-tab`, `da-tab-panel`.

Estado/feedback: `da-badge-*`, `da-state`, `da-alert`, `da-skeleton`, `da-toast-region`, `da-toast`.

Superfícies: `da-table`, `da-mobile-list`, `da-dialog`, `da-drawer`, `da-bottom-sheet`.

## Coexistência com legado
1. V2 não estiliza `body`, `button`, `input` ou tabelas globalmente.
2. O Shell R3 será o primeiro consumidor controlado.
3. Módulos migram por superfície; CSS legado só sai após equivalência visual/funcional comprovada.
4. `mobile-priority.css` não deve receber novas regras gerais; correções novas devem preferir V2 ou CSS específico do módulo.
5. Páginas antigas de Inteligência/Aprendizados serão migradas em sua rodada funcional, não antecipadamente.

## Breakpoints de referência
- >900px: desktop amplo;
- 621–900px: tablet/notebook compacto;
- <=620px: telefone e representação mobile.

Breakpoints específicos de módulo só são aceitáveis quando o conteúdo exigir, não para reconstruir outro design system paralelo.

## Acessibilidade
Usar controles nativos, `aria-selected` em tabs, `aria-pressed` em filtros alternáveis, `aria-invalid` em campos inválidos e região `aria-live` para feedback dinâmico. Foco visível é obrigatório.
