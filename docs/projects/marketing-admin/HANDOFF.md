# HANDOFF — Marketing Admin Dona Antônia

**Leia este arquivo primeiro em qualquer nova janela.**

## Comando de retomada

> Acesse o GitHub `osvaldosereia/SUCEDOAN12` e o Supabase `ssbesxgaijknwsjbsbcz`. Trabalhe somente no projeto **Marketing Admin / Organic Social**. Leia `docs/projects/marketing-admin/README.md`, `CURRENT-STATE.md`, `PROJECT-MASTER.md`, `ROADMAP.md`, `DECISIONS-AND-GUARDRAILS.md` e `TECHNICAL-INVENTORY.md`. Busque o HEAD atual antes de editar. Continue da Rodada 8 — Connection Manager / descoberta de credenciais no Make. Não abrir publicação externa sem canary explícito e não misturar este projeto com Customer & Marketing OS.

## Estado salvo em 18/09/2026

- visual V1 homologado;
- 5 formatos piloto gerados;
- Reel real 10s homologado;
- JPEGs provider-ready homologados;
- MP4 provider-ready H.264 + AAC 48 kHz homologado;
- produção/aprovação/versionamento implementados;
- adapters oficiais Instagram/Facebook/Pinterest implantados;
- WhatsApp Status e Facebook Story mantidos em fluxo manual;
- Gerenciador de Conexões OAuth implementado;
- OAuth endurecido com cleanup de segredos temporários;
- `admin-marketing-workflow-v1` ativo v15, JWT=true;
- `admin-marketing-media-v1` ativo v10, JWT=true;
- `admin-marketing-insights-v1` ativo v15, JWT=true;
- publishing OFF;
- execution_mode=off;
- kill_switch=true;
- max_daily_publications=0;
- todos os gates por canal=false;
- publication jobs reais=0;
- published jobs=0;
- external side effects=0.

## Descobertas Make — ponto exato

Make:
- organização: `6493671`;
- team: `975208`.

Facebook/Instagram:
- conexão Make `7490477`: saudável;
- conexão Make `7650626`: saudável;
- Facebook Page Dona Antônia: **Super Cestas**, ID `1928140920768577`;
- Instagram profissional Dona Antônia: **Super Cestas (@dona_antonia_cuiaba)**, ID `17841451162237654`.

Pinterest:
- conexão Make existente: `7490792`, nome “My pinterest connection”;
- a conexão existe, mas falhou ao listar boards e provavelmente precisa reautorização;
- ainda não há board ID confirmado.

Importante: conexões do Make provam IDs/contas e podem ser usadas como referência ou proxy, mas não expõem o token OAuth bruto para copiar para o nosso Vault.

## Próxima ação segura

1. confirmar callback público `https://donaantonia.com.br/admin/marketing-oauth-callback.html`;
2. salvar no runtime os IDs Meta já confirmados pelo Make;
3. decidir estratégia de credencial Meta:
   - preferida: OAuth próprio do Admin + Vault;
   - alternativa temporária: Make como proxy oficial, sem copiar token;
4. localizar App ID Meta já existente; se não existir, cadastrar no Gerenciador;
5. validar Graph API version oficialmente;
6. para Pinterest, procurar cenários/segredos antigos no Make e tentar recuperar board ID; conexão 7490792 precisa reautorização se for usada;
7. manter todos os gates externos OFF;
8. só depois preparar um único asset aprovado;
9. abrir CANARY de um canal, limite diário 1;
10. publicar uma única peça, validar external_ref/métrica e fechar o gate novamente.

## Não fazer

- não ligar publishing geral;
- não ligar todos os canais de uma vez;
- não inventar Graph API version;
- não copiar token em frontend, commit ou chat;
- não usar endpoint não documentado de WhatsApp Status;
- não misturar Marketing Admin com Customer & Marketing OS;
- não criar vídeo generativo caro nesta fase;
- não regenerar imagem por IA sem necessidade;
- não habilitar cron de publicação enquanto canary não estiver concluído.

## Regra

Ao terminar a próxima rodada, atualizar este HANDOFF e CURRENT-STATE.


