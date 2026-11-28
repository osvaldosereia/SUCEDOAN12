# Roteiro de validação em staging

Este roteiro transforma as pendências do intake WhatsApp em uma sequência de liberação verificável. O ambiente canônico de dados permanece `ssbesxgaijknwsjbsbcz` (“Dona Antônia”); os gates abaixo servem para validar o rollout já feito e eventuais mudanças adicionais, não para repetir migrations aplicadas.

> **Estado atual — 27/10/2026:** o proprietário recusou criar staging com custo recorrente; não criar outro projeto/branch de homologação. Depois dessa decisão, o proprietário autorizou o rollout das seis migrations aditivas e das 13 Edge Functions greenfield no projeto canônico `ssbesxgaijknwsjbsbcz`. Portanto, este roteiro agora registra os gates de validação que ainda faltam depois do rollout; não descreve o estado atual do banco. O webhook Meta legado permanece ativo, o endpoint candidato ainda não foi vinculado às contas, o Flow ainda não foi publicado e nenhum teste comercial foi executado. Não tratar o deploy como autorização para operar pedidos reais.

## 1. Preparar uma base isolada

1. Obter um baseline SQL reproduzível do schema atual e revisar tabelas, funções, triggers, grants e policies. Não registrar versões de migration artificialmente para contornar o histórico divergente.
2. Criar/usar ambiente Supabase isolado e confirmar sua referência antes de qualquer comando. Se a criação gerar custo, o responsável deve revisar o valor no fluxo oficial do Supabase antes de continuar.
3. Restaurar somente estrutura e dados sintéticos/anônimos necessários. Não copiar clientes, conversas, pedidos ou segredos de produção para staging.
4. Reproduzir o baseline do zero; aplicar a migration candidata somente depois de conferir nomes, dependências, grants e estado esperado.
5. Conferir RLS e execução das RPCs com perfis `owner`, `admin`, `catalog_manager`, atendente e usuário inativo. As tabelas privadas não devem ganhar acesso direto do navegador.

**Gate:** nenhum desvio não explicado entre baseline, migration local e schema do ambiente isolado.

## 2. Configurar integrações sem expor segredos

- Guardar credenciais apenas em secrets do Edge Function no ambiente isolado. Usar a convenção por número: `META_ACCESS_TOKEN_0975`, `META_ACCESS_TOKEN_1018`, `META_WHATSAPP_APP_SECRET_0975` e `META_WHATSAPP_APP_SECRET_1018`. O webhook bridge valida o corpo bruto somente contra essa lista fechada de dois App Secrets; depois exige que a assinatura válida corresponda ao par ativo WABA/phone-number consultado. Não há fallback genérico para a autenticação externa.
- A chave `META_WHATSAPP_APP_SECRET` é mantida somente como compatibilidade interna para re-assinar o subconjunto encaminhado à função antiga. Ela deve coincidir com o segredo de validação que a função antiga espera, ficar disponível ao bridge e à função antiga, e nunca ser usada para validar a solicitação externa original. Validar esse encaminhamento em staging. Nunca copiar valores de secrets para `.env.example`, logs, commits ou anotações.
- Confirmar para cada número o par exato WABA ID/phone-number ID, token do app correto e acesso de leitura ao catálogo ligado àquele WABA. Um token que consegue ler um catálogo diferente não basta para provar o vínculo.
- Configurar e registrar a versão Graph explicitamente por ambiente. Não escolher uma versão por suposição nem inferir permissões a partir de um nome de secret.
- Configurar callback de teste separado do callback de produção. Validar desafio GET e assinatura HMAC do corpo bruto; assinatura inválida não pode persistir evento nem acionar a função legada.
- Deixar envio, callback e integração Bling de produção intactos durante toda a fase de staging.

**Gate:** ambos os números passam verificação isolada de credenciais, WABA e catálogo, sem imprimir token, app secret ou URL de paginação.

## 3. Validar catálogo e Flow por número

