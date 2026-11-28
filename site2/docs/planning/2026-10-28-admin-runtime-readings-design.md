# Leituras autenticadas do painel e das configurações

## Intenção

Fazer o dashboard, o resumo das integrações e a lista de números/Flows mostrarem o estado atual depois do operador entrar no Admin publicado em `/site2`. Hoje essas páginas chamam Supabase em Server Components; no GitHub Pages elas são compiladas sem sessão e os avisos de consulta indisponível ficam congelados no HTML.

## Objetivos

- Consultar pedidos, fotos de cestas, canais, ANA, Bling e prontidão Meta no navegador, após a sessão Auth estar disponível.
- Preservar os componentes e a linguagem visual existentes; mostrar estado de carregamento enquanto as leituras autenticadas respondem.
- Manter toda autorização nos gateways/RPCs Supabase existentes e usar somente a chave publishable no navegador.
- Preservar as ações já explícitas do painel Flow. Abrir a tela pode fazer apenas as leituras já previstas; não publicar Flow, não enviar WhatsApp e não escrever no Bling.

## Fora de escopo

- Nenhuma migration, nova Edge Function ou mudança de callback Meta.
- Nenhuma alteração de credenciais, tokens, secrets, canais, dados de clientes, pedidos, estoque ou Bling.
- Nenhuma emissão fiscal ou publicação de Flow.
- Nenhum teste automatizado; as verificações ficam limitadas a tipos, lint focalizado, build estático e inspeção do artefato.

## Abordagens consideradas

1. **Manter a leitura no servidor e servir páginas vazias no Pages:** não funciona com o export estático, pois cada página continuaria mostrando o estado de build.
2. **Hospedar o Next.js em um servidor pago:** exigiria provedor/infra adicional e desviaria da publicação já escolhida pelo proprietário.
3. **Carregar dados no navegador com sessão Supabase:** preserva GitHub Pages, usa os gateways/RPCs já existentes e atualiza o estado após login. Esta é a decisão adotada pelo agente, de acordo com a autorização prévia do proprietário para decidir os passos técnicos.

## Comportamento escolhido

- O dashboard busca seus quatro resumos depois da montagem do cliente e substitui os placeholders quando concluído; falhas permanecem visíveis como indisponibilidade, sem inventar zero.
- Configurações busca canais, estado da ANA e resumo somente leitura do Bling. Para cada canal, a função de prontidão existente consulta a Graph API somente por GET e devolve campos permitidos; não envia mensagens.
- A tela de Flows busca os dois canais com a sessão Auth e só então monta os painéis existentes, que continuam usando a Edge Function `admin-whatsapp-flow-setup-v1` para ações explícitas.
- Todas as URLs internas continuam respeitando o `basePath=/site2`; a autorização final permanece no Supabase. O middleware Next não existe no Pages estático, portanto não é tratado como controle de autorização.

## Arquivos envolvidos

- `src/lib/supabase/integration-types.ts`: contratos compartilhados de leitura de integração.
- `src/lib/supabase/browser-admin-integrations.ts`: chamadas de status usando a sessão do cliente.
- `src/lib/supabase/admin-integrations.ts`: reutiliza os contratos compartilhados no adaptador server existente.
- `src/app/(admin)/page.tsx`: lê o dashboard no navegador.
- `src/app/(admin)/configuracoes/page.tsx`: lê as integrações no navegador.
- `src/app/(admin)/configuracoes/fluxos/page.tsx`: carrega canais no navegador.

## Verificação

Usar `pnpm typecheck`, Biome nos arquivos alterados, `git diff --check` e build de exportação com `NEXT_OUTPUT_EXPORT=1` e `NEXT_PUBLIC_BASE_PATH=/site2`. Conferir que o HTML inicial não contém os antigos erros congelados e que os assets continuam servidos em `/site2`. Login real, credenciais de funcionário e jornada de pedido continuam como validação operacional separada.
