# R02–R08 — Pré-validação fiscal encadeada aos pedidos realmente separados

**09/10/2026 · Projeto Dona Antônia · Plano [#964](https://github.com/osvaldosereia/SUCEDOAN12/issues/964)**

## Objetivo e base

Continuação da integração [R02–R07 PR #1007](https://github.com/osvaldosereia/SUCEDOAN12/pull/1007), que já valida em laboratório checkout real, Meta R04/R05 simulada, separação R06 e intenção idempotente Bling R07 com o hash gerado pelo adaptador original.

**Não reescrever a R08, nem criar novo emissor fiscal.** O teste importa o verificador original `evaluateOrderFiscalR8` do commit `88503c966296f9ed84e8334ed46b837dfbe1e9d2`, em um checkout GitHub de fonte fixa e sem credenciais.

## Implementado

- `scripts/test-orders-r2-r8-genuine-fiscal-preflight.mjs`: transforma em avaliação R08 os pedidos **gerados pelo checkout canônico** e os recibos de separação/R07 **persistidos na base PostgreSQL 17 descartável** pela sequência anterior.
- Checkout anterior: cesta com R$160, falta de R$20, total final **R$140**; molde com R$105, falta de R$30, final **R$75**. Cada caso mantém número público imutável.
- A intenção R07 de cesta está `verified` com ID Bling sintético. A do molde está `uncertain`; não pode chegar à emissão por qualquer caminho.
- A R08, **com dados canônicos e sem provas fiscais/GET de Bling**, deve retornar `ready=false` por falta de aprovação tributária, fonte ativa de regra MT e comprovação de leitura remota.
- O teste positivo adiciona **evidências fiscais e de leitura Bling expressamente simuladas**, só na memória do processo de teste, para demonstrar que o motor puro aceita os mesmos produtos/valores físicos quando todas as entradas estão completas; isso **não representa aprovação real** de CFOP, NCM, CEST, regime ou regras IBS/CBS.
- Casos negativos testam NF-e pré-existente, outro ID de venda, alteração retroativa do manifesto R06, resultado R07 incerto, tributação não aprovada, NCM inválido, ST indefinida, CEST aplicável ausente, autorização de expedição desligada, fiscal runtime off, GET Bling vencido e job em execução.
- O workflow já existente `orders-r2-r7-bling-chain-ci.yml` foi ampliado diretamente (sem duplicar os cinco estágios de checkout/separação), e também dispara nesta branch R02–R08.

## Limites e pendências

- Não se invocam Bling, Meta, SEFAZ, transportes HTTP ou pagamentos verdadeiros. Números de Bling, regras fiscais e autorizações são **exclusivamente fictícios**.
- O verificador R08 já existe em PR draft [#978](https://github.com/osvaldosereia/SUCEDOAN12/pull/978). Aqui ele é integrado no cenário real do laboratório, **sem aplicar seu SQL e sem criar um segundo componente**.
- A intenção `verified` R07 no laboratório não é uma resposta GET real do Bling; essa prova será fornecida após homologar R09. Jamais liberar geração de NF-e com apenas a flag `verified`.
- A R08 de produção continua propositalmente **fail-closed**, pois a classificação fiscal de saída não está aprovada. R09 observador e R10 verificador XML/SEFAZ devem ser integrados depois, sem permitir POST fiscal antes dos gates.
- O projeto completo ainda requer Meta templates oficiais 0975/1018, integração de branches R02/R03/R04/R05/R06/R07, RLS e migrations canônicas, homologação, logística e rollout controlado.

**Sem merge em main, deploy, alteração de banco de produção, emissão fiscal, estoque, contato com cliente ou agendamento de worker.**
