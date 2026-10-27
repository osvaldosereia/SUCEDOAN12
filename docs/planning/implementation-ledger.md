# Ledger de implementação — Admin WhatsApp Sucedoan

**Plano:** `docs/planning/plano-execucao.md`
**Base:** `e324e3c095f90be6cbda8dcdd3a89b3cecab7463` (`main`, repositório limpo)
**Branch:** `codex/whatsapp-admin-greenfield-20261026`

## Regras

- Aplicação greenfield; nenhum código de branches antigas é copiado.
- Documentos oficiais Meta prevalecem sobre achados de histórico; validações por WABA continuam gates.
- Segredos e dados reais não entram em código, Git, logs ou documentos.
- Não ativar escrita de produção, enviar mensagens comerciais nem emitir nota fiscal durante desenvolvimento.
- Manter verificação focada em integridade de pedido, acesso, webhook/Flow e build necessário.

## Estado e decisões

- `main` foi verificada no commit de limpeza e não contém arquivos de aplicação.
- Clonagem rasa somente da `main`; histórico de código não foi buscado para reaproveitamento.
- O histórico GitHub pesquisado permanece referência de requisitos/integrações; o aplicativo atual é greenfield e não importa código antigo.
- Uma busca de PRs confirmou a existência da draft PR histórica #1422 em outra branch; ela foi deixada intacta. Este trabalho mantém base `main` limpa e branch própria, sem duplicar PR nem trazer commits/código antigos.
- Ambiente: Next.js 16.4.3, React 19.3.0, Node 24.22.1 e pnpm 11.25.0. Biome substitui o ESLint inicial incompatível; Lucide fornece ícones simples.
- `flow_token` aleatório é correlator (hash persistido), não autenticação; validar echo no `nfm_reply` por WABA antes de fechar checkout.
- Fotos em todas as alternativas do Flow continuam obrigatórias; versões/limites ficam sujeitos a documentação e validação atuais da Meta.
- O painel não mostra métricas, produtos, pedidos ou clientes inventados. As conexões aparecem como pendentes até a validação real.
- Supabase destino read-only conferido: ref correta `wvpzudjujtmyspluwhvx`, 19 tabelas, RLS ligado, 2 migrations. Produtos: 1.928, todos inativos/`needs_review`; 1.798 fotos pendentes, zero `product_images` e zero Storage buckets. Auth users e staff profiles ainda são zero. Snapshot detalhado e limitantes no fim de `caderno-tecnico.md`.
- 17 findings do Advisor indicam RLS ligado sem policy (`INFO`, fail-closed); há somente duas políticas de leitura de catálogo aprovado. 3 integrações estão desligadas (2 Meta, 1 Bling) e escritas externas desligadas. Nenhum valor de secret/account reference foi lido.
- Tipos TypeScript gerados read-only a partir das 14 tabelas `public` do destino e salvos em `src/lib/supabase/database.types.ts`; schema `app_private` não é exportado para o cliente. Regenerar depois de cada migração revisada.
- Decisão de implementação de sessão: usar `@supabase/ssr` com clientes browser/server; `src/proxy.ts` chama `auth.getClaims()` para atualizar/validar claims e `requireStaff()` no layout protegido exige sessão e perfil `staff_profiles.enabled=true` com papel conhecido. O guard falha fechado em erro/RLS. O browser recebe só URL e chave publicável; sem signup, service role ou provisionamento automático.
- Migration local concede `SELECT` em `staff_profiles` somente ao próprio `auth.uid()`; funcionários não podem alterar o próprio papel nem ler a tabela de clientes.
- Autorização atual ainda não é considerada pronta para operação: o destino não tem usuários/perfis e nega acesso às tabelas do painel por RLS/grants; policies/grants mínimos e matriz papel/ação são pré-requisito da próxima etapa antes de habilitar dados reais.
- Corrigida leitura de `searchParams` no login: a tentativa inicial acionava runtime data fora de `<Suspense>` sob Cache Components. Como o login não precisa diferenciar mensagens de acesso, o fluxo ficou estático e usa mensagens genéricas; isso evita indicar a existência de usuário.
- Supabase CLI fixado em `2.122.0` após conferir a versão estável do registry e consultar comandos com `--help`; Docker Engine `29.9.2` está disponível. `supabase/config.toml` usa Postgres 17, signup geral e por email/seeds/exposição automática desligados e apenas schema `public` na API.
- Stack local saudável: Postgres `17.11.0.006`, Auth, REST, Storage, Realtime, Studio e Edge Runtime. No Windows, `logflare` e `vector` ficam fora porque o Vector tentou acessar a API do daemon Docker em TCP `2375`, ausente nesta instalação; não habilitar listener TCP do Docker apenas para logs locais.
- O CLI não está autenticado no Supabase Management API (`projects list` retornou `AccessTokenRequiredError`). O conector MCP foi usado somente para catálogo SQL read-only; não procurar, registrar ou copiar um PAT para a máquina. Há duas migrations locais resetáveis, sem fixtures nem linhas reais.
- Snapshot read-only complementar: extensões `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1` e `uuid-ossp 1.1`; `ltree` e `btree_gist` não estão instaladas. Não foram lidos corpos de funções, linhas comerciais ou secrets. Revisar uso de `pgcrypto` antes de concluir que atualização minor 17.11 não exige ação.
- Migrações remotas confirmadas por consulta read-only: `20261026230047_initial_dona_antonia_clean_schema` e `20261027003330_stage_legacy_product_images_for_safe_copy`. O patch histórico da PR #1422 mostra um `db/001_schema.sql` experimental para schema `da_next` removido; não é base do projeto atual e não foi reaproveitado.

