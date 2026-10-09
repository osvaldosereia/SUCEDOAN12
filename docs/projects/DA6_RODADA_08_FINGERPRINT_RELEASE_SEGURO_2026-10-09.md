# DA6 — Rodada 8: vínculo de evidências à versão do código (2026-10-09)

**Estado:** testes de software aprovados; publicação AINDA BLOQUEADA. Nenhuma migração nem deploy na produção.

## Evidências verificadas
- GitHub [CI #37970603286](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37970603286), commit `773274c57bf181066bf4ee016d6dd92f65765f0f`: **6/6 jobs SUCCESS**.
- Job `deterministic-tests`: **74 PASS, 0 FAIL**. `edge-types`, `postgres-review`, `postgres-upload`, `postgres-worker` e `local-supabase-storage`: SUCCESS.
- PR [#987](https://github.com/osvaldosereia/SUCEDOAN12/pull/987): draft, `mergeable=true`. A branch estava 200 commits à frente e 1 atrás da main após esta rodada; alterações concorrentes continuam possíveis.
- Nenhuma impressão física ou Edge remota de staging foi homologada nesta rodada.

## Implementação desta continuação
1. `scripts/da6-release-fingerprint.mjs`: calcula SHA-256 estável do conteúdo dos arquivos críticos do DA6 (incluindo HTML do Admin, JS/CSS, bibliotecas embarcadas, API/worker Deno, gateway, migrações e workflow); inclui automaticamente novos módulos DA6. Arquivos externos e symlinks para fora do repositório são rejeitados.
2. `scripts/da6-release-gate.mjs`: exige `manifest.release_candidate_fingerprint` válido e correspondente ao estado atual do código; caso falte ou difira, retorna gate `source_fingerprint` pendente. Não executa deploy.
3. `docs/projects/DA6_RELEASE_GATES_2026-10-09.json`: chave `release_candidate_fingerprint` permanece `null`; **nenhuma evidência física foi artificialmente aprovada**.
4. `tests/da6-release-fingerprint.test.cjs`: cinco testes verificam inclusão de códigos críticos, mudança de um byte no JS/gateway/SQL, inclusão de novo módulo, não invalidação por editar documentação e bloqueio de `--enforce` sem provas físicas.
5. `docs/projects/DA6_QA_PROTOCOLO_FISICO_PENDENTE_2026-10-09.md`: procedimento físico objetivo de impressão térmica 203 dpi, fotos de celular, seis quantidades 0/1/7/10/23/99, falhas/duplicações e requisito de zero falsas contagens.

## Próxima atividade segura
- Confirmar novamente o SHA da main e resolver divergência do PR sem apagar trabalho concorrente, quando o release estiver autorizado.
- Obter prova física de impressora/celular e de Edge hospedado em staging separado, com hashes e versão exata do código. **Não marcar gates true sem executar de fato os ensaios.**
- Preparar backup/rollback, monitoramento e configuração Vault por ambiente conforme playbook R8. ACI genérico de cestas ainda possui falha independente de `channel_origin`; não alterar pedidos a pretexto de DA6.
- Só após todos os gates e revisão protegida: deploy gradual. Preservar balanço A4, estoque vigente e Bling. A automação horária fica ativa até conclusão efetiva.
