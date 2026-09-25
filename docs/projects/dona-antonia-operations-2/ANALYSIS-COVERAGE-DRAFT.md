# Dona Antônia Operations 2.0 — Cobertura da Análise (DRAFT)

> Checklist antes do Projeto Final.
> Última atualização: 2026-09-25.

## Critério
Nenhuma programação de produção antes de todos os domínios estarem analisados, fontes de verdade fechadas, contradições mapeadas e POCs/gates definidos.

## Cobertura

| Domínio | Estado | Principal referência | Bloqueador restante |
|---|---|---|---|
| Arquitetura geral | avançada | AUDIT-MATRIX / SOURCE-OF-TRUTH | revisão cruzada |
| Eficiência/custos | avançada | ARCHITECTURE-EFFICIENCY | POCs |
| Site/checkout | avançada | WORKFLOW / AUDIT | revisão final |
| Cestas | avançada | AUDIT | representação final no Bling |
| Pedido multicanal | avançada | ANALYSIS-NOTES | POC PapoAI/manual |
| Cliente/CPF/endereço | avançada | CUSTOMER-IDENTITY | política final |
| PapoAI | avançada | PAPOAI-BRIDGE-FINAL | POC do payload real |
| Bling pedido/status | avançada | RELIABILITY-WEBHOOKS | escopo situacoes/modulos |
| Estoque | avançada | INVENTORY / SOURCE-OF-TRUTH | POC |
| Balanço | avançada | INVENTORY-COUNT-BALANCE | teste leitor/tablet |
| Gôndola/prateleira | avançada | WORKFLOW | completar localização |
| Compras/XML | avançada | PURCHASES-XML-INVENTORY | POC SEFAZ/Check-in |
| Caixa->unidade | avançada | PURCHASES-XML-INVENTORY | testar fatores |
| Lotes/validade | avançada | PURCHASES-XML-INVENTORY | POC |
| Ofertas por validade | média/avançada | SOURCE-OF-TRUTH | propagação de preço |
| Separação | avançada | OPERATIONS-EXPEDITION | POC Checkout |
| Impressão 85 mm | avançada | WORKFLOW | POC QZ/agente |
| Conferência | avançada | OPERATIONS-EXPEDITION | POC tablet |
| Fiscal | avançada | FISCAL-HOME-DELIVERY-RESOLUTION | homologação contábil dos campos NF-e |
| Financeiro | avançada | FINANCE-PAYMENT-DELIVERY | contas/portadores reais |
| Expedição | avançada | OPERATIONS-EXPEDITION | gate fiscal |
| Rota/entregador | avançada | DELIVERY-ROUTES | provedor/POC |
| Control Tower | avançada | CONTROL-TOWER-DATA-MODEL | POC |
| IA/OpenAI | avançada | AI-OBSERVABILITY | permissões/custos |
| Segurança/perfis | avançada | SECURITY-PERMISSIONS | POC usuários |
| Webhooks | avançada | RELIABILITY-WEBHOOKS | ativação/homologação |
| Exceções | avançada | EXCEPTION-RECOVERY | revisão cruzada |
| Cancelamentos/devoluções/perdas | avançada | SALES-CANCELLATIONS-RETURNS / STOCK-LOSS-DISCARD-FISCAL-ORIGIN | homologação contábil |
| Origem fiscal CPF/CNPJ | avançada | STOCK-LOSS-DISCARD-FISCAL-ORIGIN | política do contador |
| Estado do pedido | avançada | ORDER-STATE-MACHINE | mapear Bling |
| Limpeza legado | pausada | RUNTIME-INVENTORY | após substituição |
| Documentação | avançada | HANDOFF / CURRENT-STATE | consolidar PROJECT-MASTER |

## Situação após revisão ampla
A arquitetura conceitual está praticamente fechada. Os itens restantes são majoritariamente homologações, não lacunas de desenho.

### Gates antes do Projeto Final definitivo
1. validar com contador a aplicação concreta da Portaria 262/2023 à empresa, campos de pagamento da NF-e, política fiscal das cestas, CFOP 5.927/perdas, devoluções/retornos e regularização das compras em CPF;
2. confirmar no Bling o escopo de Situações/usuários;
3. POC física de tablet/leitores/impressora/POS;
4. POC do payload real PapoAI;
5. então consolidar o PROJECT-MASTER final, sem descobrir arquitetura durante a programação.

Ver também:
- FISCAL-HOME-DELIVERY-RESOLUTION-DRAFT.md
- PAPOAI-BRIDGE-FINAL-DRAFT.md
- CONTROL-TOWER-DATA-MODEL-DRAFT.md
- COST-CAPACITY-DRAFT.md
- POC-CUTOVER-PLAN-DRAFT.md
- FINAL-CROSS-REVIEW-DRAFT.md
