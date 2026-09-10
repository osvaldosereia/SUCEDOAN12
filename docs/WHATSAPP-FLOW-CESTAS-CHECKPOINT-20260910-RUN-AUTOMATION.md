# WhatsApp Flow Cestas — checkpoint 2026-09-10

## Escopo desta rodada

Auditoria do estado real do Flow comercial após as evoluções posteriores ao Run 10, com foco em confirmar a base estável, o pipeline de imagens e os gates de segurança antes de qualquer homologação real.

## Estado atual confirmado

O candidato mais novo é `flow-cestas-comercial-v8-stable`, com `provider_id=2579927222524475`, `status=ready`, `meta_status=DRAFT`, sem exposição a clientes e sem criação automática de novas sessões.

O artefato visual associado é `whatsapp/flows/flow-cestas-comercial-v31-stable-text-products.json`. A definição registra validação Meta sem erros e runtime comercial V22.

A Edge Function `whatsapp-flow-data-exchange-v1` está implantada na versão 43 e encaminha `flow-cestas-comercial-v8-stable` para `handle_whatsapp_flow_commercial_exchange_v22`.

## Pipeline de imagens

A pendência antiga de WebP/AVIF já possui pipeline próprio no repositório:

- `.github/workflows/build-whatsapp-flow-images.yml`;
- `scripts/sync-whatsapp-flow-assets.py`.

O pipeline converte as imagens para JPEG leve, preserva os originais e grava no bucket público `whatsapp-flow-assets`.

Auditoria do Storage nesta rodada:

- 9 imagens de cestas em `baskets/`;
- 319 imagens de produtos em `products/`;
- atualização mais recente observada em 2026-09-09 19:31:45 UTC.

A Edge V43 usa somente esse cache compatível para imagens de Flow. Nas telas de seleção de produtos do candidato estável, imagens de navegação foram removidas para manter o payload pequeno; a imagem aparece na tela de detalhe do produto quando o asset cacheado existe.

## Catálogo e carga do Flow

A arquitetura continua correta para catálogo grande: o Flow não carrega o catálogo inteiro. O backend trabalha por cesta, seção, termo de busca e busca direta, retornando somente subconjuntos de produtos vendáveis.

O candidato V31 mantém:

- quantidade limitada por produto;
- validação de estoque em runtime;
- bloqueio agregado de estoque para adicionais;
- filtro de adicionais que já atingiram o limite;
- preço/estoque sempre vindos do Supabase;
- total determinístico de revisão;
- `product_id` preservado no runtime.

## Segurança preservada

Confirmado no Supabase ao final da rodada:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

O candidato estável exige token de homologação do proprietário e allowlist de destinatário. A Edge recusa acesso fora desse caminho quando Data Exchange global está desligado.

## Make

Não foi necessário alterar Make nesta rodada. O contrato existente continua sendo apenas transporte de outbound/inbound; nenhuma ativação adicional foi feita.

## Resultado

A antiga pendência de imagens está resolvida na infraestrutura real: o cache possui as 9 cestas e 319 produtos. O candidato V31/V22 está pronto para a próxima fase de homologação dirigida ao proprietário, mantendo-se isolado dos clientes.

## Próximo bloco seguro

1. executar regressão completa do artefato V31 e runtime V22;
2. validar uma sessão owner-only ponta a ponta usando apenas o número homologado;
3. conferir `nfm_reply`, revisão, cadastro/endereço, pagamento e retorno para localização no WhatsApp;
4. corrigir somente regressões encontradas;
5. manter todos os gates globais desligados e o canary em 1% até autorização explícita para rollout.

Nenhuma ação manual do proprietário é necessária para continuar a programação segura.