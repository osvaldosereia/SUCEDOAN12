# WhatsApp Flow V3 — checkpoint de cards simples (09/09/2026)

## Objetivo desta evolução

Simplificar o pedido das cestas para o público Dona Antônia, reduzindo telas e mantendo o Flow visual:

1. escolher uma das 9 cestas com foto;
2. personalizar a composição em uma única tela;
3. adicionar produtos avulsos sem abrir tela de detalhe;
4. mostrar somente 3 produtos visuais por vez;
5. selecionar quantidade diretamente abaixo de cada produto;
6. limitar cada produto a `min(6, estoque)`;
7. seguir para revisão, entrega e pagamento presencial.

Supabase continua sendo a fonte oficial. Firebase/Purebase não participa do runtime deste Flow.

## V3 candidata

Definition slug: `flow-cestas-comercial-v3`

Estado atual:

```text
status=draft
provider_id=null
flow_json_version=v26
handler_version=v12
candidate_not_live=true
default_for_new_sessions=false
```

A V2 publicada não foi substituída nesta rodada. A V3 só poderá ser promovida depois da validação oficial da Meta.

## UX V26

Arquivo gerado:

`whatsapp/flows/flow-cestas-comercial-v26.json`

A V26 possui somente 12 telas:

```text
CESTAS
PERSONALIZAR_A
SECOES_A
PRODUTOS_A
SECOES_B
PRODUTOS_B
SECOES_C
PRODUTOS_C
REVISAO
CLIENTE_EXISTENTE
CLIENTE_NOVO
FINALIZAR
```

Foram eliminadas as telas intermediárias:

- `TERMOS_*`;
- `PRODUTO_*`;
- `UPSELL` isolada.

Nos adicionais, cada tela `PRODUTOS_*` possui no máximo 3 produtos. Cada produto recebe:

- imagem;
- nome;
- preço;
- descrição curta;
- dropdown de quantidade no próprio card.

No final da lista, a decisão foi reduzida para:

- `Ver mais produtos`;
- `Outra categoria ou busca`;
- `Revisar pedido`.

A última rodada (`PRODUTOS_C`) segue diretamente para revisão, evitando ciclos e telas extras.

## Limite de quantidade

A regra é validada no backend e na lista apresentada ao cliente:

```text
quantidade máxima = min(6, estoque disponível)
```

Smoke real do helper em Supabase confirmou:

- produto com estoque >= 6: opções 0..6;
- produto com estoque 3: opções 0..3;
- produto com estoque 2: opções 0..2;
- submissão acima do estoque: `quantity_exceeds_stock`.

O ID do produto usado na gravação vem do mapa de slots salvo na sessão, não do payload livre do cliente.

## Imagens — solução definitiva

A conversão de WebP/AVIF deixou de ser dependência principal do Data Exchange.

Pipeline:

```text
imagem oficial do produto/cesta
→ GitHub Action
→ Pillow + AVIF plugin
→ JPEG pequeno
→ Supabase Storage / whatsapp-flow-assets
→ Edge Function lê o JPEG pronto
→ base64 para Meta Flow
```

Action:

`.github/workflows/build-whatsapp-flow-images.yml`

Script:

`scripts/sync-whatsapp-flow-assets.py`

Cache confirmado:

```text
cestas=9/9
produtos vendáveis=319/319
```

As cestas ficaram aproximadamente entre 15 KB e 19 KB. Produtos seguem alvo inferior a 40 KB.

O antigo quadrado verde era um fallback de 1 pixel ampliado. A V26 usa `has_*_image`; quando uma imagem realmente não puder ser hidratada, o componente é ocultado em vez de mostrar fallback visual.

## Edge Function

`whatsapp-flow-data-exchange-v1`

Estado após esta rodada:

```text
version=16
status=ACTIVE
verify_jwt=false
```

A V1 e V2 preservam os handlers anteriores. A nova rota é exclusiva para:

