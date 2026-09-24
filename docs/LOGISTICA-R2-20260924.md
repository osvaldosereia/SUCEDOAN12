# Logística R2 — READY, snapshot e roteirização

Rodada executada em 24/09/2026.

## Banco canônico

Aplicado em `ssbesxgaijknwsjbsbcz`:

- `delivery_jobs.address_snapshot_fingerprint`: fingerprint do snapshot logístico.
- `delivery_jobs.coordinate_provenance`: provenance estruturada das coordenadas.
- `delivery_jobs.source_order_updated_at` e `source_location_confirmed_at`: âncoras temporais do snapshot.
- `delivery_job_routing_eligibility_v2`: gate de elegibilidade de jobs existentes.
- `ready_order_logistics_eligibility_v2`: gate que integra diretamente o `customer_pin` persistido pela R1 no `orders.delivery_address`.
- `google_routing_dispatch_readiness_v1`: readiness fail-closed para Google Routes / Route Optimization.

## Estado seguro

A configuração logística permaneceu inalterada: `enabled=false`, `execution_mode=off`, `routing_enabled=false`, `external_provider_enabled=false`, `provider_name=none` e orçamento externo R$ 0,00.

Assim, nenhuma chamada paga foi executada. O gate Google exige simultaneamente runtime liberado, roteirização liberada, provider externo liberado, modo homologation/canary/live, provider Google explícito e orçamento maior que zero.

## Integração R1 → R2

O localizador recebido pelo WhatsApp/PapoAI na R1 grava `latitude`, `longitude`, `coordinate_source=customer_pin`, `coordinate_confidence=1.0` e confirmação no snapshot do pedido. A view de elegibilidade R2 consome exatamente esses campos. Pedido READY sem coordenada/provenance confiável fica fora da roteirização, sem fallback silencioso.

## Provider Google

A arquitetura-alvo ficou definida em duas opções:

- Google Routes API para cálculo de rota/ETA e sequência simples.
- Google Route Optimization API para otimização de frota/múltiplos veículos.

O dispatcher externo permanece propositalmente não liberado até a R4. A Route Optimization exige projeto Google Cloud com billing/API habilitada e OAuth; Routes aceita API key ou OAuth. Credenciais não ficam no repositório.

## Evidência

No fechamento da R2: `dispatch_gate_open=false`, zero jobs elegíveis, zero pedidos READY elegíveis e zero chamadas externas recentes. Existe um pedido READY legado sem coordenadas, corretamente bloqueado para roteirização.
