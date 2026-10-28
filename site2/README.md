# Admin WhatsApp — Sucedoan

O app, as funções/migrations do Supabase e a documentação ficam nesta pasta `site2/` na raiz do repositório GitHub. Para publicar, configure `site2` como diretório raiz do projeto e defina as variáveis necessárias no provedor; nunca versione segredos.

Painel interno da Dona Antônia para atendimento WhatsApp, cestas, produtos, clientes, pedidos e configurações de ANA/Meta/Supabase/Bling.

## Desenvolvimento local

Requisitos fixados para este checkout: Node.js 24.22.1 e pnpm 11.25.0.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Copie `.env.example` para `.env.local`. O backend selecionado é **Dona Antônia (original)**, Supabase `ssbesxgaijknwsjbsbcz`; o arquivo de exemplo já aponta para esse projeto. Nunca coloque service role, chave secreta ou token nesse arquivo. Sem a URL e a chave publicável, o login fica desabilitado. A consulta read-only mais recente encontrou um vínculo ativo `owner` em `admin_users`, associado a uma conta do Supabase Auth. A tabela mantém RLS sem policies de acesso direto ao navegador; o painel valida a sessão e encaminha operações pelo gateway, que verifica novamente o vínculo e o papel. Não foi feita tentativa de login nem redefinição de senha.

Abra `http://localhost:3000`. As telas administrativas não leem nem escrevem em serviços externos antes do login autorizado.

## Estado da liberação

O checkout contém a implementação greenfield e **ainda não está liberado para pedidos reais**. As 7 migrations e 14 Edge Functions estão aplicadas/publicadas no Supabase canônico `ssbesxgaijknwsjbsbcz`. O proprietário recusou criar staging; ainda faltam configurar e publicar os Flows nos dois números, preencher posições de cesta sem opção elegível, validar fotos no Flow e homologar pedido, webhook e Bling. O painel `/configuracoes/fluxos` cria rascunhos, envia o JSON fixado no projeto e mostra os erros de validação da Meta; não publica Flow nem envia mensagens. Não confundir `pnpm typecheck`/build local com homologação operacional. A sequência de liberação está em `docs/planning/staging-cutover.md`.

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

# Publicar o Admin sem custo

O código do Admin está neste diretório (`site2`). Para publicá-lo online sem criar um serviço pago, use Cloudflare Workers no plano Free. O Cloudflare conecta diretamente ao GitHub e publica novos commits da branch selecionada. O deploy usa o adaptador OpenNext para manter os recursos de servidor do Next.js.

## Configuração no Cloudflare

1. No painel Cloudflare, abra **Workers & Pages → Create application → GitHub** e autorize o repositório `osvaldosereia/SUCEDOAN12`.
2. Selecione a branch `codex/whatsapp-admin-greenfield-20261026` e defina a raiz do projeto como `site2`.
3. Use o nome `sucedoan12-admin`, o comando de build `pnpm run build:cloudflare` e o comando de deploy `pnpm run deploy:cloudflare`.
4. Em **Build variables and secrets**, configure `NEXT_PUBLIC_SUPABASE_URL=https://ssbesxgaijknwsjbsbcz.supabase.co` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` usando o valor publicável do projeto original. O Next.js embute esses valores públicos no Worker durante a build. A chave publicável não é uma chave administrativa. Não coloque valores de secrets no GitHub, no `wrangler.jsonc` ou neste README.
5. Selecione ou mantenha o plano **Workers Free**. O Worker usa o subdomínio gratuito `workers.dev`; o painel fornecerá o endereço depois que o primeiro deploy concluir.

O arquivo `wrangler.jsonc` mantém emissão fiscal e recuperação avançada do Bling desligadas. O site usa as funções e secrets já configurados no Supabase; não copie tokens da Meta ou do Bling para o Cloudflare.

O plano Free tem limites: até 100.000 requisições Worker por dia, 10 ms de CPU por chamada e 3.000 minutos mensais de build. O serviço pode falhar quando esses limites forem excedidos. Não é necessário ativar um plano pago.

Fontes oficiais: [Next.js no Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/), [Deploys pelo GitHub](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/) e [limites do Free](https://developers.cloudflare.com/workers/platform/pricing/).

## Desenvolvimento local

Para desenvolvimento, execute `pnpm dev` neste diretório. Os comandos usuais `pnpm build` e `pnpm start` continuam disponíveis e não dependem do adaptador Cloudflare.