1. Ler cada catálogo pela API oficial usando o número correspondente. Conferir ID do catálogo, paginação completa e `product_retailer_id` exato; a comparação nunca usa nome, SKU, EAN ou preço recebido no carrinho.
2. Testar o verificador local com catálogo isolado. Só um ID encontrado exatamente uma vez após varredura completa pode receber estado ativo; ausência, duplicidade, falta de acesso, paginação incompleta ou limite atingido ficam em revisão.
3. Conferir cada Flow com a versão concreta do JSON/Data API e o Validator oficial vigente. Todo produto/opção mostrado deve ter foto válida; nenhum item sem foto pode ser publicado.
4. Conferir visualmente todas as alternativas e telas em ambos os números de teste: imagem, nome, preço, quantidade `0–6`, navegação Próximo/Voltar, pagamento, endereço e resumo. Não publicar JSON especulativo se o Validator não aceitar a propriedade de imagem escolhida.
5. Confirmar que o resumo enviado lista produtos e quantidades, mostra somente o total geral e oferece botão de confirmação. O cliente precisa confirmar antes de existir pedido canônico.
6. Confirmar que a sessão técnica congela as versões JSON/Data API do binding publicado e que o endpoint rejeita sessão/canal/versão divergentes; enviar também uma notificação de erro de cliente e confirmar a resposta `acknowledged` sem persistir pedido.

**Gate:** catálogo e Flow validados separadamente nos dois números; fotos cobrem 100% das alternativas elegíveis.

## 4. Validar webhook, conversa e pedidos

- Enviar eventos sintéticos/controle de staging de texto, mídia, status, Catálogo, NFM Flow, botão de confirmação e remetente sem E.164. O bridge deve capturar somente os eventos novos e encaminhar o restante à função legada sem duplicar processamento.
- Fazer dois pedidos Flow idênticos/reentregues e confirmar idempotência, preço recalculado, reserva única e uma única conversão para `orders`/`order_items`.
- Confirmar um pedido Flow e, depois, um pedido nativo do Catálogo na mesma conversa. Devem ser dois pedidos independentes, cada um com seu próprio total; nunca mesclar itens nem impor janela de tempo. Nesta fase, não solicitar nem iniciar emissão fiscal.
- Validar cliente existente por E.164 e confirmar endereço; validar cliente novo com coleta dos campos obrigatórios. Identificadores Meta opacos permanecem em revisão, sem conversão automática em telefone nem associação ao cadastro.
- Confirmar que Atendimento e Pedidos mostram origem Flow/Catálogo apenas quando a relação privada comprovar a conversão; fallback seguro é “WhatsApp · atendimento”.
- Conferir os efeitos das triggers da Loja: sem mensagem “pedido recebido” duplicada, reserva de estoque única e sem avanço automático fora dos estados definidos.

**Gate:** cada caso gera a quantidade esperada de intents/pedidos, com total correto, origem rastreável, estado correto e nenhum evento ou reserva duplicado.

## 5. Validar produção e integração Bling sem emissão fiscal

1. Confirmar o mapa atual de status e o dono do avanço Produção → Expedição; manter a validação humana já existente.
2. Antes de concluir uma separação de teste, ler o estado fiscal e comprovar `issue_enabled=false`. O Admin deve bloquear a conclusão se essa leitura estiver indisponível ou se a emissão automática estiver habilitada.
3. Usar conta/ambiente de teste do Bling quando disponível. Conferir cliente, endereço, itens, quantidades, valores, forma de pagamento, chave idempotente e retorno da sincronização do pedido/estoque sem emitir NF-e.
4. Simular timeout e erro do Bling; o Admin deve mostrar pendência/revisão e permitir recuperação idempotente, sem duplicar venda. Não executar `order_separation_complete` em produção durante essa fase.

**Gate:** pedido e estoque sincronizam somente os objetos esperados no Bling, com recuperação segura e sem duplicidade; emissão manual e automática continuam desligadas.

## 6. Emissão fiscal — última etapa

1. Iniciar somente depois de aprovados os gates de admin, clientes, fotos, Flow, Catálogo, confirmação do pedido, separação e integração Bling.
2. No ambiente isolado, conferir a configuração efetiva que liga emissão automática e manual, preflight, papéis, idempotência, respostas `processing`/`rejected`, reconciliação e callbacks. O teste usa somente sandbox fiscal e dados sintéticos.
3. Se não existir sandbox fiscal, revisar payload e recuperação sem autorizar emissão real; não usar cadastro fiscal de clientes de produção em homologação.
4. Habilitar a emissão manual/automática somente nesta fase e somente depois de validar que o pedido, valores, estoque e cadastro estão corretos. Expedição continua bloqueada até autorização inequívoca da Sefaz.