## Progresso

- [x] Preparação documental copiada e links internos ajustados em `docs/planning/`.
- [x] Aplicação Next.js criada na raiz; oito rotas iniciais: Visão geral, Atendimento, Pedidos, Cestas, Produtos, Clientes, ANA e Configurações.
- [x] Shell responsivo com navegação curta, estados de preparação claros e sem dados reais/mocks enganosos.
- [x] Scripts pnpm configurados: `format`, `lint`, `typecheck`, `build`.
- [x] Login interno inicial, clientes Supabase SSR e proteção fail-closed do layout administrativo implementados; sem provisionar usuário ou alterar o Supabase remoto.
- [x] Validação focada desta fatia: `pnpm lint`, `pnpm typecheck` e `pnpm build` concluídos com sucesso; `/login` respondeu 200 no servidor de desenvolvimento antes do ajuste de renderização e build passou após ele. Não se alegou login real, indisponível sem Auth user/policy no destino.
- [x] Conferência visual no navegador local: layout mobile sem overflow horizontal; navegação e conteúdo inicial presentes.
- [x] Commits `6ed4c3e`, `aa6688f` e `83401e2` publicados na branch remota `codex/whatsapp-admin-greenfield-20261026`; PR será aberto quando houver uma entrega funcional apropriada para revisão, evitando duplicar a draft histórica existente.
- [x] Inicializar CLI e stack Supabase local; validar health dos serviços necessários à aplicação.
- [x] Gerar snapshot local sem registros das 19 tabelas com constraints, índices, RLS, policies e grants; `supabase db reset` aplicou as migrations com sucesso. Verificação local: 19/19 tabelas com RLS, 82 constraints, 53 índices, 3 policies; funcionário lê só o próprio perfil, customers seguem negados, service_role preservado e defaults públicos futuros fechados.
- [x] Confirmar no Auth local `disable_signup=true`; nenhuma mudança foi feita no Supabase remoto, Meta ou Bling.
- **Próxima fatia:** definir e implementar grants/policies por papel, então validar acesso positivo/negativo com pgTAP e testar login com usuário sintético local. Manter provisionamento manual e escritas externas desligadas.

Nenhum valor de segredo foi lido, registrado ou transmitido. Nenhuma escrita foi feita no Supabase remoto, Meta ou Bling; as duas migrations foram aplicadas somente na stack Supabase local.
