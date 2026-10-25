# R16 — pré-voo do piloto controlado

Este checklist é exclusivo da Dona Antônia V2. O estado do comando significa apenas se há evidência para começar um ensaio isolado em staging. Ele nunca marca a R16 concluída nem autoriza produção.

## Estado em 25/10/2026

| Gate | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Código e CI | Validador aprovado; investigação registrada | PR #1396 permanece aberto e draft na branch agent/dona-antonia-r16-pilot-preflight, base agent/dona-antonia-r15-audit-homologacao. O head `a112ec0bb19071df8e58cade1428d5ea20af3866` passou todos os gates no CI #40156596675, incluindo smoke browser mobile/desktop. Esta atualização registra a investigação de backup/restore. |
| URL de staging acessível | Aprovado para o operador autorizado | [Admin Preview V2](https://dona-antonia-v2-admin-preview.juniorsereia.chatgpt.site/admin/) continua owner-only. O Sites registra a versão 4 como concluída (`appgdep_6add6d1b4af081919ad862777fa97241`); o navegador renderizou o catálogo R16 em 25/10. A fonte do Site `0f825c25279c338fe62c230148bc5c8a3fa4fbe1` corresponde ao commit GitHub `bd894392d62e2fa0208209b60ca78ff7227800f1`. O CUA não expôs o status HTTP numérico; o manifesto mantém `httpStatus: null` e registra as evidências da implantação e da renderização. |
| Seed fictício V2 | Aprovado | No projeto hjudhofluihkxykwekir: R16-TEST-ARROZ, R16-TEST-FEIJAO e R16-TEST-OLEO, estoque 30 cada; três perfis privados, três tipos, cesta r16-test e três movimentos. O manifesto R16_EVIDENCE_MANIFEST.json registra SKUs, estoque, projeto e referência ao checklist. |
| Operador do staging | Aprovado para um usuário | O único operador informado é a conta ADMIN já confirmada. O manifesto usa referência pseudonimizada, sem gravar e-mail. A validação multioperador permanece coberta pelos testes automatizados da R10; nenhum usuário adicional será criado. |
| Backup/restore controlado | Bloqueado por conexão do banco e custo não confirmável | O caminho oficial para dump/restore em destino local requer connection string e senha PostgreSQL, Supabase CLI, Docker e psql ([guia Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform)). O conector retorna o host do projeto, mas não a senha nem a URL PostgreSQL completa. O workflow V2 não referencia secret de conexão remota. GitHub Actions em repositório privado pode ser cobrado se exceder minutos incluídos. Nenhum dump, restore ou branch foi iniciado. |
| Autorização para piloto produtivo | Fora do escopo | É um gate separado. Não bloqueia o pré-voo de staging e continua sem autorização. |

## Snapshot remoto confirmado por leitura — 24/10/2026

Projeto `hjudhofluihkxykwekir`: `ACTIVE_HEALTHY`, PostgreSQL 17.11, nenhum branch Supabase. As contagens consultadas foram 805 produtos, 805 perfis privados, 0 clientes, 0 pedidos, 0 documentos fiscais e 0 eventos de entrega. Os três produtos fictícios estavam ativos com 30 unidades cada; foram confirmados três tipos R16, a cesta `r16-test` ativa e três movimentos de estoque. A consulta foi somente leitura.

### Resultado atual do readiness

O comando npm run r16:readiness lê o manifesto versionado em docs/R16_EVIDENCE_MANIFEST.json. Ele não aceita os antigos flags DA_V2_* como evidência. Exige referência revisável, data e URL HTTPS vinculada ao projeto V2 com resposta 2xx; quando o status HTTP numérico não está disponível, aceita evidência de implantação Sites concluída, owner-only, versão identificada, commit de origem ligado a uma referência GitHub e renderização de navegador registrada. Também exige SKUs e estoque esperados, uma a três referências únicas de operadores e hashes SHA-256 de backup/restore em alvo diferente com custo registrado como zero.

Resultado em 25/10 após a validação da prévia owner-only: identidade e URL de staging estão aprovadas; backup/restore permanece pendente. O resultado geral continua `blocked` e `roundCompleted=false` somente por causa do backup/restore. A autorização produtiva é informativa e o pré-voo nunca substitui a execução nem a conclusão da R16.

O comando verifica a estrutura do manifesto e a existência das referências locais em docs/. Ele não consulta Supabase, não faz probe HTTP da URL, não verifica o conteúdo de backup nem confirma identidades; a verificação da prévia no navegador foi feita separadamente e registrada no manifesto. A pessoa responsável precisa revisar as evidências referenciadas antes de marcar qualquer gate como verificado; os antigos flags de ambiente não podem substituir isso.

### Caminho seguro avaliado para o backup/restore

A opção tecnicamente adequada é gerar um dump lógico do projeto V2 real e restaurá-lo em uma instância local descartável (sem escrever de volta na origem), seguindo o [guia oficial de restore para self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform). A documentação exige connection string e senha do banco, Supabase CLI, Docker e psql; o dump separa roles, schema e dados. O CI atual testa migrations em PostgreSQL descartável, mas não usa uma conexão com o banco Supabase.

O conector Supabase só entrega o host db.hjudhofluihkxykwekir.supabase.co, sem senha ou connection string completa. O secret de Actions, se já existir, não pode ser consultado pelo conector. Também não é possível confirmar a franquia restante de Actions: em repositórios privados, uso além dos minutos incluídos pode gerar cobrança ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). Por isso, nenhum job que possa acessar a base ou gerar custo será iniciado sem conexão segura e execução sem cobrança.

