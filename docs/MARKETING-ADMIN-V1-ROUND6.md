# Marketing Admin V1 — Rodada 6

Atualizado em 18/09/2026.

Status: **FLUXO DE PRODUÇÃO E APROVAÇÃO IMPLEMENTADO / CANAIS PREPARADOS / PUBLICAÇÃO EXTERNA AINDA BLOQUEADA**.

## Produção

O Admin agora permite:
- gerar mídias de uma campanha em lote;
- abrir prévia;
- regenerar;
- editar título, chamada e CTA;
- invalidar automaticamente a mídia antiga após edição;
- enviar peça para revisão;
- aprovar;
- reprovar com motivo obrigatório;
- criar nova versão de peça já aprovada.

## Aprovação

Estados usados:
- draft;
- review;
- approved.

Aprovação é permitida somente ao owner.

Ao aprovar, o sistema exige mídia renderizada válida e prepara jobs internos de publicação. Se a preparação falhar, a aprovação é revertida pela transação.

## Destinos preparados

- Instagram Feed;
- Instagram Story;
- Instagram Reel;
- Instagram Carrossel;
- Facebook Post;
- Facebook Story;
- Facebook Reel;
- Pinterest Pin;
- WhatsApp Status.

Total esperado para as cinco peças homologadas: 9 jobs internos.

WhatsApp Status mantém `manual_confirmation_required=true`.

## Teste transacional

As cinco peças piloto foram submetidas e aprovadas dentro de uma transação temporária.

Resultado:
- 9 jobs;
- 9 approved;
- 1 manual;
- rollback no final;
- nenhum asset real foi aprovado;
- nenhum job real permaneceu criado.

## Edição segura

`marketing_save_asset_edit_v1` salva revisão e invalida os registros de mídia da versão atual. O arquivo antigo pode continuar fisicamente no bucket até ser sobrescrito/limpo, mas deixa de ser signable pelo fluxo do Admin.

Isso impede aprovar texto novo usando visual antigo.

## Canais oficiais

A tabela `marketing_channel_accounts` foi expandida para os mesmos destinos da fila.

Foram criados placeholders honestos com status `disconnected`.

A aba Publicações agora mostra:
- conexão;
- provider;
- tipo de mídia;
- bloqueio/homologação;
- distinção do WhatsApp entre atendimento ativo e Status manual.

## Meta Control Plane

A fundação Meta CM-1.12 existente foi reaproveitada.

O Marketing recebe somente snapshot sanitizado:
- estado;
- versão da Graph API;
- webhook;
- readiness;
- contagem de permissões.

WABA, telefone e credenciais não são enviados ao frontend.

As funções SECURITY DEFINER da fundação Meta estão executáveis somente por `service_role`.

## Segurança

Continuam ativos:
- publishing_enabled=false;
- kill_switch=true;
- aprovação humana;
- nenhuma publicação externa;
- nenhuma ativação automática de credencial;
- nenhum aumento de plano;
- nenhuma IA paga adicionada pela Rodada 6.

## Próxima rodada

Conectar e homologar provedores oficiais, começando por Instagram/Facebook, depois Pinterest. A ativação externa deve permanecer fail-closed e só abrir por canal após teste controlado.