## Continuação da Rodada 8 — 18/09/2026

- branch de trabalho: `marketing-admin-round8-continue-20260918`;
- frontend deixou de usar fallback hardcoded de Graph API;
- Graph API explícita no runtime: `v26.0`;
- Facebook Page esperada: `1928140920768577`;
- Instagram Business esperado: `17841451162237654`;
- `admin-marketing-workflow-v1` implantada em **v17**, JWT=true;
- nova proteção: `connection_save_config` valida App ID + App Secret da Meta via client credentials **antes** de persistir App ID ou novo segredo;
- App Secret continua somente no Vault;
- App ID Meta continua `null` até validação real do par;
- publicação continua totalmente fechada: enabled=false, execution_mode=off, kill_switch=true, publishing_enabled=false, max_daily_publications=0;
- publication_jobs=0; published_jobs=0; external_side_effect_events=0.

### Próximo ponto exato

1. usar o Gerenciador de Conexões para testar o App ID Meta candidato/conhecido contra o App Secret atual do Vault;
2. somente se a Meta validar o par, persistir o App ID;
3. iniciar OAuth Meta e confirmar Page/Instagram esperados;
4. manter todos os gates de publicação OFF;
5. depois resolver Pinterest/board;
6. canary de uma única publicação continua proibido até a conexão/identidade estar verificada.


## Comando pronto para nova aba / novo projeto ChatGPT

> Acesse o GitHub `osvaldosereia/SUCEDOAN12` e o Supabase `ssbesxgaijknwsjbsbcz`. Trabalhe somente no projeto **Marketing Admin / Organic Social — Dona Antônia**. Continue exatamente do checkpoint salvo em `docs/projects/marketing-admin/HANDOFF.md` e `CURRENT-STATE.md`. Use a branch `marketing-admin-round8-continue-20260918` e confirme o HEAD antes de editar. Estamos na **Rodada 8 — Connection Manager / homologação das conexões reais**. A Edge Function `admin-marketing-workflow-v1` está em **v17** com validação server-side do par Meta App ID + App Secret antes de persistir o App ID e validação estrita da identidade esperada da Page/Instagram durante o OAuth. O App Secret permanece somente no Supabase Vault. O `meta_oauth_app_id` ainda deve permanecer vazio até a validação real do par. Graph API explícita: `v26.0`. IDs esperados já registrados: Facebook Page `1928140920768577` e Instagram Business `17841451162237654` (@dona_antonia_cuiaba). Próxima ação: validar o App ID Meta correto contra o App Secret atual do Vault; somente se a Meta aceitar o par, salvar o App ID e iniciar OAuth para confirmar a Page e o Instagram esperados. Depois resolver Pinterest/board. **Não abrir publicação ainda.** Manter `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0`, todos os gates de canal OFF. Antes de qualquer canary, exigir conta verificada e preparar somente 1 publicação. Não misturar com **Customer & Marketing OS**.

## Checkpoint Rodada 8.1 — homologação fail-closed de identidade Meta

Data: 18/09/2026.

- HEAD confirmado antes das edições: `4e7ee63e9fd2528d5e4c40943fb910d7a60e2124`;
- branch preservada e isolada: `marketing-admin-round8-continue-20260918`;
- a branch continua divergente de `main`; nenhum rebase/merge de trabalho paralelo foi feito;
- teste de regressão adicionado primeiro em `c8c26529a96b41ebe7f2c69c81e8f430c975768e`;
- proteção implementada em `b2fd5ad979335e86665b2005d5d4e38573324f81`;
- `admin-marketing-workflow-v1` implantada em **v17**, ACTIVE, JWT=true;
- durante `oauth_exchange`, somente a Facebook Page esperada `1928140920768577` é aceita;
- o Instagram vinculado precisa ter ID `17841451162237654`; username esperado `dona_antonia_cuiaba` também é conferido quando retornado pela Meta;
- apenas o token temporário da Page esperada pode ser armazenado;
- `oauth_complete` repete a validação de identidade antes de persistir qualquer credencial Meta definitiva;
- em divergência, os segredos temporários da sessão são limpos e a conclusão é bloqueada;
- verificação estrutural da rodada: **25/25 checks verdes**;
- deploy v17 compilou/ativou no Supabase sem abrir gates.

