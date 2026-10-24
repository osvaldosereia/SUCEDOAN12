# Dona Antônia V2 — projeto isolado

Situação: protótipo técnico em branch exclusiva. NÃO é a loja em produção.

Local: projetos/dona-antonia-v2, no repositório SUCEDOAN12.
Nunca copiar arquivos deste diretório para a raiz pública ou executar migração na base atual sem um plano de homologação.
O domínio donaantonia.com.br permanece no código anterior até autorização expressa.

## Decisões de arquitetura
- React + TypeScript + Vite, duas entradas independentes (loja e admin) e domínio compartilhado sem dependência de React.
- Os produtos seguem a planilha Bling: 1 SKU por apresentação/sabor/aroma, com EAN de unidade e DUN/quantidade da caixa.
- Somente UN como unidade de venda. O pacote fechado de fábrica pode ser uma unidade comercial; fardo de transporte não vira SKU novo.
- Categorias fechadas: MERCEARIA BÁSICA, LIMPEZA, LAVANDERIA, HIGIÊNE, BELEZA, UTILIDADES, PET.
- Cinco tamanhos configuráveis de cesta. Cada tamanho contém tipos de produto e quantidades; cada tipo referencia múltiplos SKUs reais.
- Cliente escolhe SKU elegível por tipo, altera quantidade (inclusive 0) e total é calculado em centavos a partir de preços de SKUs.
- Para abertura de cesta, escolha inicial do SKU habilitado mais barato com estoque suficiente. Falta de opção não força venda.
- O Bling é a origem dos códigos, dados fiscais e cadastro; dados operacionais de cestas pertencem ao app. Sincronização futura será assíncrona e idempotente.
- SQL em schema isolado da_next, SEM execução automática. RLS nega acesso até políticas específicas e backend seguro existirem.
- Nunca expor tokens do Bling ou chaves secretas do Supabase no navegador. Integrações e fechamento do pedido exigem backend autenticado e transação de estoque.

## Executar localmente
1. Dentro deste diretório: npm install
2. npm run test && npm run build
3. npm run dev
4. Loja de demonstração: http://localhost:5173/
5. Admin de demonstração: http://localhost:5173/admin/

Enquanto o banco novo não estiver conectado, telas são exclusivamente demonstração em memória, não salvam pedidos nem atualizam o Bling.

## Importar a planilha Bling
O CSV de 802 produtos usado como seed da V2 foi gerado nesta conversa e não tem procedência comprovada como exportação do Bling. Por autorização explícita do usuário, seus 802 produtos foram carregados apenas no Supabase V2 isolado. Eles permanecem inativos e com estoque zero; o saldo de origem em branco foi preservado como desconhecido. Isso não equivale a um export oficial nem confirma estoque atual. Antes de ativar/sincronizar, obtenha um export oficial com data e conta de origem.

Por padrão, o comando abaixo é somente simulação e não grava arquivos nem chama o banco:

```sh
npm run import:bling -- --dry-run /caminho/arquivo.csv
```

O importador valida o cabeçalho Bling de 59 colunas, SKU único, GTIN e dígito verificador, categoria, unidade, preço, custo, NCM/CEST e registra conflitos de GTIN duplicado e custo com precisão maior que centavos. O dry-run identifica as linhas e motivos de rejeição, mais faixas de linhas com conflitos; saldo vazio permanece desconhecido e produtos não vendáveis não são ativados. Para gerar arquivos locais de revisão, use `--write-to /diretorio/privado` em uma pasta fora de `public/`. A projeção pública não contém custo, fornecedor nem campos fiscais; o JSON administrativo contém campos privados e é criado com permissão restrita. O comando continua sem gravar no Supabase; a carga inicial controlada descrita em `docs/STATUS_RODADAS_V2.md` foi executada por processo separado e isolado.

## Login da prévia privada do admin V2
A tela de login está disponível em [Admin V2 (prévia privada)](https://dona-antonia-v2-admin-preview.juniorsereia.chatgpt.site/admin/). Use `juniorsereia@gmail.com`. Como a página de aceite do convite abriu offline e você não criou uma senha, clique em **Esqueci ou ainda não criei minha senha**, solicite o link e defina a senha pela mensagem recebida. A URL de retorno do Auth V2 foi corrigida para esta prévia privada owner-only. O agente não envia o e-mail nem define/acessa a senha.

## Entregas pendentes antes de produção
Autenticação/admin com RBAC, APIs seguras, banco dedicado, validações de estoque no servidor, sincronização OAuth Bling, persistência de cestas/pedidos, separação, expedição, recuperação de checkout, observabilidade e testes ponta a ponta.
A existência de protótipo no GitHub não implica que estas funcionalidades estejam concluídas.

## Segurança
Não publicar alterações em domínio/site legado, não vincular domínio de produção, não alterar `main`/bancos existentes e não executar SQL em projeto operacional. A prévia privada da V2 usa outro Site e outro projeto Supabase.


## Fluxo de tela implementado (prévia)
- Etapa 1: escolher entre 5 cestas, personalizar cada tipo em carrossel de cards verticais compactos; quantidade permanece na linha inferior ao trocar marca.
- Barra fixa exibe valor e Próximo.
- Etapa 2: grupos de extras opcionais e comuns a todas as cestas; início em zero; tocar variação adiciona uma unidade e trocar marca preserva quantidade.
- Barra fixa soma cesta + extras e oferece Finalizar pedido.
- Etapa 3: checkout visual, resumo dos SKUs, formulário demonstrativo e botões para voltar sem perder escolhas. Nenhum envio de pedidos habilitado.
- Admin: aba Produtos extras permite criar grupos, vincular tipos existentes, escolher SKUs, ativar e reordenar, sem gravar no banco.
- Contratos e testes da lógica da segunda etapa: src/core/extras.ts e extras.test.ts.
- Leia docs/UX_TRES_ETAPAS.md. Protótipo testado com Chromium em viewport mobile (390 px) e desktop (1280 px). Integração segura, dados reais e testes com serviços de produção continuam pendentes.

**Importante:** tanto as cinco cestas quanto os grupos extras ainda são configurações de demonstração em memória. Os arquivos SQL não foram aplicados.

## Qualidade e homologação da interface
- `npm run check`: tipagem estrita TypeScript.
- `npm test`: somente testes unitários do núcleo (`src/core`).
- `npm run build`: build estático isolado.
- `npm run e2e`: Chromium / Playwright, para site e admin em desktop e mobile. Esta suíte sobe Vite localmente; **não publica** o site.
- CI: `.github/workflows/dona-antonia-v2-ci.yml`, limitada à branch agent/dona-antonia-nova-plataforma e aos arquivos V2, sem deploy.
- Execução aprovada: https://github.com/osvaldosereia/SUCEDOAN12/actions/runs/40049541464 (10 testes unitários e 4 testes de navegação).
- Capturas são anexadas ao job por sete dias. Não representam um site público no ar.

## Referência de usabilidade do novo admin
A arquitetura visual e a estratégia de seções seguem o estudo em `docs/REFERENCIA_ADMIN_UX.md`: Nuvemshop/Nimbus (estrutura), Shopify (busca e listagens) e Loja Integrada (ação simples). As seções de pedidos, clientes, marketing, relatórios e integrações permanecem desabilitadas até implementação real.

## Design da vitrine pública
O padrão público combina fluxo de supermercado do iFood, visual de temas Shopify e achados de usabilidade do Baymard. Documentação: `docs/REFERENCIA_SITE_PUBLICO_UX.md`. Design, dados e cálculo seguem em módulos independentes; esta vitrine ainda é demonstrativa.