```text
flow-cestas-comercial-v3 -> handle_whatsapp_flow_commercial_exchange_v12
```

Novo helper de mídia:

`supabase/functions/whatsapp-flow-data-exchange-v1/card-images.ts`

Ele hidrata `p1`, `p2` e `p3` usando primeiro:

```text
whatsapp-flow-assets/products/<product_uuid>.jpg
```

## Backend V37

Migration aplicada e persistida no repositório:

`supabase/migrations/20260909195000_whatsapp_flow_direct_three_product_cards_v37.sql`

Principais funções:

- `get_whatsapp_flow_section_results_page_v1`;
- `get_whatsapp_flow_simple_extras_screen_v1`;
- `get_whatsapp_flow_simple_product_cards_v1`;
- `handle_whatsapp_flow_commercial_exchange_v12`.

Produtos avulsos permanecem estritos: ativo, verificado, WhatsApp ativo, preço válido e estoque positivo.

## Testes concluídos

GitHub Action de geração V26:

```text
run=34397568197
conclusion=success
```

CI geral após o roteamento V3 também concluiu com sucesso.

Smoke sintético em Supabase:

1. `SECOES_A` + `limpeza` -> `PRODUTOS_A` com 3 produtos reais;
2. quantidade `1` no primeiro produto -> persistida na sessão de homologação;
3. `Ver mais produtos` -> página 2 e próxima rodada;
4. tentativa de quantidade 5 para item com estoque 4 -> rejeitada com `quantity_exceeds_stock`;
5. sessão e conversa sintéticas removidas após o teste.

## Gate de Meta — único bloqueio externo atual

Foi criado o workflow:

`.github/workflows/release-flow-v26-meta.yml`

Ele está preparado para:

1. localizar ou criar `Dona Antônia - Cestas Comercial V3` na WABA;
2. clonar a base da V2;
3. apontar para o Data Exchange atual;
4. enviar `flow-cestas-comercial-v26.json`;
5. exigir `validation_errors=[]` da Meta;
6. publicar somente depois da validação limpa;
7. conferir status/health final.

Primeira execução:

```text
run=34398090699
conclusion=failure
failed_step=Require Meta token
reason=META_ACCESS_TOKEN GitHub secret is missing
```

Nenhum Flow V3 foi criado na Meta nessa execução e nenhum cliente foi exposto.

### Ação manual indispensável

Adicionar ao repositório GitHub `osvaldosereia/SUCEDOAN12` o secret:

```text
META_ACCESS_TOKEN
```

O valor deve ser um token Meta válido com permissão para administrar os WhatsApp Flows da WABA Dona Antônia. Nunca gravar o token em arquivo, commit, issue ou chat.

Depois do secret existir, basta reexecutar o workflow `Release WhatsApp Flow V3 Candidate`.

## Gates atuais — preservar durante a homologação V3

Auditoria após esta rodada encontrou:

```text
whatsapp_live_canary_percent=1
experience_orchestrator_enabled=false
whatsapp_flow_data_exchange_enabled=false
whatsapp_flow_send_enabled=false
whatsapp_flow_commercial_write_enabled=false
bling_order_sync_enabled=false
```

Não alterar os gates enquanto a V3 não tiver validação oficial limpa e smoke final. A autorização anterior do proprietário para 100% será executada somente após os critérios de prontidão serem novamente comprovados.

## Próxima ação

1. obter `META_ACCESS_TOKEN` apenas por GitHub Secret;
2. reexecutar `release-flow-v26-meta.yml`;
3. corrigir qualquer erro oficial retornado pela Meta;
4. obter `validation_errors=[]` e `PUBLISHED`;
5. gravar `provider_id` da V3 no Supabase;
6. executar smoke final com Data Exchange real;
7. tornar V3 padrão para novas sessões;
8. restaurar os gates autorizados para 100%;
9. manter Bling separado/OFF nesta liberação.
