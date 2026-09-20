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

## R1–R7 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho, Produtos/Categorias/Vitrine, Estoque/Gôndolas/Validade/Balanço e Cestas concluídos com migração aditiva e contratos reais preservados.
- Central Comercial permanece dormente por `commercialTruthUiEnabled=false`.
- Nenhum gate externo/runtime foi aberto pela migração.

## R8 — lotes 1–2 concluídos
- preflight do lote 2 partiu do HEAD `aaace715e2509acee6c84a4ed6e1e7888ef6d0ce`; compare com `main` confirmou branch 124 commits à frente e 0 atrás, merge-base `c635df8` igual ao HEAD de main, sem divergência paralela relevante;
- inventário confirmou duas ferramentas especializadas existentes: `admin/nomes-produtos.html` para normalização/revisão de nomes e `admin/imagens-ia.html` para automação/triagem de imagens;
- Nomes mantém comparação Era/Ficou, revisão humana, estados de fila e consulta manual; Imagens mantém triagem, comparação Original/Referência vs Gerada/Candidata, sessão Admin e ações explícitas;
- `admin-catalog-quality-v2.js/css` continua como hub aditivo dentro de Produtos, sem fetch, persistência ou IA próprios;
- `product-name-management.css` foi endurecido para desktop estreito/mobile: filtros empilháveis, inputs 16px, ações >=44/48px, nomes longos sem overflow, cards/revisões em coluna e ações de decisão full-width no celular;
- `image-automation.css` foi endurecido para touch/mobile: alvos >=44px, seleção maior, controles responsivos, textos/erros sem overflow e diálogo de reparo fullscreen com safe-area em telas pequenas;
- nenhuma semântica de API, autenticação, custo ou geração foi alterada; `image-automation.js` continua autoridade funcional e já mantém `setBusy`/sessão/ações explícitas;
- `tests/admin-r8-catalog-quality-v2-contract.test.mjs` permanece como contrato do hub; validação deste lote foi estática/contratual pelo código versionado;
- nenhuma geração de imagem, normalização ou escrita real foi disparada.

## R8 — próximo lote
1. revisar guardas contra repetição nas ações de Nomes e Imagens sem executar IA; adicionar apenas onde a autoridade funcional ainda permitir duplo acionamento;
2. avaliar indicador de completude somente a partir de dados reais já carregados no Admin, sem criar backend ou score fictício;
3. revisar contrato R8 para cobrir os novos requisitos mobile/touch e controle explícito de custo;
4. quando os critérios seguros de R8 estiverem satisfeitos, marcar DONE e promover R9 — Pedidos.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não disparar geração paga/IA apenas para testar UI;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar pedido/cliente/publicação real como teste.
