# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R8 — Imagens, nomes e qualidade do catálogo.
Execução autônoma: autorizada.
Efeitos externos novos: proibidos sem gate/evidência específica.

## Estado das rodadas
- R1: DONE
- R2: DONE
- R3: DONE
- R4: DONE
- R5: DONE
- R6: DONE
- R7: DONE
- R8: IN_PROGRESS
- R9–R16: PENDING

## R1–R6 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho, Produtos/Categorias/Vitrine e Estoque/Gôndolas/Validade/Balanço concluídos com migração aditiva e contratos reais preservados.
- Nenhum gate externo/runtime foi aberto pela migração.

## R7 — concluída
- preflight final partiu do HEAD `9c151f9cbe534cfe6c3832fda78a8019db832fb8`; branch estava 114 commits à frente e 0 atrás de `main`, com merge-base `c635df8` igual ao HEAD de main;
- Cestas mantém os contratos reais `baskets`, `basket`, `save_basket`, `add_basket_item`, `update_basket_item` e `remove_basket_item`;
- `admin-baskets-v2.js/css` mantém resumo DOM-only, cards mobile, labels contextuais, touch >=44px e safe-area;
- `basket-editor.js` recebeu busy guard reutilizável para buscar/adicionar/atualizar/remover/salvar, bloqueando duplo acionamento sem alterar API; botões expõem `aria-busy` e feedback textual durante a operação;
- composição passou a mostrar quantidade de produtos/unidades e deixa explícito que o preço comercial da cesta permanece separado dos componentes;
- Central Comercial foi inventariada em read-only: código existente oferece dashboard/preview FEFO/preview margem/rascunhos DRAFT/kill switch, mas o mount continua condicionado a `commercialTruthUiEnabled=false`; nenhuma ativação foi feita;
- teste `tests/admin-r7-baskets-v2-contract.test.mjs` ampliado para guardas, semântica DRAFT/preview e gate comercial fechado;
- R7 concluída sem pedido, cesta, produto ou dado real usado como teste.

## R8 — lote 1 iniciado
- inventário confirmou duas ferramentas especializadas existentes: `admin/nomes-produtos.html` para normalização/revisão de nomes e `admin/imagens-ia.html` para automação/triagem de imagens;
- Nomes já possui comparação Era/Ficou, revisão humana e estados de fila; Imagens já possui triagem, comparação Original/Referência vs Gerada/Candidata e ações manuais;
- criado `admin-catalog-quality-v2.js/css`, hub aditivo dentro de Produtos que organiza Nomes, Imagens e Cadastro sem executar fetch, persistência ou IA;
- o hub declara explicitamente que ações com IA ou mutação continuam dependendo de comando humano nas ferramentas especializadas;
- criado `tests/admin-r8-catalog-quality-v2-contract.test.mjs` para wiring, ausência de runtime paralelo, preservação do controle humano e responsividade;
- validação desta execução foi estática/contratual pelo código versionado; nenhuma geração de imagem, normalização ou escrita real foi disparada.

## R8 — próximo lote
1. revisar a experiência mobile/desktop real de `nomes-produtos.html` e `imagens-ia.html`, preservando suas APIs e custos sob comando explícito;
2. reforçar estados busy/erro/seleção onde houver risco de acionamento repetido, sem rodar IA como teste;
3. avaliar score/indicadores de completude somente com dados já disponíveis, sem inventar métricas/backend;
4. quando os critérios seguros de R8 estiverem satisfeitos, marcar DONE e promover R9 — Pedidos.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não disparar geração paga/IA apenas para testar UI;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
