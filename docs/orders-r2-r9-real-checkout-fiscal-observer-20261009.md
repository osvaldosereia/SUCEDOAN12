# R02–R09 — Checkout real → Meta → separação → Bling → observação fiscal

**Data:** 09/10/2026 · **Projeto:** Dona Antônia · [Plano de programação #964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964) · base de desenvolvimento [R02–R08 #1014](https://github.com/osvaldosereia/SUCEDOAN12/pull/1014).

## Objetivo da rodada

Reaproveitar o laboratório conjunto da R02–R08 (que executa o checkout real, numeração semanal R03, gate Meta simulado R04–R05, separação/correção de faltas R06, intent remoto R07 e preflight R08) para exercitar **as RPCs ORIGINAIS da R09 com os mesmos pedidos de checkout**, sem criar outro emissor fiscal.

O script SQL e o avaliador puro são importados **do commit R09 original `786a58141a99b54e8da60917e87f86e0d8810465`**, com `actions/checkout` de SHA fixo; o verificador fiscal R08 vem do commit `88503c966296f9ed84e8334ed46b837dfbe1e9d2`. Nenhum código das integrações Bling ou SEFAZ foi reimplementado.

## Implementação publicada nesta branch

- `scripts/sql/orders-r2-r9-observer-chain-fixture.sql`: vínculos Bling **fictícios** no mesmo banco PostgreSQL 17, criados **somente para R07 verificada** e usando o UUID originário do checkout R02. O pedido R07 `uncertain` não recebe vínculo inventado.
- `scripts/sql/orders-r2-r9-genuine-observer-preclaim.sql`: somente pedido `verified` com conclusão física e manifesto R06 intacto pode entrar na fila privada R09. Pedido R07 incerto é rejeitado; reentrada não duplica registro. Verifica execução somente com `service_role`.
- `scripts/sql/orders-r2-r9-genuine-observer-postclaim.sql`: valida um único claim; token aleatório de outro worker e comprovante falso são rejeitados. Comprovante de GET **fictício** com hash e ID R07 correto é persistido. Nova tentativa após `observed_no_invoice` não autoriza uma segunda escrita fiscal.
- `scripts/test-orders-r2-r9-genuine-observer.mjs`: usa os verdadeiros recibos R02/R06/R07 persistidos no PostgreSQL, passa uma resposta **simulada** do Bling ao avaliador puro R09 e testa produto errado, quantidade divergente, valor, número externo, zero/uma/múltiplas notas, link de NF-e e documento inacessível. A prova R09 registrada no banco passa apenas o gate de GET da R08; **continua `ready=false` sem perfis NCM/CEST/CFOP/CST/CSOSN e conjunto tributário MT ativo**. A prova expirada ou com hash adulterado é rejeitada.
- Workflow `.github/workflows/orders-r2-r7-bling-chain-ci.yml`: estende o antigo pipeline único para R09. Dois `psql` concorrentes reivindicam o mesmo pedido R07 verificado; somente um obtém o token. Todos os transportes reais estão OFF.

## Critérios de aceite desta rodada

1. Pedido original de cesta: R$160 → R$140, alimento separado R$50, outras despesas R$90, higiene faltante R$20, número público inalterado.
2. Pedido molde: R$105 → R$75, R07 `uncertain`, sem fila de GET/R09; nenhum retry de POST.
3. R09 sobre o pedido de cesta aprovado exige a chave `VITRINE-{uuid}` e o hash R07 e compara item efetivamente separado.
4. A fila não gera NF-e nem libera expedição; R08 exige classificação fiscal externa autêntica antes de autorizar emissão.
5. Nenhum serviço externo Bling, WhatsApp, Meta, SEFAZ ou Supabase canônico foi consultado pela CI.

## Limites e pendências

- O comprovante remoto `bling_get` é **deliberadamente fictício** no runner: não foi executada integração HTTP real ao Bling.
- Os modelos de Meta, regras tributárias reais, permissões RLS completas, estoque espelhado do Bling e provas SEFAZ seguem pendentes de homologação de staging.
- O SQL R09 continua draft, não migration; feature flags OFF. Não há merge em main, deploy, cron extra, NF-e real, pedido, alteração de estoque ou mensagem para cliente.
- **Próximo:** inserir a R10 original no laboratório conjunto, com simulação SEFAZ XML + gate físico de expedição, **sem liberar geração fiscal**, cuja autorização tributária R08 não está integrada.

Este checkpoint deve ser interpretado como **teste integrado offline**, jamais comprovação de funcionamento em produção.