**Gate:** emissão e recuperação fiscal aprovadas no ambiente isolado; autorização da Sefaz libera expedição; timeout, rejeição ou estado desconhecido mantêm o pedido bloqueado e recuperável.

## 7. Preparar e executar eventual liberação

Antes de qualquer produção, registrar evidência dos gates anteriores, backup/restauração, versão do código, migration aplicada em staging, configuração por WABA, plano de rollback e responsável de plantão. Fazer diff exato das mudanças de callback/Edge/secrets. A liberação de produção deve ser uma etapa separada, limitada e explicitamente autorizada; este documento não aplica migration, não implanta função, não muda callback, não envia mensagem e não grava no Bling.

Rollback deve restaurar o callback e as funções anteriores, desligar o novo roteamento e manter intents/pedidos já gravados para reconciliação. Não apagar dados de negócio para “voltar” a aplicação. Após rollback, conferir fila de mensagens e pedidos antes de reprocessar.

## Tentativa de branch isolada (27/10/2026)

- A branch `admin-whatsapp-isolated-validation` foi solicitada no projeto canônico com `with_data=false`; o Supabase marcou a criação como `MIGRATIONS_FAILED`. `get_project` para a referência temporária retornou `NotFoundException`.
- A consulta somente leitura dos logs do intervalo de criação não isolou uma mensagem de falha que permita atribuir a causa. Os logs mostram execução de SQL de migrations durante o provisionamento, mas não provam qual migration causou o estado final. Não presumir que a causa seja uma migration greenfield específica.
- A branch temporária falha foi excluída; `list_branches` voltou a mostrar somente `main` do projeto `ssbesxgaijknwsjbsbcz`. Nenhuma migration, função, callback ou segredo foi alterado no projeto principal.
- **Decisão operacional:** não repetir a criação de branches sem antes revisar a origem/configuração do replay automático e a divergência entre o histórico remoto extenso e o conjunto greenfield local. A falha não libera DDL no banco principal. Prosseguir com implementação local e checks estáticos enquanto se prepara um baseline reproduzível por procedimento controlado.

## Divergência entre histórico remoto e migrations greenfield (27/10/2026)

- A consulta Supabase read-only listou 1.266 versões aplicadas no projeto original; a última é `20261026120049`. O worktree greenfield tem três migrations `20261027...`, todas ainda ausentes no histórico remoto.
- A história Git local preserva somente quatro nomes únicos de migrations SQL. Assim, o repositório limpo não contém sequência replayável nem baseline suficiente para reconstruir as 1.266 versões; isso não prova qual comando causou `MIGRATIONS_FAILED` no branch temporário.
- O branch temporário falho já não existe e o projeto original permanece saudável. Não marcar versões manualmente, não restaurar o conjunto antigo de código e não reaplicar no projeto original. Próximo diagnóstico depende de obter um dump de schema atual e revisar o mecanismo/ligação que dispara replay em branch, ou montar um ambiente isolado a partir de baseline limpo sem dados reais.

## Procedimento candidato para obter o baseline de schema (27/10/2026)

