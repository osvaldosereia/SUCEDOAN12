# Operations 2.0 — R11 · Ensaio integrado controlado

Data: 2026-09-26
Status: ensaio integrado concluído sem mutar pedidos históricos e sem disparar efeitos externos reais.

## Escopo
Site -> checkout -> pedido -> reserva/estoque -> Bling -> conferência EAN -> fiscal -> expedição -> rota -> entregador -> pagamento -> entrega/retorno.

A validação foi feita por contratos, triggers, tabelas operacionais, estados existentes e read models. Bling/SEFAZ/entrega real não foram acionados artificialmente.

## Baseline
87 pedidos:
- 24 storefront_received
- 33 confirmed
- 1 ready
- 28 delivered
- 1 cancelled

Reservas:
- 15 linhas reserved
- 107 released

Módulos novos ainda sem evidência operacional real:
- 0 sessões de conferência EAN
- 0 delivery stops
- 0 payment settlements
- 0 return cases

Fiscal:
- controles existentes incluem estados pending/blocked/ready e 2 evidências com SEFAZ Autorizada/dispatch authorized.

## Gap de observabilidade Bling
27 pedidos possuem bling_order_id.
0 pedidos possuem bling_synced_at.

Conclusão: bling_order_id histórico não pode ser tratado como prova suficiente de sincronização pelo fluxo novo.
Não houve backfill nem alteração de histórico.

## Gap de evidência EAN
O modelo novo possui gate de conferência, mas não há sessões registradas ainda.
Pedidos antigos ready/delivered podem anteceder esse modelo.
Não houve criação retroativa de sessões falsas.

## Read model R11
Migration ops2_r11_integrated_readiness_v1 criou:
- view interna ops2_integrated_order_readiness_v1;
- função ops2_integrated_readiness_summary_v1().

Classificações:
- sync_proven;
- bling_id_without_sync_proof;
- sync_state_without_timestamp;
- legacy_or_missing_ean_evidence;
- legacy_or_missing_fiscal_evidence;
- legacy_or_missing_payment_evidence;
- consistent_with_current_evidence.

Sem grants para anon/authenticated.

Snapshot pós-migration:
- 87 pedidos;
- 27 bling_id_without_sync_proof;
- 29 legacy_or_missing_ean_evidence;
- 0 legacy_or_missing_fiscal_evidence pelo critério aplicável;
- 0 legacy_or_missing_payment_evidence pelo critério aplicável;
- 58 consistent_with_current_evidence.

## Gates integrados confirmados
- checkout/reserva: estrutura de vitrine_stock_reservations presente e ativa;
- pedido: estados canônicos presentes;
- Bling: idempotência/Hub existentes, workers globais antigos continuam desligados;
- EAN: trigger impede ready sem conferência para fluxo sujeito ao gate;
- fiscal: triggers impedem expedição sem autorização aplicável;
- entrega: estrutura de rota/stop preparada;
- pagamento: settlement/split preparado e gate de delivered preservado;
- retorno: retorno/revisão separado de restauração automática de estoque;
- XML/compras: cron diário separado do fluxo de venda;
- Make: nenhuma dependência nova.

## Decisão sobre legado
Pedidos históricos são somente leitura.
Ausência de evidência em módulos introduzidos depois não será “corrigida” com dados inventados.
Read models distinguem legado de fluxo novo para não produzir falso alarme nem falsa garantia.

## Ações humanas acumuladas — pós-R12
Executar um canário real completo com um pedido novo:
1. abrir catálogo por link de teste;
2. checkout;
3. confirmar pedido;
4. confirmar criação/sincronização Bling;
5. separar e conferir todos os EAN;
6. emitir/autorizar NF-e;
7. liberar expedição;
8. montar rota;
9. abrir no celular do entregador;
10. registrar pagamento real, incluindo teste split se apropriado;
11. concluir entrega;
12. executar segundo canário de não-entrega/retorno;
13. confirmar reconciliação final Bling x Dona Antônia.

Nenhuma dessas ações foi antecipada na R11 porque envolve efeitos reais.

## Gate R11
PASS para arquitetura, gates e observabilidade integrada.
PENDENTE somente homologação física/externa real, deliberadamente acumulada para pós-R12.

## Próximo passo
R12: fechamento técnico, inventário final, regressões, documentação canônica, lista única de ações humanas, critérios de aceite e plano pós-homologação.
