# Admin WhatsApp — Sucedoan

Painel interno da Dona Antônia para atendimento WhatsApp, cestas, produtos, clientes, pedidos e configurações de ANA/Meta/Supabase/Bling.

## Desenvolvimento local

Requisitos fixados para este checkout: Node.js 24.22.1 e pnpm 11.25.0.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Copie `.env.example` para `.env.local` e use a URL e a chave publicável do Supabase selecionado. Nunca coloque service role, chave secreta ou token nesse arquivo. Sem essas duas variáveis, o login fica desabilitado. A base atual ainda não tem funcionários cadastrados nem policies de staff; o painel mantém as rotas administrativas fechadas até a tarefa de acesso concluir.

Abra `http://localhost:3000`. As telas administrativas não leem nem escrevem em serviços externos antes do login autorizado.

## Verificações focadas

```powershell
pnpm lint
pnpm typecheck
pnpm build
pnpm supabase:start
```

O Supabase local usa Postgres 17 e mantém signup e seeds desligados até as policies de acesso e fixtures sintéticas serem definidas. No Windows, o script omite apenas os serviços auxiliares `logflare` e `vector`, que dependem de expor a API Docker local em TCP; os serviços de dados, Auth, Storage, Edge Functions e Studio continuam disponíveis. Pare a stack com `pnpm supabase:stop`.

## Documentação do projeto

- `docs/planning/pesquisa-e-plano.md` — produto, pesquisa e decisões de arquitetura.
- `docs/planning/caderno-tecnico.md` — contratos, integrações, fluxos e regras detalhadas.
- `docs/planning/plano-execucao.md` — sequência de implementação e gates.
- `docs/planning/implementation-ledger.md` — decisões e progresso desta branch.

As credenciais nunca são registradas em Git. Integrações reais ficam desligadas até os gates documentados serem concluídos.
