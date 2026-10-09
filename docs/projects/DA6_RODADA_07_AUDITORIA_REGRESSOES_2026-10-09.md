# DA6 — Rodada 7: auditoria e regressões do Admin (09/10/2026)

## Estado atual
- **Código e merge de desenvolvimento concluídos; checkpoint de CI final pendente** até o run da última alteração ficar verde.
- Branch `agent/gondola-labels-balance-20261009`, PR #987 **draft** e `mergeable=true` (GitHub verificado depois do commit de merge), zero commits atrás da `main` no checkpoint inicial.
- Commit de merge seguro `af57f67e10e53f3e7812af16ca124341711c84a1`: pais [`e3c761be557bc236e639036b7c2a7c37b271c172`, `4683d79c2f0985e4c068544d706b475e9d462c53`], fast-forward na branch com `expected_sha`, nenhum `force`, nenhum push à main.
- CI antes dos últimos testes: [37948939283](https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/37948939283) passou seis jobs. O CI final posterior aos testes de autenticação deve ser conferido novamente.
- **Nenhum deploy Edge/Storage Admin; nenhuma migração DA6 aplicada na produção; estoque e Bling não modificados.**

## Ajustes
1. `inventory-label-photo-tab.js`: troca entre 'Leitor / balanço A4' e 'Etiquetas por foto' passou a guardar o estado `hidden` por elemento com `WeakMap`, restaurando a visibilidade ORIGINAL; ao abrir a nova aba, não destrói inputs, handlers ou painéis previamente ocultos.
2. `inventory-label-photo-api.ts`: após `UPDATE ... WHERE status='uploading'` na confirmação de foto, exige retorno real do CAS. Em corrida de confirmação, relê status e só responde `queued=true` quando outro worker já confirmou/processou; caso contrário devolve 409, sem falso sucesso.
3. `tests/da6-admin-a4-regressions.test.cjs`: Chrome mobile 390 px, impressão A4 e leitura das planilhas preservadas, estados ocultos intactos, botão A4 acionável depois da navegação, cinco recursos DA6 no Admin em ordem e sem repetição; DA6 não chama estoque, notas ou Bling.
4. `supabase/functions/admin-products-live-v1/index.ts`: reconciliação de `main` com sete mudanças isoladas DA6 (imports, allowlists, gôndola 1–9999, criação de gôndola, worker auth, APIs de fotos) sobre o arquivo inteiro recente da `main`. **Prova reversível em JavaScript**: ao retirar exatamente as sete alterações, a string recuperava byte a byte o conteúdo recente da `main` normalizado; mantém orçamento/quote para Bling, CNPJ, clientes, pedidos etc.
5. Merge Git real na branch: montou árvore Git baseada no `HEAD` de DA6, acrescentando os quatro blobs originais da `main` em `orcamento/app-original.html`, `scripts/test-bling-order-item-code-idempotence.mjs`, `admin-service-intelligence-v1/index.ts`, `20261009133000_sales_quote_bling_conversion_v1.sql`. Criação de commit com **dois pais**, alteração de ref com verificação SHA e sem force. GitHub confirmou PR mergeable e `behind_by=0`.
6. `tests/da6-main-integration-gate.test.cjs`: guardas contra regressões das rotas WhatsApp, pedidos, A4, compras, orçamento convertido e consulta CNPJ após o merge.
7. `tests/da6-local-supabase-e2e.test.ts`: adicionadas negativas reais contra operador que consulta lote/histórico alheios, sem autenticação, perfil viewer criando lote, além do impedimento de leitura anônima direta. Depende do CI final.
8. Workflow DA6: testes passaram a observar alterações no `admin-products-live-v1/index.ts`; gateway central usa verificação **sintática TypeScript** por `ts.createSourceFile`. `deno check` completo detectou 19 erros de tipagem preexistentes em funções não-DA6 do monólito; o CI não faz mudanças invasivas para silenciá-los. Os módulos DA6 independentes continuam com `deno check`. Configurada `concurrency` para cancelar execuções supersedidas e poupar runners.
9. Inspeção do workflow independente `Admin and Baskets Guard`, em branch concorrente `agent/xml-catalog-main-integration-r23-20261009`, apontou assertiva `channel_origin` ausente na página de pedidos A4; **não foi alterada nesta rodada** porque pertence a outras alterações concorrentes.

## Gates para declarar R7 concluída
- [x] Branch com mudanças recentes da main integradas e PR mergeable.
- [x] Código DA6 isolado das rotas de estoque e fiscal.
- [x] Regressão A4 e UI mobile com teste no Chrome.
- [x] CI seis jobs verde antes da última bateria de autorização.
- [ ] Confirmar o CI mais recente **posterior aos testes de autorização e concorrência do workflow**: seis jobs SUCCESS, nenhum erro.
- [ ] A release física/hospedada continua bloqueada por ausência de impressora térmica 203 dpi, fotos reais e Edge/pg_net de staging hospedado, conforme Rodada 6.

## Próximo plano após fechar R7
- R8 planejar release **sem publicar automaticamente** enquanto faltar homologação física/hospedada. Congelar artefatos e calcular checksums; backup e rollback com SQL/Edge, inventário de segredos Vault, playbook gradual com smoke de UI/A4/Admin e proibição absoluta de aplicar balanços históricos ao estoque.
- Não enviar pedidos/NF-e ao Bling; não habilitar alteração automática de estoque.
- Somente desligar tarefa horária quando houver publicação real e gates concluídos.
