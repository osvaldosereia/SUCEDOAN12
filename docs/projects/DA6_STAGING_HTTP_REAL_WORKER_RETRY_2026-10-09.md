# DA6 — Ensaio hospedado real de HTTP/pg_net e retentativas de worker

**Data:** 09/10/2026. **Natureza:** ensaio remoto com dados 100% artificiais. **NÃO** é homologação de fotografias reais, impressão física, backup ou produção. **Sem aprovação dos gates do release.**

## Ambiente e proteção

- Projeto Supabase de staging isolado: `jxfxyqcpxoykdxbapswi`, branch `da6-qa-20261009`, parent canônico `ssbesxgaijknwsjbsbcz`, `with_data=false`.
- Edge hospedada `admin-products-live-v1` versão 163 (implantada em R9), integrada ao Vault da própria branch; `pg_net` realizou chamadas **à URL da própria branch**, nenhuma chamada ao domínio do projeto produtivo.
- Todos os cinco agendamentos da branch continuam **desativados**, inclusive o DA6; invokes foram manuais/individuais. Tokens foram buscados pelo SQL diretamente do Vault para uso exclusivamente no cabeçalho HTTPS; **nenhuma chave foi revelada**.
- O código faz checagem própria de segredo `x-da6-worker-key`, apesar de `verify_jwt=false` na função hospedada. Não confundir essa exceção de segurança com autorização de acesso público ao worker.

## Resultados HTTP hospedados, confirmados em `net._http_response`

| ID pg_net | Teste | HTTP | Resultado |
|---:|---|---:|---|
| 1 | Health API sem sessão | 200 | `ok:true`, serviço certo |
| 2 | Worker POST sem chave | 401 | `worker_auth_required` |
| 3 | Worker POST com chave incorreta de 64 caracteres | 401 | `worker_auth_required` |
| 4 | Worker POST com chave correta obtida do Vault, fila vazia | 200 | `processed:0` |
| 5 | Consultar lotes como usuário sem Bearer | 401 | `admin_auth_required` |
| 6 | GET no worker, exigido POST | 405 | `method_not_allowed` |
| 7 | Foto artificial sem blob no Storage, chamada autenticada | 200 | `processed:1`, `retry`, `attempts:1`, erro `storage_read_failed` |
| 8 | Mesma foto, reabilitação manual do `next_attempt_at` no staging | 200 | `processed:1`, `retry`, `attempts:2` |
| 9 | Terceira tentativa da mesma foto artificial | 200 | `processed:1`, `failed`, `attempts:3`, sem nova retentativa |
| 10 | Quarta chamada após estado `failed` | 200 | `processed:0`; continua `failed`, 3 tentativas |

**Nota técnica:** HTTP 200 nos testes de foto significa que a execução do worker respondeu corretamente; **não** significa foto decodificada. A ausência proposital do arquivo no Storage foi o cenário de falha para exercitar o retry. O backoff real de 15/60 segundos foi configurado pelo banco; no ensaio, o campo `next_attempt_at` do **único item artificial** foi antecipado manualmente para testar todas as transições. Portanto, o ensaio comprova o limite e a máquina de estados, **não** tempos reais de agendamento automático.

## Fixture isolada e limpeza concluída

Criados exclusivamente no staging e usados apenas para exercitar a fila:
- Um `auth.users` artificial com e-mail nulo, marcado `da6_synthetic_test=true`, UUID prefixo `11111111`.
- Um lote artificial, UUID prefixo `22222222`.
- Uma única fotografia fictícia `DA6-STAGING-ARTIFICIAL-DOES-NOT-EXIST.png`, UUID prefixo `33333333`, sem bytes nem objeto no Storage.
- Não foram criados contatos, pedidos, mensagens, notas fiscais, vendas, produtos ou lançamentos de estoque.

Após constatar `failed` com três tentativas e quarta execução sem trabalho, excluídos **somente** os três registros artificiais sob condições estritas; consulta final: `users=0, batches=0, photos=0, counts=0, reviews=0` na branch. Produção reconsultada: zero lotes/fotos/contagens DA6; nenhum deploy, alteração de cron, Bling ou estoque na produção.

## Diagnóstico mais específico de `MIGRATIONS_FAILED`

- **Produção:** 1.187 migrações registradas em `supabase_migrations.schema_migrations`; **branch:** 145 migrações herdadas até `20260908200406`, seguidas de seis migrações exclusivas aplicadas para homologação DA6. A branch aparece `preview_project_status=ACTIVE_HEALTHY`, mas `status=MIGRATIONS_FAILED`; não mascarar esse resultado.
- A **primeira migração existente na produção mas ausente na branch** é `20260908200932`, `whatsapp_sales_official_resources_homologation_v1`. Seu SQL faz checagem de pré-condições em `public.automation_config`, inclusive `whatsapp_release_mode='live'` e `whatsapp_sales_mvp_enabled=true`, e lança erros se não estiverem satisfeitas.
- Consulta no staging: `automation_config.id=1` com `whatsapp_release_mode='off'`, `whatsapp_sales_mvp_enabled=false`, `whatsapp_live_canary_percent=0` e integrações de Bling desligadas. Logo, essa migração **falharia se reaplicada sem alterar seu contexto**. Isso é uma causa plausível e verificável da interrupção, embora os logs específicos do workflow de criação não tenham sido obtidos para estabelecer causalidade absoluta.
- Não alterar o staging para `live` nem habilitar WhatsApp/financeiro apenas para passar uma migração histórica; tampouco marcar artificialmente as outras ~1.000 migrações como aplicadas, rebase/reset destrutivo ou merge da branch para produção.
- Documentação de Supabase sobre migrações de branch orienta investigar o passo de implantação e revisar histórico/DDL; branches podem ter drift se o histórico do banco principal não reproduz mais a configuração real.

## Estado do release e próximos passos

**Comprovado remotamente nesta rodada:** health, negativas de autenticação e método, worker autenticado com fila vazia, worker com item artificial inválido passando de `queued` para `retry` (duas vezes), `failed` após três, sem quarta tentativa, integridade da limpeza.

**NÃO comprovado ainda:** upload assinado real de imagens para o Storage hospedado, fotos 10/50/100 com QR/OMR de celular real, worker processando fotos corretas, throughput/memória, cron automático com fila preenchida e `net.http_post`, impressão física 203 dpi 100×150, backup restaurável, ensaio de rollback, `MIGRATIONS_FAILED` resolvido, reconciliação atual de `main` e aprovação de release.

A branch remunerada cobra **US$ 0,01344/hora**, fora do Spend Cap. Revisar uso e excluí-la ao terminar os testes, nunca deixá-la esquecida.

**Release:** PR #987 continua DRAFT; `release_status=blocked`, `release_candidate_fingerprint=null`, os **sete** gates permanecem `passed:false`.