O teste local do rollback de seed e o replay de migrations continuam úteis para integridade do schema, mas não substituem esse restore de dados reais do V2.

## Rollback do seed

O arquivo docs/R16_TEST_SEED_ROLLBACK.sql continua manual e não foi executado no Supabase. Sem pedidos, reservas ou histórico adicional, remove as linhas determinísticas, incluindo o vínculo em basket_extra_types. Se encontra pedido, reserva, movimento adicional, vínculo de catálogo fora do seed ou associação com outra cesta, desativa produtos, tipos e cesta e preserva a trilha existente.

O teste PostgreSQL descartável via PGlite percorre os dois caminhos: exclusão limpa do seed sem histórico e arquivamento após criar referências de pedido, item e reserva. Esses testes não conectam ao projeto remoto nem provam restore de backup.

## Evidências e isolamento

- Testes locais: npm test — 132/132; npm run test:db — 20 migrations/33 tabelas, incluindo os dois caminhos do rollback; npm run check; npm run r16:readiness; lint; format:check; arquitetura (138 arquivos); build; git diff --check — aprovados.
- CI do head de código 390a0bd: auditoria de dependências, lint/formato, arquitetura, migrações PostgreSQL, TypeScript, testes, build sem deploy e smoke browser passaram.
- Estado remoto conhecido da V2: ACTIVE_HEALTHY, PostgreSQL 17.11, 805 produtos e 805 perfis privados, zero clientes, zero pedidos, zero documentos fiscais e zero eventos de entrega. Nesta atualização não houve escrita no banco.
- Nenhum branch Supabase novo, usuário real, credencial, custo, deploy, publicação, restore ou integração operacional foi acionado.
- PR #1396 permanece draft e sem merge. main, produção, site/admin em uso, Supabases legados, atendimento, Meta/Bling operacionais, DNS e workflows de produção permaneceram intocados.

## Bloqueios para avançar

1. Disponibilizar URL V2 compartilhável sem publicar ou alterar produção.
2. Operador único confirmado pelo usuário; não provisionar contas adicionais.
3. Encontrar um procedimento de backup/restore em alvo descartável, custo zero e sem restaurar sobre a origem. Se não houver, manter o gate bloqueado.
4. Registrar evidências reais no manifesto e no checklist. Não marcar a R16 concluída antes da execução dos fluxos de homologação e do aceite documentado.

As estimativas previamente verificadas para branch Supabase e PITR permanecem como razão para não criar recursos nesta rodada: branch a US$ 0,01344/hora; PITR de 7 dias a US$ 0,137/hora, aproximadamente US$ 100/mês, com compute Small. Referências: https://supabase.com/docs/guides/platform/manage-your-usage/branching e https://supabase.com/docs/guides/platform/backups.

## Verificação das alternativas após autorização — 24/10/2026

A autorização para executar não remove os pré-requisitos de segurança e de evidência:

- **Prévia existente:** “Dona Antônia V2 · Admin Preview” está publicada no URL já registrado no dossiê, mas a audiência está em modo custom e inclui somente o proprietário. A versão salva #2 registra o source SHA `8e0a78ad450393786d50406954f1f885c66584f1`, não resolvido como commit em `SUCEDOAN12`; assim, não se comprovou que o conteúdo publicado corresponde ao head atual da branch R16. O Sites oferece modo público, que permite acesso a qualquer pessoa com o link; não foi escolhido para uma interface administrativa. O acesso restrito a operadores pode ser concedido por lista de e-mails quando as identidades forem informadas.
- **Workflow GitHub existente:** `.github/workflows/dona-antonia-v2-preview-publish.yml` só roda por dispatch manual com `authorize_preview=true`; o build é explicitamente sem Supabase, WhatsApp e Bling; a publicação altera `/site1` e `/admin1` e executa push para `main`. Esse workflow não é uma URL isolada para homologação R16 e não foi executado.
- **Operadores:** o usuário confirmou que será o único operador, usando a conta ADMIN V2 previamente confirmada. O e-mail não é repetido no checklist; a referência no manifesto é pseudonimizada. Nenhuma senha ou conta adicional foi criada.
- **Backups:** a documentação Supabase informa backup diário automático para projetos Pro/Team/Enterprise (retenção de 7 dias no plano Pro). Isso não demonstra um restore isolado. O conector Supabase disponível não lista nem baixa snapshots; a ação de restore disponível atua no projeto informado. A alternativa oficial “Restore to a new project” requer projeto adicional e mostra custos antes da criação; não foi iniciada. Referências: [Database Backups](https://supabase.com/docs/guides/platform/backups) e [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

**Ações não executadas:** nenhuma mudança de audiência do Site; nenhum convite; nenhum push para `main`; nenhum deploy de staging; nenhum branch/projeto adicional Supabase; nenhum restore ou custo. R16 permanece bloqueada. O próximo passo operacional para abrir o staging de forma restrita é receber os e-mails reais dos operadores; o restore segue bloqueado até existir método zero-custo em alvo descartável.

