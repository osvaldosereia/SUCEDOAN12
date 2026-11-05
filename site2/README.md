# Admin WhatsApp — Sucedoan

O app, as funções/migrations do Supabase e a documentação ficam nesta pasta `site2/` na raiz do repositório GitHub. A publicação desejada é um artefato estático em `/site2/` no GitHub Pages existente; veja a seção de publicação antes de alterar o site.

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

O checkout contém a implementação greenfield e **ainda não está liberado para pedidos reais**. As migrations previstas e os gateways necessários estão aplicados/publicados no Supabase canônico `ssbesxgaijknwsjbsbcz`. O proprietário recusou criar staging; ainda faltam configurar e publicar os Flows nos dois números, preencher posições de cesta sem opção elegível, validar fotos no Flow e homologar pedido, webhook e Bling. O painel `/configuracoes/fluxos` cria rascunhos, envia o JSON fixado no projeto e mostra os erros de validação da Meta; não publica Flow nem envia mensagens. Não confundir `pnpm typecheck`/build local com homologação operacional. A sequência de liberação está em `docs/planning/staging-cutover.md`.

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

# Publicação em `donaantonia.com.br/site2`

A publicação desejada é no GitHub Pages já usado pelo domínio, em `https://donaantonia.com.br/site2/`. Não há mudança de DNS nem serviço de hospedagem adicional planejados. O site atual e o Admin legado em `/site/admin/` devem permanecer intactos.

**O código ainda não está pronto para upload no GitHub Pages.** GitHub Pages hospeda arquivos estáticos e não executa SSR, cookies de servidor nem Server Actions. Enviar a pasta-fonte `site2` ou a pasta `.next` não publica uma aplicação funcional. A listagem e a ficha de produto já usam sessão do navegador e as Edge Functions autenticadas; o restante da migração segue em andamento.

Antes de publicar, será necessário gerar uma exportação estática do Next.js e adaptar as telas para usar o cliente Supabase no navegador com a chave publicável e as Edge Functions/RPCs autenticadas já existentes. IDs de telas de detalhe deverão funcionar em rotas estáticas. Nenhuma chave `service_role`, token Meta, token Bling ou outro secret pode entrar no bundle.

Para gerar a exportação quando todas as rotas estiverem migradas, defina `NEXT_OUTPUT_EXPORT=1` e `NEXT_PUBLIC_BASE_PATH=/site2` antes de executar `pnpm build`. A configuração em `next.config.ts` habilita `output: export`, `trailingSlash` e imagens sem otimizador remoto apenas nesse modo. As rotas de detalhe de produtos, cestas, pedidos e vínculos Meta já usam `?id=` e não geram páginas com IDs comerciais. A build agora compila o código, mas para porque o export estático não aceita Server Actions; Atendimento, Ana, Clientes e respostas rápidas ainda precisam ser migrados. Não publique o diretório `out/` até esses bloqueios serem removidos.

Quando a exportação estiver pronta, apenas o conteúdo gerado para `site2/` deverá ser acrescentado à branch publicada pelo GitHub Pages. Não mesclar esta branch inteira sobre `main`: ela também contém código de desenvolvimento e está divergente da branch do site. Consulte `docs/superpowers/plans/2026-10-28-github-pages-static-admin.md` antes da publicação.

## Desenvolvimento local

Para desenvolvimento, execute `pnpm dev` neste diretório. Os comandos usuais `pnpm build` e `pnpm start` continuam disponíveis para execução local com Node.js.
