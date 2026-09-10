# Marketing Center — Run 6 — Editor rápido versionado

Data: 2026-09-10.

## Escopo desta rodada

Somente Marketing. Sem Make, sem alteração do WhatsApp Flow, sem ativação de Instagram/Messenger/Ads, sem publicação externa e sem gasto de IA.

## Correção inicial

O CI específico `Marketing Center V1` da rodada anterior estava vermelho por erro de sintaxe em `admin-v3/marketing-workflow-v1.js`. O seletor de `datetime-local` foi corrigido e o CI específico voltou a ficar verde antes do início deste bloco. Workflows gerais de outras frentes não foram alterados.

## Editor rápido V1

Foi adicionada a aba `Editor rápido` ao Marketing Admin, carregada pelo módulo de workflow já existente. O editor trabalha somente com rascunhos e metadados internos e oferece preview local no navegador, sem chamar renderer ou provider.

Controles iniciais:
- título;
- formato visual 1:1, 9:16 ou Pinterest 2:3;
- produção `Sem IA | Híbrido | Manual | Com IA`;
- chamada principal e subtítulo;
- preço e CTA;
- escala e posição vertical do produto;
- observação da alteração;
- histórico de revisões;
- criação de nova versão quando o conteúdo já foi aprovado.

A seleção de modo com IA é apenas uma intenção de rascunho. Com os gates atuais, nenhuma geração paga é executada.

## Persistência e imutabilidade

Migration aplicada em produção, ainda sem efeito externo:

- `marketing_asset_editor_v5`.

Nova tabela server-only:

- `marketing_asset_revisions`.

Regras:
- revisão é append-only;
- `anon` e `authenticated` sem acesso direto;
- edição salva snapshot anterior antes de alterar o asset;
- edição remove `output_spec` obsoleto e volta o asset para `draft`;
- revisão/aprovação/agendamento anteriores são invalidados ao editar;
- asset aprovado/imutável não pode ser editado no lugar;
- asset aprovado pode ser bifurcado para uma nova versão `draft` editável;
- bifurcação não copia jobs de publicação;
- toda operação registra `marketing_events.external_side_effect=false`.

RPCs:
- `marketing_save_asset_edit_v1`;
- `marketing_fork_asset_version_v1`.

Ambas são `service_role` only.

## Edge Function

`admin-marketing-workflow-v1` foi atualizada e implantada como versão 3 com `verify_jwt=true`.

Novas ações internas:
- `editor_overview`;
- `editor_save`;
- `editor_fork`.

Não existem ações de publish, enable, canary, escrita de token ou provider pago nessa função.

## Validação real sem deixar dados

Foi executado teste transacional descartável no Supabase:

1. criar asset sintético em draft;
2. salvar edição;
3. confirmar criação da revisão 1;
4. enviar para revisão e aprovar;
5. confirmar que editar o aprovado retorna `approved_asset_immutable_use_fork`;
6. bifurcar o aprovado para nova versão draft;
7. confirmar trigger append-only;
8. `ROLLBACK` de todo o teste.

Resultado final: zero assets de autoteste persistidos.

Privilégios confirmados:

```text
anon_save=false
authenticated_save=false
service_save=true
anon_fork=false
authenticated_fork=false
service_fork=true
```

## Gates confirmados após a rodada

```text
enabled=false
execution_mode=off
canary_percent=0
kill_switch=true
generation_enabled=false
deterministic_render_enabled=false
ai_image_enabled=false
ai_video_enabled=false
publishing_enabled=false
whatsapp_status_publish_enabled=false
instagram_story_publish_enabled=false
facebook_story_publish_enabled=false
instagram_carousel_publish_enabled=false
pinterest_publish_enabled=false
google_business_publish_enabled=false
```

## CI

O workflow específico foi ampliado para:
- `node --check admin-v3/marketing-editor-v1.js`;
- validar `scripts/test-marketing-editor-v1.mjs`;
- manter os testes anteriores de Admin, calendário/aprovação, WebP, FFmpeg e worker.

## Segurança / Advisors

A tabela de revisão segue o padrão server-only do projeto: RLS ligada e grants públicos revogados. O aviso `RLS Enabled No Policy` é esperado nesse modelo, porque `anon/authenticated` não possuem acesso. O aviso preexistente `Leaked Password Protection Disabled` continua fora do escopo e não foi alterado.

## Próximo bloco seguro

1. confirmar CI desta rodada;
2. conectar explicitamente `Salvar e renderizar` à fila determinística, mantendo `generation_enabled=false` e `deterministic_render_enabled=false` até homologação;
3. registrar preview/output no `marketing_media_objects` e disponibilizar preview assinado ao Admin;
4. evoluir edição de carrossel com ordem de slides e duplicação rápida;
5. criar adapters oficiais de canal exclusivamente como `dry_run`/validação de payload, sem token real e sem dispatcher;
6. iniciar read model de métricas/atribuição sem publicar nada.

IA paga e publicação real continuam bloqueadas até autorização explícita.
