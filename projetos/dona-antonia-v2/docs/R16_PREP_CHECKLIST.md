# R16 — pré-voo do piloto controlado

Este checklist é exclusivo da Dona Antônia V2. O estado do comando significa apenas se há evidência para começar um ensaio isolado em staging. Ele nunca marca a R16 concluída nem autoriza produção.

## Estado em 24/10/2026

| Gate | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Código e CI | Aprovado no head de código | PR #1396 aberto e draft na branch agent/dona-antonia-r16-pilot-preflight, base agent/dona-antonia-r15-audit-homologacao. Head de código 390a0bdce81611e5e25b8e2c1eb6f47fb8f80b38. CI push #40138207500 e pull request #40138209762 passaram todos os gates, incluindo 18/18 testes browser mobile/desktop. |
| URL de staging acessível | Bloqueado | A prévia disponível é owner-only. Uma URL compartilhada exigiria publicação ou deploy, ambos fora do escopo autorizado. |
| Seed fictício V2 | Aprovado | No projeto hjudhofluihkxykwekir: R16-TEST-ARROZ, R16-TEST-FEIJAO e R16-TEST-OLEO, estoque 30 cada; três perfis privados, três tipos, cesta r16-test e três movimentos. O manifesto R16_EVIDENCE_MANIFEST.json registra SKUs, estoque, projeto e referência ao checklist. |
| Operadores isolados | Bloqueado | Faltam 2–3 operadores com identidades confirmadas. Nenhuma conta ou credencial foi criada. O manifesto aceita apenas referências pseudonimizadas e evidência revisável; não registrar dados pessoais. |
| Backup/restore controlado | Bloqueado | Não há alternativa demonstrada que seja gratuita, descartável e não destrutiva. Nenhum branch, PITR, cópia ou restore foi criado. Teste local de rollback não comprova recuperação de snapshot remoto. |
| Autorização para piloto produtivo | Fora do escopo | É um gate separado. Não bloqueia o pré-voo de staging e continua sem autorização. |

## Snapshot remoto confirmado por leitura — 24/10/2026

Projeto `hjudhofluihkxykwekir`: `ACTIVE_HEALTHY`, PostgreSQL 17.11, nenhum branch Supabase. As contagens consultadas foram 805 produtos, 805 perfis privados, 0 clientes, 0 pedidos, 0 documentos fiscais e 0 eventos de entrega. Os três produtos fictícios estavam ativos com 30 unidades cada; foram confirmados três tipos R16, a cesta `r16-test` ativa e três movimentos de estoque. A consulta foi somente leitura.

### Resultado atual do readiness

O comando npm run r16:readiness lê o manifesto versionado em docs/R16_EVIDENCE_MANIFEST.json. Ele não aceita os antigos flags DA_V2_* como evidência. Exige referência revisável, data, URL HTTPS com resposta 2xx associada ao projeto V2, SKUs e estoque esperados, duas ou três referências únicas de operadores e hashes SHA-256 de backup/restore em alvo diferente com custo registrado como zero.

Resultado local no head de código 390a0bd: blocked; o seed é o único gate operacional aprovado. Os gates de staging, operadores e backup/restore estão pendentes. A autorização produtiva é exibida como informativa. O resultado inclui roundCompleted=false e, mesmo que os gates de pré-voo sejam atendidos no futuro, não substitui a execução nem a conclusão da R16.

O comando verifica a estrutura do manifesto e a existência das referências locais em docs/. Ele não consulta Supabase, não faz probe HTTP da URL, não verifica o conteúdo de backup nem confirma identidades. A pessoa responsável precisa revisar as evidências referenciadas antes de marcar qualquer gate como verificado; os antigos flags de ambiente não podem substituir isso.

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
2. Confirmar 2–3 operadores e suas identidades antes de provisionar qualquer conta.
3. Encontrar um procedimento de backup/restore em alvo descartável, custo zero e sem restaurar sobre a origem. Se não houver, manter o gate bloqueado.
4. Registrar evidências reais no manifesto e no checklist. Não marcar a R16 concluída antes da execução dos fluxos de homologação e do aceite documentado.

As estimativas previamente verificadas para branch Supabase e PITR permanecem como razão para não criar recursos nesta rodada: branch a US$ 0,01344/hora; PITR de 7 dias a US$ 0,137/hora, aproximadamente US$ 100/mês, com compute Small. Referências: https://supabase.com/docs/guides/platform/manage-your-usage/branching e https://supabase.com/docs/guides/platform/backups.
