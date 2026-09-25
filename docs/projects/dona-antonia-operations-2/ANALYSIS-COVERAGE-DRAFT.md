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
| PapoAI | avançada | ANALYSIS-NOTES | nova ponte mínima |
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
| Fiscal | bloqueada parcialmente | FINANCE-PAYMENT-DELIVERY | MT + pagamento na entrega |
| Financeiro | avançada | FINANCE-PAYMENT-DELIVERY | contas/portadores reais |
| Expedição | avançada | OPERATIONS-EXPEDITION | gate fiscal |
| Rota/entregador | avançada | DELIVERY-ROUTES | provedor/POC |
| Control Tower | avançada | CONTROL-TOWER | ledger final |
| IA/OpenAI | avançada | AI-OBSERVABILITY | permissões/custos |
| Segurança/perfis | avançada | SECURITY-PERMISSIONS | POC usuários |
| Webhooks | avançada | RELIABILITY-WEBHOOKS | ativação/homologação |
| Exceções | avançada | EXCEPTION-RECOVERY | revisão cruzada |
| Estado do pedido | avançada | ORDER-STATE-MACHINE | mapear Bling |
| Limpeza legado | pausada | RUNTIME-INVENTORY | após substituição |
| Documentação | avançada | HANDOFF / CURRENT-STATE | consolidar PROJECT-MASTER |

## Restantes antes do Projeto Final
1. fechar fiscal/pagamento na entrega;
2. fechar PapoAI confirmação/cancelamento/localização;
3. fechar oferta/validade usando lotes Bling;
4. fechar cesta personalizada no Bling;
5. fechar ledger/Control Tower;
6. revisar custos/limites;
7. revisar rollback/segurança;
8. ordenar POCs/homologação;
9. então escrever PROJECT-MASTER final.
