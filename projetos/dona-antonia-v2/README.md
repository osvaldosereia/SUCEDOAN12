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
Arquivo de origem: DONA_ANTONIA_BLING_802_PRODUTOS_INDEPENDENTES_7_CATEGORIAS.csv, gerado nesta conversa.
Copie o CSV para uma pasta local, sem adicioná-lo ao site público. Execute:
npm run import:bling -- /caminho/arquivo.csv

A importação valida as 59 colunas, SKUs, categorias, valores e GTINs e gera:
- public/catalog.generated.json: somente dados não sigilosos de vitrine, sem custos e sem informações fiscais.
- data/catalog.admin.json: prévia interna com custo/NCM/CEST (arquivo ignorado pelo Git).

Produtos com Situação = Inativo ou estoque zerado NÃO ficam vendáveis. O importador nunca ativa cadastros automaticamente.

## Entregas pendentes antes de produção
Autenticação/admin com RBAC, APIs seguras, banco dedicado, validações de estoque no servidor, sincronização OAuth Bling, persistência de cestas/pedidos, separação, expedição, recuperação de checkout, observabilidade e testes ponta a ponta.
A existência de protótipo no GitHub não implica que estas funcionalidades estejam concluídas.

## Segurança
Não publicar, não vincular domínio, não adicionar workflows de deployment e não executar SQL no projeto atual até aprovação de homologação.
