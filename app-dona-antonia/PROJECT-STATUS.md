# App Dona Antônia — Status do Projeto

**Estado operacional:** OFF / ISOLADO / NÃO PUBLICADO  
**Uso por clientes:** PROIBIDO  
**Integração com Comprar atual:** DESATIVADA  
**Integrações externas reais:** DESATIVADAS  
**Pedidos reais:** PROIBIDOS  
**Push para clientes reais:** PROIBIDO

## Regra de isolamento

Todo desenvolvimento do novo aplicativo ocorre dentro de `app-dona-antonia/`.

Até a homologação integral:

- não modificar `comprar/`;
- não publicar rota pública do app;
- não registrar service worker no escopo do Comprar;
- não conectar gatilhos a pedidos reais;
- não enviar mensagens/push reais;
- não escrever em clientes, pedidos, estoque ou logística de produção;
- não acionar Bling, Meta, PapoAI ou outros executores externos;
- usar somente fixtures, mocks e ambiente de homologação;
- toda flag e integração nasce OFF.

## Gate para implantação

A ativação só poderá acontecer depois de:

1. aplicativo inteiro concluído;
2. testes automatizados aprovados;
3. testes reais em Android e iPhone aprovados;
4. validação de segurança e privacidade;
5. comparação funcional com o Comprar atual;
6. plano de rollback pronto;
7. teste controlado de integração;
8. autorização explícita do proprietário para conectar à produção.

## Documento mestre

Ver:
`docs/superpowers/specs/2026-09-18-app-dona-antonia-ios-android-design.md`

## Situação atual

Somente planejamento/documentação. Nenhum código de produção do aplicativo foi ativado.


## Plano oficial de programação

Documento:
`docs/superpowers/plans/2026-09-18-app-dona-antonia-rodadas-implementacao.md`

Total: 27 rodadas numeradas de 0 a 26.

**Próxima rodada permitida:** Rodada 0 — Blindagem e governança.

Nenhuma rodada futura deve ser pulada se isso reduzir o isolamento, a segurança ou antecipar conexão com produção.


## Checkpoint — Rodada 0

**Estado:** CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- guard automático contra referência direta ao `/comprar/`;
- bloqueio de material `service_role`;
- bloqueio das flags de pedido real, push real e executores externos;
- bloqueio explícito dos hosts atuais de produção do Supabase, Bling e Meta no runtime do app;
- configuração padrão de homologação com todos os efeitos reais OFF;
- testes automáticos de isolamento.

Validação executada com Node 22:
- 5 testes;
- 5 aprovados;
- 0 falhas.

**Próxima rodada após autorização:** Rodada 1 — Fundação técnica isolada.

A branch ainda não deve ser integrada à produção.


## Checkpoint — Rodada 1

**Estado:** IMPLEMENTAÇÃO CONCLUÍDA NA BRANCH DE HOMOLOGAÇÃO  
**Branch:** `app-dona-antonia-r0-isolation`

Entregas:
- scaffold próprio em TypeScript;
- configuração Vite isolada;
- entrypoint próprio;
- detecção de runtime `web | pwa | android | ios`;
- bootstrap que identifica visualmente o ambiente como Homologação;
- `noindex,nofollow` no shell;
- nenhum endpoint externo;
- nenhum acesso a Supabase, Meta, PapoAI, Bling ou Comprar atual.

Validações executadas:
- ciclo TDD: testes falharam antes das implementações de runtime/bootstrap;
- 4 testes unitários novos aprovados;
- typecheck local da pasta `src/` aprovado com TypeScript disponível no ambiente;
- checagem sintática TypeScript aprovada;
- JSON de configuração validado;
- tentativa de instalar dependências para executar `vite build` bloqueada exclusivamente por indisponibilidade de DNS do registry npm no ambiente de execução (`EAI_AGAIN`).

A versão declarada do Vite segue a linha 8.3 e requer Node >=22.12; o projeto exige Node >=22.12.

**Importante:** a impossibilidade de baixar dependências neste ambiente foi registrada; não foi tratada como build executado.

**Próxima rodada autorizável:** Rodada 2 — Sistema visual e shell mobile-first.

O projeto permanece OFF e sem qualquer conexão com produção.