### Busca do Meta App ID

O App ID exato ainda **não foi localizado** em:
- documentação/checkpoint do projeto;
- código ou histórico pesquisável do GitHub;
- metadata pública do Marketing no Supabase;
- cenários históricos Meta inspecionados no Make;
- contexto anterior e arquivos pesquisados.

Não usar Page ID, Instagram Business ID, Flow ID, WABA ID ou connection ID como substituto do App ID.

Foi criado no Make apenas para tentativa de leitura o cenário `7489979` — `TEMP - Marketing Meta App ID Readonly 20260918`. A execução foi bloqueada pela camada de segurança antes da chamada; o cenário permanece **inactive**. Não ativar nem reutilizar como automação do projeto.

### Estado de segurança reconfirmado após v17

- `meta_oauth_app_id=null`;
- App Secret Meta presente somente via Vault;
- Graph API: `v26.0`;
- `enabled=false`;
- `execution_mode=off`;
- `kill_switch=true`;
- `publishing_enabled=false`;
- `max_daily_publications=0`;
- todos os gates de canal OFF;
- publication jobs=0;
- published jobs=0;
- external side effects=0;
- OAuth sessions=0;
- todos os canais seguem `disconnected`.

### Próxima ação exata a partir deste checkpoint

1. obter o **Meta App ID numérico exato** do mesmo aplicativo cujo App Secret já está no Vault;
2. informar esse App ID no Connection Manager; não é necessário expor o App Secret no chat;
3. deixar `connection_save_config` validar o par App ID + App Secret no servidor;
4. somente se a Meta aceitar o par, persistir `meta_oauth_app_id`;
5. iniciar OAuth Meta;
6. o backend somente aceitará a Page `1928140920768577` vinculada ao Instagram Business `17841451162237654`;
7. somente depois resolver Pinterest/board;
8. canary de publicação continua proibido até concluir essas homologações.


## Checkpoint Rodada 8.2 — Meta App ID identificado e validado

Data: 2026-09-18.

- O candidato `1180091367536552` foi testado contra o App Secret já existente no Supabase Vault e a Meta respondeu **Error validating client secret**. Ele **não** foi persistido.
- A investigação read-only do histórico do Make encontrou, em uma execução bem-sucedida do cenário `7489721` (**TEMP - Meta Direct Readonly Evidence**), a aplicação conectada da Dona Antônia chamada **cell principal**, com App ID `1547249776748513`.
- Esse App ID `1547249776748513` foi então validado server-side contra o App Secret do Vault usando o fluxo `client_credentials` na Graph API `v26.0`; a Meta respondeu HTTP 200 com token de aplicativo. O token não foi exposto e a resposta temporária de validação foi removida imediatamente.
- Somente após a validação positiva, `marketing_runtime_config.metadata.meta_oauth_app_id` foi persistido como `1547249776748513`, com `meta_app_credentials_validation=client_credentials` e timestamp de validação.
- Snapshot posterior confirmou `meta.app_id_set=true`, `meta.app_secret_set=true` e `graph_version=v26.0`.
- Nenhum OAuth de usuário foi iniciado ainda; todos os canais continuam `disconnected`.
- Safety gates permanecem fechados: `enabled=false`, `execution_mode=off`, `kill_switch=true`, `publishing_enabled=false`, `max_daily_publications=0`.
- As linhas temporárias de `pg_net` usadas nas duas validações foram removidas; não ficou token de aplicativo armazenado nessas respostas.

### Próxima ação exata

1. abrir o Marketing Admin autenticado como owner;
2. iniciar **Conectar Meta** pelo Connection Manager para gerar a sessão OAuth pelo backend v17;
3. concluir o consentimento Meta no navegador;
4. deixar o backend fail-closed aceitar somente a Page `1928140920768577` e o Instagram Business `17841451162237654` / `@dona_antonia_cuiaba`;
5. após Meta homologado, resolver Pinterest App/board;
6. publicação real e canary continuam proibidos até concluir a homologação.

