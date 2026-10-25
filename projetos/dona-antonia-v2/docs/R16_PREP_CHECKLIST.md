# R16 — pré-voo do piloto controlado

Este checklist é exclusivo da Dona Antônia V2. O estado do comando significa apenas se há evidência para começar um ensaio isolado em staging. Ele nunca marca a R16 concluída nem autoriza produção.

## Estado em 25/10/2026

| Gate | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Código e CI | Validador aprovado; investigação registrada | PR #1396 permanece aberto e draft na branch agent/dona-antonia-r16-pilot-preflight, base agent/dona-antonia-r15-audit-homologacao. O head `a112ec0bb19071df8e58cade1428d5ea20af3866` passou todos os gates no CI #40156596675, incluindo smoke browser mobile/desktop. Esta atualização registra a investigação de backup/restore. |
| URL de staging acessível | Aprovado para o operador autorizado | [Admin Preview V2](https://dona-antonia-v2-admin-preview.juniorsereia.chatgpt.site/admin/) continua owner-only. O Sites registra a versão 4 como concluída (`appgdep_6add6d1b4af081919ad862777fa97241`); o navegador renderizou o catálogo R16 em 25/10. A fonte do Site `0f825c25279c338fe62c230148bc5c8a3fa4fbe1` corresponde ao commit GitHub `bd894392d62e2fa0208209b60ca78ff7227800f1`. O CUA não expôs o status HTTP numérico; o manifesto mantém `httpStatus: null` e registra as evidências da implantação e da renderização. |
| Seed fictício V2 | Aprovado | No projeto hjudhofluihkxykwekir: R16-TEST-ARROZ, R16-TEST-FEIJAO e R16-TEST-OLEO, estoque 30 cada; três perfis privados, três tipos, cesta r16-test e três movimentos. O manifesto R16_EVIDENCE_MANIFEST.json registra SKUs, estoque, projeto e referência ao checklist. |
| Operador do staging | Aprovado para um usuário | O único operador informado é a conta ADMIN já confirmada. O manifesto usa referência pseudonimizada, sem gravar e-mail. A validação multioperador permanece coberta pelos testes automatizados da R10; nenhum usuário adicional será criado. |
| Backup/restore controlado | Pendente: conexão PostgreSQL e restauração local isolada | O caminho oficial de dump/restore requer connection string e senha PostgreSQL, Supabase CLI, Docker e psql ([guia Supabase](https://supabase.com/docs/guides/self-hosting/restore-from-platform)). O conector entrega o host do projeto, mas não a senha nem a URL completa. O CI do repositório público passou no head documental `7321a35` (run #40157448942), mas não acessa o banco e não comprova backup/restore. Nenhum dump, restore ou branch foi iniciado. |
| Autorização para piloto produtivo | Fora do escopo | É um gate separado. Não bloqueia o pré-voo de staging e continua sem autorização. |

## Snapshot remoto confirmado por leitura — 24/10/2026

Projeto `hjudhofluihkxykwekir`: `ACTIVE_HEALTHY`, PostgreSQL 17.11, nenhum branch Supabase. As contagens consultadas foram 805 produtos, 805 perfis privados, 0 clientes, 0 pedidos, 0 documentos fiscais e 0 eventos de entrega. Os três produtos fictícios estavam ativos com 30 unidades cada; foram confirmados três tipos R16, a cesta `r16-test` ativa e três movimentos de estoque. A consulta foi somente leitura.

### Resultado atual do readiness

O comando npm run r16:readiness lê o manifesto versionado em docs/R16_EVIDENCE_MANIFEST.json. Ele não aceita os antigos flags DA_V2_* como evidência. Exige referência revisável, data e URL HTTPS vinculada ao projeto V2 com resposta 2xx; quando o status HTTP numérico não está disponível, aceita evidência de implantação Sites concluída, owner-only, versão identificada, commit de origem ligado a uma referência GitHub e renderização de navegador registrada. Também exige SKUs e estoque esperados, uma a três referências únicas de operadores e hashes SHA-256 de backup/restore em alvo diferente com custo registrado como zero.

Resultado em 25/10 após a validação da prévia owner-only: identidade e URL de staging estão aprovadas; backup/restore permanece pendente. O resultado geral continua `blocked` e `roundCompleted=false` somente por causa do backup/restore. A autorização produtiva é informativa e o pré-voo nunca substitui a execução nem a conclusão da R16.

O comando verifica a estrutura do manifesto e a existência das referências locais em docs/. Ele não consulta Supabase, não faz probe HTTP da URL, não verifica o conteúdo de backup nem confirma identidades; a verificação da prévia no navegador foi feita separadamente e registrada no manifesto. A pessoa responsável precisa revisar as evidências referenciadas antes de marcar qualquer gate como verificado; os antigos flags de ambiente não podem substituir isso.

### Caminho seguro avaliado para o backup/restore

A opção adequada é fazer um dump lógico do projeto V2 e restaurá-lo em uma instância PostgreSQL local descartável, sem escrever de volta na origem, seguindo o [guia oficial Supabase para restore em ambiente self-hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform). O procedimento requer connection string e senha PostgreSQL, Supabase CLI, Docker e psql. Não exige criar projeto ou branch Supabase.

O conector Supabase expõe o host `db.hjudhofluihkxykwekir.supabase.co`, mas não a senha nem a connection string completa. A credencial deve ser recuperada pelo proprietário em canal seguro e usada localmente; não deve ser colada neste chat, gravada no repositório ou injetada em um workflow público. O CI executado no GitHub verifica o código e permanece sem acesso ao banco remoto.

O dump e o restore ainda não foram iniciados. Depois da execução local, registrar hashes SHA-256, alvo, resultado, custo zero de infraestrutura Supabase e evidência de validação no manifesto. Os testes do rollback de seed e o replay das migrations em PostgreSQL descartável continuam úteis, mas não substituem o restore dos dados do V2.

## Rollback do seed

O arquivo docs/R16_TEST_SEED_ROLLBACK.sql continua manual e não foi executado no Supabase. Sem pedidos, reservas ou histórico adicional, remove as linhas determinísticas, incluindo o vínculo em basket_extra_types. Se encontra pedido, reserva, movimento adicional, vínculo de catálogo fora do seed ou associação com outra cesta, desativa produtos, tipos e cesta e preserva a trilha existente.

O teste PostgreSQL descartável via PGlite percorre os dois caminhos: exclusão limpa do seed sem histórico e arquivamento após criar referências de pedido, item e reserva. Esses testes não conectam ao projeto remoto nem provam restore de backup.

## Evidências e isolamento

- Testes locais: npm test — 132/132; npm run test:db — 20 migrations/33 tabelas, incluindo os dois caminhos do rollback; npm run check; npm run r16:readiness; lint; format:check; arquitetura (138 arquivos); build; git diff --check — aprovados.
- CI do head documental `7321a35ab7919620f130d94965eadbf1888d1de1` (run #40157448942): auditoria de dependências, lint/formato, arquitetura, migrações PostgreSQL, TypeScript, testes, build sem deploy e smoke browser passaram.
- Estado remoto conhecido da V2: ACTIVE_HEALTHY, PostgreSQL 17.11, 805 produtos e 805 perfis privados, zero clientes, zero pedidos, zero documentos fiscais e zero eventos de entrega. Nesta atualização não houve escrita no banco.
- Nesta rodada não foi criado branch Supabase, conta adicional, credencial, recurso pago ou integração operacional. A única publicação registrada é o Admin Preview V2 owner-only v4, restrito ao operador autorizado; não houve deploy em produção.
- PR #1396 permanece draft e sem merge. main, produção, site/admin em uso, Supabases legados, atendimento, Meta/Bling operacionais, DNS e workflows de produção permaneceram intocados.

## Bloqueios para avançar

1. O proprietário precisa obter a connection string e a senha PostgreSQL do projeto V2 em canal seguro; não enviar credenciais por chat nem gravá-las no Git.
2. Executar o dump e restaurá-lo em um PostgreSQL local descartável; verificar o resultado e registrar hashes SHA-256, alvo e evidência no manifesto.
3. Depois do restore, revisar as evidências e executar os fluxos restantes de homologação antes de marcar a R16 concluída. A autorização produtiva continua sendo um gate separado e fora deste pré-voo.

As estimativas previamente verificadas para branch Supabase e PITR permanecem como razão para não criar recursos: branch a US$ 0,01344/hora; PITR de 7 dias a US$ 0,137/hora, aproximadamente US$ 100/mês, com compute Small. Referências: https://supabase.com/docs/guides/platform/manage-your-usage/branching e https://supabase.com/docs/guides/platform/backups.

## Registro histórico — estado anterior de 24/10/2026

Este registro descreve a investigação feita antes da publicação da versão 4 do Admin Preview. Para a prontidão atual, valem a tabela de estado em 25/10 e o manifesto.

- A prévia antiga ainda não tinha vínculo comprovado com o head da branch. Essa pendência foi substituída pela verificação da versão 4, owner-only, com fonte GitHub e renderização documentadas acima.
- A configuração antiga do workflow de publicação em `.github/workflows/dona-antonia-v2-preview-publish.yml` não foi executada; continua fora do fluxo de staging porque publica em `main` e altera `/site1` e `/admin1`.
- Não foi criado projeto ou branch Supabase para restaurar dados. A alternativa “restore to a new project” não foi iniciada devido ao custo de infraestrutura.
- O PR #1396 permanece draft e sem merge. O domínio público da loja, `main`, bases legadas, DNS e integrações operacionais de Meta/WhatsApp/Bling não foram alterados.
