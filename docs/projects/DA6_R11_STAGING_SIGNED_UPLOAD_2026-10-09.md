# DA6 R11 — Ensaio remoto de uploads assinados (09/10/2026)

**Escopo:** Supabase staging DA6 jxfxyqcpxoykdxbapswi somente. Não é aprovação de release ou teste físico.

## Implementação do ensaio
- GitHub tests/da6-hosted-signed-upload-qa-edge.ts contém helper de teste exclusivamente para a URL do staging, protegido por segredo DA6 armazenado no Vault e comparado antes de qualquer criação de dados.
- Cria Auth user artificial com email .invalid e senha aleatória em memória, faz login verdadeiro, atribui papel operator apenas na branch, cria lote via gateway DA6, reserva fotos via RPC, obtém URL assinada e envia por cliente anon usando uploadToSignedUrl. Confirma pelo gateway, confere status e aciona manualmente worker. Ao terminar elimina usuário, lote, fotos e objetos.
- A primeira execução com senha artificial de 80 caracteres falhou na regra Auth (máximo 72); ajustada para 48. PNGs artificiais distintos usam chunk de metadados individual para SHA-256 exclusivo. Tamanho 1×1 é intencionalmente rejeitado pelo leitor OMR.

## Provas HTTP hospedadas (net._http_response do staging)

| Request pg_net | Resultado | Interpretação |
|---|---|---|
| 11 | HTTP 401 qa_auth_required | Helper sem chave rejeitado |
| 12 | HTTP 500, senha QA >72 | Falha de fixture, nenhum resíduo |
| 13 | HTTP 200, uploaded=1/count=1 | **Um upload assinado completo, confirmado, enfileirado, worker acionado e cleanup** |
| 14 | HTTP 200, uploaded=10/count=10 | **Dez imagens distintas assinadas, confirmadas no mesmo lote, status queued=10; worker acionado e cleanup** |
| 15 | HTTP 500, uploaded=13/count=50 | Lote 50 **NÃO** passou: rate limit por trace com retry sugerido de 55018 ms; parada controlada e cleanup |
| 16 | HTTP 401 UNAUTHORIZED_NO_AUTH_HEADER | Helper desabilitado e novamente protegido por JWT |

**Origem do limite:** invocações internas Edge→Edge compartilham um limite por trace, documentado em https://supabase.com/docs/guides/functions/recursive-functions e https://supabase.com/docs/guides/troubleshooting/edge-function-error-rate-limit-exceeded-for-trace-1094d3. O helper de QA fazia várias chamadas internas ao gateway numa única invocação. O componente real do Admin em vitrine/admin/inventory-label-photo-upload.js envia arquivos sequencialmente a partir do navegador (não é a mesma chamada Edge aninhada). Isso **não comprova** o processamento de lote hospedado de 50 nem de 100 arquivos; ambos seguem pendentes.

## Segurança e estado final
- Limpeza verificada no staging: auth.users=0, admin_users=0, inventory_label_batches=0, inventory_label_photos=0, inventory_label_counts=0 e storage.objects do bucket de fotos DA6=0.
- Os cinco cron jobs da branch ficaram desativados. Nenhuma operação em produção ou Bling.
- A Edge temporária da6-qa-signed-upload foi substituída na branch **pela versão 4 desabilitada**, verify_jwt=true, código versionado em tests/da6-hosted-qa-disabled-edge.ts. Chamadas anônimas retornaram HTTP 401. O código completo de ensaio foi preservado apenas em tests/, para redeploy deliberado SOMENTE em staging durante janela de teste.
- PR #987 continua em rascunho. CI digital de código DA6 anterior 6/6 jobs, 87/87 testes passou. O status Supabase MIGRATIONS_FAILED não foi resolvido nesta rodada; não mascarar com configuração de WhatsApp live.
- Branch staging paga US$ 0,01344/hora mais eventual uso, fora do Spend Cap. Excluir quando os ensaios terminarem.

## Caminho crítico restante
1. Testar lotes 50 e 100 por chamadas externas independentes (browser real ou múltiplos traces), sem ultrapassar rate limit.
2. Homologar etiqueta impressa fisicamente a 203dpi em papel 100×150mm, fotografar com celular real, testar 0/1/7/10/23/99 e cenários ambíguos.
3. Cron hospedado ativo sob ensaio controlado com fila real, backup e rollback.
4. Diagnosticar o pipeline MIGRATIONS_FAILED sem rebase/reset destrutivo e reconciliar main concorrente.

**Todos os sete gates do manifesto de release permanecem false; release_status=blocked e fingerprint=null.**
