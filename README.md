# Admin WhatsApp — Sucedoan

Painel interno da Dona Antônia para atendimento WhatsApp, cestas, produtos, clientes, pedidos e configurações de ANA/Meta/Supabase/Bling.

## Desenvolvimento local

Requisitos fixados para este checkout: Node.js 24.22.1 e pnpm 11.25.0.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Abra `http://localhost:3000`. As telas atuais são a estrutura visual inicial e não leem nem escrevem em serviços externos.

## Verificações focadas

```powershell
pnpm lint
pnpm typecheck
pnpm build
```

## Documentação do projeto

- `docs/planning/pesquisa-e-plano.md` — produto, pesquisa e decisões de arquitetura.
- `docs/planning/caderno-tecnico.md` — contratos, integrações, fluxos e regras detalhadas.
- `docs/planning/plano-execucao.md` — sequência de implementação e gates.
- `docs/planning/implementation-ledger.md` — decisões e progresso desta branch.

As credenciais nunca são registradas em Git. Integrações reais ficam desligadas até os gates documentados serem concluídos.
