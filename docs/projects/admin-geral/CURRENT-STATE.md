# CURRENT STATE — Admin Geral

Atualizado: 2026-09-20
Branch: `admin-geral-r1-r16-autonomous-20260919`
Fase: R9 — Pedidos e operação de venda.
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
- R9: IN_PROGRESS
- R10–R16: PENDING

## R1–R8 — concluídas
- Fundação/inventário, Design System V2, Shell/responsividade, Central de Trabalho, Produtos/Categorias/Vitrine, Estoque/Gôndolas/Validade/Balanço, Cestas e Qualidade do Catálogo concluídos com migração aditiva e contratos reais preservados.
- Central Comercial permanece dormente por `commercialTruthUiEnabled=false`.
- R8 consolidou Cadastro/Nomes/Imagens, mobile/touch e proteção de repetição em ações de Imagens; geração/custo continuam explícitos e nenhuma IA foi disparada para homologar UI.
- Nenhum gate externo/runtime foi aberto pela migração.

## R9 — lote 1 concluído
- preflight partiu do HEAD `a98130ace18fdefb59883f1c6025bcf40d05b0b1`; compare com `main` confirmou branch 129 commits à frente e 0 atrás, merge-base `c635df8` igual ao HEAD de main, sem divergência paralela relevante;
- inventário confirmou `pedidos-v2.js` como autoridade funcional: list/detail, impressão completa, PDF via impressão do navegador, etiqueta, WhatsApp e leitura do estado/sync existentes;
- criado `admin-orders-r9-v2.js/css` como camada DOM-only: referência visual Recebido → Separação → Conferência → Pronto → Rota → Entregue e transformação da tabela em cards no mobile;
- ações existentes permanecem sob `pedidos-v2.js`; a camada R9 não possui fetch/storage/persistência próprios;
- touch >=44px, inputs mobile >=16px e ações em grade foram adicionados sem alterar backend;
- criado `tests/admin-r9-orders-v2-contract.test.mjs` para wiring, autoridade funcional, ausência de persistência paralela e contrato mobile;
- nenhuma criação/alteração de pedido, WhatsApp outbound, Bling real ou outra integração externa foi executada.

## R9 — próximo lote
1. revisar detalhe do pedido e estados operacionais reais disponíveis no backend antes de qualquer ação de mudança de status;
2. reforçar guardas contra duplo acionamento em impressão/PDF/etiqueta e demais ações que permitam repetição acidental;
3. melhorar filtros/visões salvas somente se puderem reutilizar os parâmetros reais list/status/source já suportados;
4. manter Bling real e WhatsApp outbound protegidos; não criar transição fictícia de status;
5. quando os critérios seguros de R9 estiverem satisfeitos, marcar DONE e promover R10 — Clientes / Customer 360.

## Não fazer
- não ativar Meta/WhatsApp/Marketing publishing;
- não liberar outbound/canary automaticamente;
- não disparar geração paga/IA apenas para testar UI;
- não usar Make como novo runtime;
- não alterar App Dona Antônia isolado;
- não apagar módulos/CSS legados antes da migração e validação;
- não criar ou alterar pedido/cliente/publicação real como teste.
