# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R10 — Clientes, identidade e Customer 360.
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
- R8: DONE
- R9: DONE
- R10: IN_PROGRESS
- R11–R16: PENDING

## R1–R8 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho, Produtos/Categorias/Vitrine, Estoque/Gôndolas/Validade/Balanço, Cestas e Qualidade do Catálogo concluídos com migração aditiva e contratos reais preservados.
- Central Comercial permanece dormente por `commercialTruthUiEnabled=false`.
- Nenhum gate externo/runtime foi aberto pela migração.

## R9 — concluída
- preflight do lote final: HEAD inicial `6b34ec1962bf09c51d5080e25feafbde5ccc69d1`; branch 138 commits à frente e 0 atrás de `main`; merge-base `c635df8` igual ao HEAD de main, sem divergência paralela relevante;
- `pedidos-v2.js` permanece autoridade funcional para listagem, detalhe, impressão completa, PDF via impressão do navegador, etiqueta e leitura de status/sync;
- backend `admin-orders-comprar-v1` foi revisado: expõe somente `health`, `list` e `detail`; não existe contrato de mudança de status nessa função, portanto a UI não inventa transições;
- `admin-orders-r9-v2.js/css` mantém referência visual do fluxo e cards mobile sem fetch/storage/persistência próprios;
- ações repetíveis de abrir/imprimir/PDF/etiqueta/atualizar/paginar/buscar ganharam cooldown/busy guard puramente de UI contra duplo acionamento;
- teste contratual R9 ampliado para proteger os guardas e ausência de transições fictícias;
- Bling, WhatsApp outbound, criação/alteração de pedidos e demais efeitos externos não foram acionados.

## R10 — ponto de retomada
1. inventariar superfícies reais de Clientes/Customer 360 e os contratos existentes de identidade antes de editar;
2. preservar a separação do projeto Customer & Marketing OS e seus gates/canaries; Admin Geral pode melhorar shell/usabilidade sem assumir autoridade funcional indevida;
3. não testar PIN, não resolver conflito de identidade real automaticamente e não fabricar consentimento/evidência;
4. priorizar leitura segura, clareza de identidade, histórico e mobile/desktop sobre contratos existentes;
5. manter qualquer mutação sensível ou efeito externo atrás dos gates existentes.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não disparar geração paga/IA apenas para testar UI;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar ou alterar pedido/cliente/publicação real como teste;
- não testar PIN administrativo nem resolver identidade real sem evidência/ação humana exigida.
