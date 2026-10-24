# R16 — pré-voo do piloto controlado

Este checklist vale somente para a V2 isolada. **A R16 continua bloqueada** até haver evidência real dos gates de homologação. Não autoriza merge, deploy, publicação, alteração em produção, Meta/Bling operacional ou uso de sistemas legados.

## Estado atual — verificado em 24/10/2026

| Gate | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Código e CI | Aprovado | PR #1396 aberto e draft; branch `agent/dona-antonia-r16-pilot-preflight`, base `agent/dona-antonia-r15-audit-homologacao`. Código `93d28dc`; head documental consultado `eef2948`. Runs #40135465216 (push) e #40135468604 (pull request) passaram, incluindo smoke browser mobile/desktop. O #40134499891 pertence ao SHA anterior `93d28dc`. |
| URL de staging acessível | Bloqueado | A prévia existente é owner-only e não permite ensaio compartilhado com operadores. Criar uma URL por publicação/deploy está fora do escopo autorizado nesta rodada. |
| Seed vendável fictício | Aprovado | Três SKUs `R16-TEST-*`, estoque 30 cada, três perfis privados, três tipos, cesta `r16-test` e três movimentos. Seed delimitado à V2; rollback seletivo em `docs/R16_TEST_SEED_ROLLBACK.sql`. Não foi recriado nem alterado nesta retomada. |
| Operadores isolados | Bloqueado | Faltam 2–3 identidades reais confirmadas para teste. Nenhuma conta ou credencial foi criada sem identidade definida. |
| Backup/restore controlado | Bloqueado | Não há branch Supabase; a estimativa atual de branch é US$ 0,01344/hora, além de outros itens de uso. PITR de 7 dias consta por US$ 0,137/hora (~US$ 100/mês) e requer compute Small. Não foi habilitado nem criada cópia/restore. Teste local de rollback não prova restore remoto. |
| Autorização para piloto produtivo | Fora do escopo | Esta retomada não publica nem testa produção. A autorização produtiva continua ausente e é um gate separado para eventual piloto produtivo; o comando completo de readiness deve permanecer `blocked`. |

### Resultado atual

Há **três gates operacionais** sem evidência: URL de staging, identidades de operadores e backup/restore controlado. A autorização produtiva é um gate separado e permanece fora do escopo. Portanto, não marcar a R16 como concluída.

O PR permanece draft. O projeto Supabase V2 foi consultado somente em leitura: `ACTIVE_HEALTHY`, PostgreSQL 17.11 e nenhum branch existente. O baseline informado após o seed é 805 produtos e 805 perfis privados; não foi feita nova escrita ou recarga.

## O que falta para avançar

1. Disponibilizar uma URL V2 de staging compartilhável sem tocar no domínio/site/admin de produção.
2. Confirmar 2–3 operadores de teste e suas identidades para provisionamento isolado.
3. Definir um ensaio de backup/restore em cópia descartável que não adicione custo nem restaure sobre o projeto original. Se não existir opção gratuita/não destrutiva, manter o gate bloqueado.
4. Só tratar piloto produtivo em etapa futura, com autorização explícita separada.

## Execução quando os gates existirem

1. Congelar o commit aprovado e registrar o hash do banco V2.
2. Confirmar que a URL não aponta para produção e que os usuários são exclusivos da V2.
3. Conferir o seed e os totais antes/depois; rollback seletivo permanece em `docs/R16_TEST_SEED_ROLLBACK.sql` e não deve ser executado automaticamente.
4. Executar Lighthouse/Web Vitals, checkout, pedido, concorrência de operadores, separação e entrega apenas no staging V2.
5. Ensaiar backup/restore em uma cópia descartável; nunca restaurar sobre o projeto original como parte deste preflight.
6. Atualizar este checklist com evidências e manter bloqueado qualquer gate sem comprovação.

## Comando de auditoria

```sh
npm run r16:readiness
```

O comando não altera banco, site, contas, domínio ou integração. Como a autorização produtiva continua ausente, o resultado completo deve permanecer `blocked`.
