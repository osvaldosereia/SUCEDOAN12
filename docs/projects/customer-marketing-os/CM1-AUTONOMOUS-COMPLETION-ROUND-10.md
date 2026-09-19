# CM-1 AUTONOMOUS COMPLETION — ROUND 10

Data: 19/09/2026 ~04:20 America/Cuiaba.

## Objetivo

Esgotar tecnicamente Comprar / Product View / Event Collector sem fabricar `product_view` operacional.

## Estado canônico revalidado

RPCs `cm1_homologation_readiness_v1()` e `cm1_homologation_evidence_summary_v1()` reexecutados antes das mudanças:

- safe_for_internal_homologation=true;
- external_activation_authorized=false;
- external_side_effect=false;
- identity conflicts=2;
- catalog_open=64;
- catalog_search=50;
- product_view=0;
- opportunity suppressed=75; lifecycle fechado=0;
- AI executions=0 / custo=0;
- Meta Direct/canonical outbound/publishing/AI permanecem OFF.

HEAD inicial observado: `632858d38f47a1f1765119d9f6d31a06c0326f8c` (`docs(customer-os): handoff after round 09`).

## Auditoria técnica

O caminho de produção está completo:

1. cards reais chamam `openDetail(product)` por imagem ou título;
2. `openDetail` chama `trackProductView(product,'product_detail')`;
3. produto sem `id` não gera tracking;
4. `productApi('track')` envia pelo room token existente;
5. Edge exige token válido, sessão existente/aberta/não expirada e UUID válido para Product View;
6. Edge chama somente o RPC server-side `record_catalog_interaction_v1`;
7. RPC exige produto existente e sessão válida;
8. dedupe de Product View = 900 s, cobrindo reload/reabertura/navegação repetida;
9. evento persiste `collector_version=cm1-catalog-interactions-v1` e `external_side_effect=false`;
10. função RPC permanece service_role-only.

O `comprar/index.html` referencia explicitamente `products.js?v=20260918-cm1-events-02`, portanto há cache busting do asset instrumentado no HTML versionado. A verificação HTTP pública externa não ficou disponível pelo navegador de pesquisa desta execução; isso não altera a prova do artefato versionado e deve ser considerado observação de deploy, não motivo para fabricar evento.

## Hardening entregue

Criado `scripts/test-cm-1-product-view-round10.mjs`, cobrindo por contrato:

- dois gatilhos reais de detalhe;
- ausência de tracking sem produto/id;
- cadeia Product View -> collector;
- room token e sessão ativa;
- UUID obrigatório;
- produto inexistente rejeitado no RPC;
- sessão expirada rejeitada;
- dedupe 900 s para reload/navegação;
- fingerprint/collector version;
- `external_side_effect=false`;
- ausência de chamadas Graph/OpenAI no browser desse caminho.

Criado workflow dedicado `.github/workflows/customer-os-product-view-round10.yml`, que executa o teste já existente de interações e o novo contrato Round 10 em Node 22.

## Conclusão

Rodada 10 concluída. Não foi criado nenhum `product_view` artificial e o critério 7 permanece `implemented`, aguardando exclusivamente uma abertura orgânica real de produto no Comprar. Nenhum gate externo foi alterado.

Próxima rodada: **11 — Opportunity Lifecycle e observabilidade temporal**.