- A documentação oficial atual descreve `supabase db dump` como um dump schema-only por padrão: não inclui dados nem roles customizados e exclui schemas gerenciados como `auth` e `storage` e schemas de extensões. Alterações customizadas nesses schemas precisam de inventário separado. Fonte: [Supabase — Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) e [CLI `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump).
- A documentação também informa que `db dump` assume como destino o projeto vinculado quando nenhuma opção é passada. Um futuro dump deve declarar explicitamente `--linked`, gravar somente em arquivo local temporário sob `work/` e não usar opções de dados/roles. O `db reset --linked` apaga e recria o schema remoto e nunca faz parte deste procedimento.
- Estado da máquina nesta leitura: Docker Desktop está instalado; Supabase CLI não está no `PATH`. O dump ainda não foi executado; não lemos, mostramos, copiamos ou alteramos senha de banco/credencial. A próxima tentativa requer conferir a versão e `--help` da CLI instalada/temporária, confirmar o projeto/ref vinculado e só então obter o snapshot em arquivo local sem imprimir o conteúdo no terminal.
- O dump de schema, se obtido, é evidência para revisão e uma possível baseline local isolada; não é migration incremental, não deve ser enviado à produção nem restaurado em um branch que tenha replay automático. Primeiro identificar quais partes do snapshot são reproduzíveis pela stack local, revisar funções/triggers/grants/policies sem levar dados reais, e usar apenas dados sintéticos em um ambiente descartável.
- Changelog oficial verificado em 27/10/2026: PostgreSQL 17.11 exige revisar `ltree`, `pgcrypto`, `btree_gist` e operadores customizados em upgrades; o estado atual do projeto continua 17.6.1.166. Também consta mudança de Data API para tabelas novas, mas não afeta uma leitura de dump; manter o gate de grants explícitos nas migrations futuras. Fonte: [Supabase Changelog — breaking changes](https://supabase.com/changelog?types=breaking-change).

## Inventário de dependências no schema ativo (27/10/2026)

- Consulta read-only ao catálogo PostgreSQL do projeto canônico `ssbesxgaijknwsjbsbcz`; a consulta leu somente nomes de objetos e colunas em `pg_catalog`/`information_schema`, nunca linhas de clientes, mensagens ou pedidos.
- As três migrations candidatas locais referenciam 48 nomes distintos em `public`: 19 relações existem no projeto (`admin_audit_logs`, `admin_users`, `basket_mold_position_options`, `basket_mold_positions`, `basket_molds`, `basket_templates`, `conversations`, `customer_addresses`, `customer_emails`, `customer_phones`, `customers`, `order_items`, `order_manual_separation_queue_v1`, `orders`, `products`, `whatsapp_accounts`, `whatsapp_flow_sessions`, `whatsapp_outbox_v1`, `whatsapp_webhook_events_v1`); quatro funções-base também existem (`canonical_whatsapp_e164_br_v2`, `customer_ids_by_phone_variants_v1`, `ops2_admin_attendance_customer_access_v1`, `reserve_vitrine_order_stock_v1`).
- Os 25 nomes de função ainda ausentes no banco correspondem exatamente às 25 funções novas declaradas nas migrations candidatas. Isso confirma a intenção incremental no nível de nomes; não prova ordem, grants, RLS, triggers nem compilação PL/pgSQL.
- Uma comparação estática adicional conferiu 123 nomes de campos distintos usados por `%ROWTYPE`, listas explícitas de `INSERT` e atribuições de `UPDATE`, em 14 das 19 relações públicas; nenhum campo dessa amostra está ausente no schema ativo. SELECTs com aliases, SQL dinâmico e validação em runtime não entram nessa checagem, que não substitui a compilação integral em baseline isolado.
- A compilação PostgreSQL 17.6 em banco descartável aceitou os três corpos críticos `whatsapp_order_intent_ingest_v1`, `whatsapp_order_intent_prepare_confirmation_v1` e `whatsapp_order_intent_confirm_v1`, com stubs de tipos de linha e sem dados. Isso detectou e corrigiu a condição `ELSIF` incompleta em `ingest`; não substitui a execução das migrations completas sobre baseline, nem valida efeitos de triggers/RLS/grants.
- A CLI do projeto foi encontrada via `pnpm exec` na versão `2.122.0`; `docker info` reportou Docker `29.9.2`. `pnpm exec supabase db dump --help` confirma as opções `--linked`, `--project-ref`, `--schema` e `--file`. Nenhum dump foi executado, nenhuma senha de banco foi lida e nenhum valor de credencial foi impresso. `deno` continua ausente do `PATH` desta sessão.
- A referência remota continua saudável e somente `main` está disponível. Nenhum objeto, migration, secret, Edge Function, callback Meta, Flow ou dado do Bling foi alterado nesta verificação.

## Estado do build local do Admin (27/10/2026)

- `pnpm typecheck` e Biome focalizado em `src/app/(admin)/layout.tsx` passam. A leitura HTTP local mostrou `/login` com `200` e o formulário, e `/` e `/pedidos` com `307` para `/login` quando não há configuração Supabase local. Não havia arquivo `.env*` local nem `NODE_ENV` definido no processo; nenhum segredo foi lido.
- **Atualização após investigação:** a árvore preexistente `node_modules` tinha junctions para `node_modules/.deno`, embora `package.json` declare `pnpm@11.25.0`. As versões aparentavam corretas e `pnpm install --force` preservou os links antigos; com essa árvore, o Admin e um scaffold mínimo falhavam no prerender. Uma cópia do `src` e da configuração, instalada pelo `pnpm-lock.yaml` em árvore limpa, passou. A instalação local foi reconstituída pelo lockfile; os junctions agora apontam para `node_modules/.pnpm` e `pnpm build` passou, gerando as 16 rotas. A causa ficou isolada no layout local de dependências, não em uma falha reproduzível do Next nem nas páginas do Admin.
- A reprodução mínima independente também passou com Next `16.4.3`, React/React DOM `19.3.0`, Node `24.22.1`, `next.config.ts` e o mesmo `globals.css`. Os issues oficiais [#93011](https://github.com/vercel/next.js/issues/93011) e [#95705](https://github.com/vercel/next.js/issues/95705) não explicam este caso, pois a instalação limpa do projeto compila.
- A leitura de sessão continua request-time: `AdminLayout` consulta claims no servidor e redireciona para `/login`; não existe leitura de dado administrativo no navegador sem sessão. Sem configuração local, `/login` responde `200` e `/`, `/pedidos` respondem `307 /login`. O aviso `NEXT_REDIRECT` da validação instantânea de desenvolvimento foi observado antes da remoção dos recursos de Cache Components; reavaliar somente quando o build estiver saudável e o ambiente Supabase local estiver configurado.
- O build deixou de ser bloqueio local. Staging e release continuam bloqueados pelos gates de baseline Supabase isolado, replay revisado das migrations, configuração segura das integrações, validação Flow por WABA, alternativas faltantes nas cestas, jornada webhook/intake/Catálogo ponta a ponta, homologação Bling sem emissão fiscal e critérios de produção acima. Não aplicar DDL nem implantar enquanto esses gates estiverem pendentes.

## Rota isolada do novo Data Endpoint

O projeto canônico já possui `whatsapp-flow-data-exchange-v1` ativo (versão 76), um proxy do Flow canário do número 1018. O candidato local foi renomeado para `whatsapp-flow-data-exchange-greenfield-v1` e o `supabase/config.toml` aponta para o novo diretório; essa rota não substitui a existente. Na homologação, cada Flow/waba deverá usar e validar o endpoint URI candidato próprio antes de qualquer publicação. Nenhuma implantação foi feita.

## Advisory de RLS em tabela existente

O advisory do Supabase aponta RLS desativado em `private.product_image_runtime_state_v2` e recomenda:

```sql
ALTER TABLE "private"."product_image_runtime_state_v2" ENABLE ROW LEVEL SECURITY;
```

A consulta de catálogo não encontrou `USAGE` do schema nem permissões `SELECT`/`INSERT`/`UPDATE` para `anon` ou `authenticated`, então não confirmou exposição atual. O RLS desativado ainda exige revisão de grants e consumidores privilegiados. Não executar essa alteração sem mapear quem lê/escreve a tabela e definir as políticas adequadas.

## Estado read-only da base Supabase local (27/10/2026)

`pnpm exec supabase migration list --local` encontrou quatro versões no banco local sem arquivo correspondente no worktree (`20261027012539`, `20261027012902`, `20261027013421`, `20261027014008`) e três migrations greenfield locais ainda pendentes (`20261027050541`, `20261027070000`, `20261027080000`) naquele momento. Isso confirma que o banco local carrega as migrations experimentais removidas quando o destino Supabase foi corrigido. Não aplicar/resetar essas versões nem tratá-las como baseline canônico; obter baseline fiel continua necessário para staging.

## Inventário remoto atualizado antes do staging (27/10/2026)

- Leitura pelo conector Supabase, usando o projeto indicado pelo proprietário: `ssbesxgaijknwsjbsbcz`, Dona Antônia, `ACTIVE_HEALTHY`, PostgreSQL `17.6.1.166`, região `sa-east-1`.
- Existe somente a branch `main`; não há branch isolada ativa. A lista remota tem 1.266 migrations e termina em `20261026120049`. Nenhuma migration local greenfield foi aplicada.
- Foram listadas 152 Edge Functions remotas. Nenhum dos 11 nomes greenfield deste checkout já existe remotamente. Continuam ativos `whatsapp-flow-data-exchange-v1` v76 e `whatsapp-meta-webhook-v1` v30; preservar ambos e manter o endpoint candidato com nome greenfield separado.
- Este snapshot não prova baseline de schema, configuração dos secrets de runtime, autorização Meta ou compatibilidade de funções. A ausência de colisão de nomes é apenas uma guarda contra substituição acidental; não libera deploy.
- A consulta foi de leitura: não houve acesso a valores secretos nem a dados de negócio, criação de branch, alteração Supabase, callback Meta, mensagem WhatsApp, escrita Bling ou emissão fiscal.

## Compatibilidade da elegibilidade de opções do Flow (27/10/2026)

- A leitura da definição remota de `basket_mold_editor_v1(uuid)` encontrou `is_active` sem `is_whatsapp_active`. A auditoria do Admin não reproduzia a regra do emissor e considerava apenas atividade geral; a RPC wrapper autorizada é `admin_basket_mold_editor_v1` e mantém `admin_users`.
- Criada localmente a migration `20261027211839_basket_flow_eligibility_v1.sql` para acrescentar a flag WhatsApp ao JSON sem alterar tabelas, autorização ou grants. A migration `20261027050541` também alinha o limite de opções do snapshot de 20 para 8, igual ao emissor.
- Snapshot agregado read-only mais recente (27/10/2026): 5 cestas ativas, 118 posições e 202 opções elegíveis em 48 produtos; as opções elegíveis têm HTTPS e preço positivo, e nenhuma etapa excede 8 opções. Todas as cinco cestas têm etapas sem opção: 22 no total (Econômica 3, Grande Completa 5, Média Completa 5, Mini Completa 4, Pequena Completa 5); 3 não têm produto ativo e 19 têm produto ativo, mas desabilitado para WhatsApp. Todas as 48 opções elegíveis têm foto cadastrada; HTTPS sintaticamente válido não prova acesso HTTP nem renderização Meta. O Admin local mostra a atividade geral e a habilitação WhatsApp separadamente e liga a pendência a `/cestas`.
- Se a RPC ainda devolver o contrato anterior sem `is_whatsapp_active`, o Admin marca o estado como não verificado, não como desabilitado, e a auditoria falha fechado até o rollout da migration.
- **Gate de rollout:** baseline isolado precisa replayar a migration completa; aplicar a extensão de RPC antes da nova versão do Admin; confirmar que o wrapper ainda autoriza staff e repassa o JSON; revisar as 22 etapas no editor sem habilitar produtos automaticamente; preservar validação de imagem e preço no emissor; validar Validator/preview por WABA. Produção continua read-only.

## Nova tentativa de dump de schema (27/10/2026)

- Consulta read-only pelo conector confirmou o estado atual do projeto canônico: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166, somente branch `main`; o inventário resumido encontrou 238 tabelas/46 views em `public`, 14 tabelas em `private` e 13 em `whatsapp_atendimento`.
- A documentação Supabase atual confirma que `supabase db dump` sem `--data-only` é schema-only. A versão local é CLI `2.122.0`; flags disponíveis confirmadas por `--help` incluem `--project-ref`, `--schema` e `--file`.
- A tentativa `pnpm exec supabase db dump --project-ref ssbesxgaijknwsjbsbcz --schema public,private,whatsapp_atendimento --file work/remote-schema-20261027.sql` parou antes de conectar com `AccessTokenRequiredError` (“Access token not provided”). A conexão OAuth do plugin permite consulta direta, mas não fornece automaticamente credencial à CLI. O arquivo de saída não foi criado; nenhuma alteração remota ocorreu.
- Não extrair nem imprimir token de gerenciamento para contornar a barreira. Próxima alternativa segura: manter o trabalho local, continuar inventário estritamente por `pg_catalog` via conector e solicitar posteriormente uma sessão CLI aprovada ou snapshot schema-only fornecido pelo proprietário antes de validar/reproduzir migrations completas. Não usar `--data-only`, não copiar dados reais e não recriar branch que executa o replay desconhecido.

## Gate adicional — disponibilidade de produto no WhatsApp (27/10/2026)

- O Admin local agora terá uma ação própria para habilitar/desabilitar `products.is_whatsapp_active`; ela não publica nem vincula itens no Catálogo Meta e não publica Flow. Nenhum produto será ativado automaticamente.
- A migration candidata `20261027211921_admin_product_whatsapp_availability_v1.sql` trava produto e associação, aceita somente `owner`, `admin` e `catalog_manager`, trata estado esperado/idempotência, atualiza apenas a flag e `updated_at` e registra a auditoria na mesma transação. A função usa `SECURITY INVOKER`/`search_path` vazio; `service_role` é o único executor.
- A gramática PostgreSQL e o corpo PL/pgSQL já foram aceitos localmente por `pglast 8.7`; isso não valida nomes/tipos contra o schema canônico nem execução. Antes de aplicar no staging, compilar a migration contra o baseline reproduzível em PostgreSQL 17, executar `deno check --frozen` para o Edge Function, confirmar `verify_jwt=true` e grants efetivos; `viewer` e papéis fora da allowlist devem falhar; papel autorizado deve habilitar/desabilitar somente a flag.
- Cenários de ativação: produto inativo, nome vazio/controle/mais de 180 unidades UTF-16, URL malformada/sem HTTPS/com credenciais/espaços/mais de 2.048 unidades UTF-16/porta acima de 65.535, ou preço fora de zero a 999.999.999 centavos devem falhar sem gravação. Testar DNS, IPv4, IPv6, porta válida e oferta inválida com fallback para o preço-base. Acessibilidade real da imagem é um gate separado no Flow Validator/preview de cada WABA.
- Confirmar conflito sem mutação para formulário desatualizado, sucesso idempotente sem nova auditoria quando o estado já é o desejado, e rollback integral de flag/auditoria ao provocar falha controlada de inserção de auditoria em staging.
- Confirmar no diff do registro que estoque, preço, custo, foto, dados fiscais, links de Catálogo e carimbos de edição não mudam. Desativar um produto que já aparece nas cestas pode deixar etapas sem opção; mostrar a auditoria e corrigir explicitamente as alternativas em `/cestas`, sem escolher ou habilitar produtos pelo sistema.
- A revisão independente apontou uma primeira validação permissiva de porta/IPv6; a migration local foi endurecida. O estado runtime não foi revalidado porque ainda não existe staging reproduzível. Produção permanece read-only.

## Causa provável do `MIGRATIONS_FAILED` e estratégia de staging (27/10/2026)

- A documentação oficial descreve o pipeline de branch como `Clone → Pull → Health → Configure → Migrate → Seed → Deploy`. Branches são data-less por padrão. Também documenta que, sem integração GitHub, projetos com migrations em `main` podem criar branches a partir das migrations existentes em vez de um dump integral do schema. Fontes: [Supabase Branching](https://supabase.com/docs/guides/deployment/branching), [branching pelo Dashboard](https://supabase.com/docs/guides/deployment/branching/dashboard) e [troubleshooting de migrations](https://supabase.com/docs/guides/deployment/branching/troubleshooting).
- A leitura read-only atual confirma que `ssbesxgaijknwsjbsbcz` continua somente com a branch `main`. A history tem 1.266 versões até `20261026120049`; as migrations greenfield do worktree não têm versão em comum. Portanto, a tentativa anterior é compatível com falha de replay/dependência do histórico, mas o erro exato da migration não foi recuperado e a causa individual não está provada.
- **Decisão de staging:** não repetir a criação de preview branch sobre esse histórico. Preparar um projeto Supabase de staging separado e persistente, inicializado por um baseline de schema-only extraído do projeto canônico em modo read-only, seguido das migrations greenfield em ordem. Staging receberá somente fixtures sintéticas e secrets exclusivos; nenhum callback, função, dado de cliente ou credencial de produção será copiado.
- O dump schema-only via CLI ainda requer uma sessão aprovada de acesso; a tentativa anterior parou por falta do Supabase Management API token antes de conectar e não criou arquivo. Usar acesso de leitura do conector para inventário enquanto isso; não recuperar nem imprimir tokens privados para contornar a barreira.
- Provisionar o projeto de staging é a próxima dependência externa. Antes de provisionar, a ferramenta Supabase exige identificar a organização e confirmar custo recorrente; essa confirmação é distinta da autorização de implementação local. Até a confirmação, continuar apenas com trabalho local e consultas read-only no canônico.
- Após o baseline: compilar todas as migrations candidatas em PostgreSQL 17; verificar Deno/config/JWT/grants; configurar secrets de homologação por WABA; executar Flow Validator e ensaios com dados/eventos sintéticos; então homologar pedidos e operações Bling sem NF-e. O lançamento de produção continua separado, e NF-e fica por último.

## Confirmação do banco do produto e revisão dos projetos (27/10/2026)

- Banco canônico do Admin, confirmado pelo proprietário: **Dona Antônia — `ssbesxgaijknwsjbsbcz`**. Nenhuma URL, secret, migration ou função do app foi redirecionada para outro projeto.
- A organização conectada contém também `hjudhofluihkxykwekir` (“Dona Antônia V2”). A inspeção read-only encontrou 20 versões de migration, schema de negócio `da_next` (não `public`), 33 tabelas e catálogo preexistente (805 linhas estimadas em `da_next.products`). Portanto, esse projeto não corresponde ao baseline do Admin atual e não deve ser tratado como staging compatível nem alterado por esta branch.
- **Incidente operacional (encerrado):** durante esta continuação, foi criado indevidamente `crkssjkmdjkohadhcsnb` (“Dona Antônia Staging”), vazio, sem migrations nem tabelas de negócio. A tentativa inicial de exclusão pela UI não se completou, e o conector Supabase não oferecia ferramenta de exclusão. Em 27/10, o proprietário informou que já havia excluído o projeto; a consulta read-only `supabase_list_projects` confirmou que a referência não aparece mais. O projeto canônico permaneceu intacto. Esta confirmação não cria um ambiente de staging substituto.
- A documentação Supabase informa que projetos em organizações pagas não podem ser pausados; computação é cobrada por hora, e excluir é irreversível e interrompe uso futuro, sem retirar uso já contabilizado no ciclo. Fontes: [pausa de projetos](https://supabase.com/docs/guides/platform/free-project-pausing), [uso de compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute) e [exclusão de projeto](https://supabase.com/docs/guides/platform/delete-project).
- Para validar o banco canônico sem trocar o alvo nem aplicar DDL nele, o bloqueio técnico permanece: não há baseline reproduzível no repositório, o branch remoto contém zero arquivos de migration, a branch `main` do projeto canônico contém 1.266 versões, e a tentativa de `db dump` local parou antes da conexão por falta de Supabase Management API token. Nenhum token será extraído/imprimido para contornar esse controle.

## Inventário de rollout: código local versus funções do projeto original (27/10/2026)

Consulta read-only ao projeto `ssbesxgaijknwsjbsbcz` encontrou 153 Edge Functions listadas como `ACTIVE` e 1.266 migrations, com a mais recente `20261026120049 whatsapp_channel_flow_bindings`. Os nomes/versionamentos abaixo são metadados; nenhum código de função nem secret foi alterado.

| Uso encontrado no Admin local | Estado no projeto canônico | Implicação |
|---|---|---|
| `admin-products-live-v1` | `ACTIVE`, versão 189 | Endpoint literal local presente no projeto. |
| `admin-basket-configuration-v1` | `ACTIVE`, versão 6 | Endpoint literal local presente no projeto. |
| `admin-basket-molds-v1` | `ACTIVE`, versão 21 | Endpoint literal local presente no projeto. |
| `admin-whatsapp-ana-preview-v1` | `ACTIVE`, versão 30 | Endpoint literal local presente no projeto. |
| `admin-whatsapp-ops-v1` | `ACTIVE`, versão 39 | Endpoint literal local presente no projeto; sua allowlist continua autoridade e não inclui envio interativo genérico. |
| `admin-product-image-v1` | ausente | Upload local não fica disponível até baseline, migration/grants e deploy controlado. |
| `admin-product-whatsapp-availability-v1` | ausente | Toggle local não funciona no banco até rollout da função/migration. |
| `admin-whatsapp-interactive-send-v1` | ausente | Botões/listas são somente código local; sem envio real. |
| `meta-account-readiness-v1` | ausente | O Admin distingue HTTP 404 da função ausente de `account_not_found` devolvido pelo handler; nenhuma das respostas é mostrada como falha do Graph nem como conexão saudável. |
| `whatsapp-order-flow-send-v1` | ausente | A ação local de enviar Flow não está disponível no backend canônico. |

O inventário de URLs literais varreu `src/lib` e `src/app`; chamadas construídas dinamicamente podem não aparecer nessa tabela. Os candidatos não estão incluídos no histórico remoto de migrations. Como o proprietário definiu o projeto original como único banco do produto, manter esta matriz como gate de publicação; build local bem-sucedido não equivale a rollout. O projeto vazio `crkssjkmdjkohadhcsnb` (“Dona Antônia Staging”) foi excluído pelo proprietário; não há staging substituto.
