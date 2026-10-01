# Dona Antônia — Marketing Inteligente Site/Admin ↔ PapoAI

Data: 2026-09-30

## 1. Objetivo

Criar uma camada de inteligência comercial para a Dona Antônia que use o site e o banco de dados para produzir sinais comerciais confiáveis e use o PapoAI como camada nativa de atendimento, CRM, etiquetas, Kanban, respostas rápidas, templates, follow-up e campanhas.

O objetivo não é transformar o PapoAI em ERP nem criar uma integração externa frágil. O pedido, estoque, preço, cadastro e cliente continuam canônicos no sistema Dona Antônia/Supabase. O PapoAI recebe sinais textuais determinísticos através da própria mensagem enviada pelo cliente ao WhatsApp e os utiliza para automações nativas.

A solução deve funcionar com mínima participação humana e permitir campanhas para cestas, categorias de produtos, interesses comerciais, marcas selecionadas e ações sazonais.

## 2. Decisões de negócio confirmadas

1. A mensagem do pedido no WhatsApp deve continuar mostrando a lista completa de produtos para conferência do cliente.
2. Quando o pedido contém uma cesta, os componentes da cesta continuam aparecendo na mensagem.
3. Componentes automáticos da cesta NÃO geram interesse de marca nem interesse de categoria para marketing.
4. Segmentação de marketing usa apenas:
   - cesta comprada como sinal `CESTAS`;
   - produtos avulsos escolhidos diretamente pelo cliente;
   - interesses inferidos da conversa pelo PapoAI, quando o recurso nativo for confiável;
   - consentimento explícito de marketing.
5. Marca só vira sinal/etiqueta quando:
   - o produto foi comprado avulso;
   - a marca está numa allowlist de marcas comercialmente relevantes;
   - a marca possui potencial real de campanha.
6. Não criar inferências pessoais como `MULHER`, `HOMEM`, `MÃE`, `PAI`, `TEM_FILHO`. Usar interesses comerciais como `INT_BEBE`, `INT_CABELOS`, `INT_BELEZA`.
7. O PapoAI não cria pedidos nem altera pedidos existentes.
8. Um CTA pós-pedido pode abrir um novo pedido no site. O pedido anterior permanece inalterado.
9. Marketing em massa deve ser centralizado preferencialmente no canal 0975. O 1018 continua como canal normal de atendimento e pode usar CTAs dentro da conversa.
10. Não usar Make ou n8n.

## 3. Fontes de verdade

| Domínio | Fonte de verdade |
|---|---|
| Produto, preço, estoque, oferta | Supabase/Dona Antônia |
| Pedido e itens | Supabase/Dona Antônia |
| Cadastro do cliente | Supabase/Dona Antônia |
| Consentimento de marketing | Supabase/Dona Antônia; refletido no PapoAI por sinal textual |
| Conversa e execução de automações | PapoAI |
| Tags/CRM/Kanban do WhatsApp | PapoAI |
| Segmentação determinística de compra | Site/backend Dona Antônia |
| Segmentação conversacional | PapoAI, apenas quando recurso nativo for comprovado |

## 4. Arquitetura

### 4.1 Site público

Responsabilidades novas:

- preservar a origem comercial do canal (`0975` ou `1018`) separadamente do telefone do cliente;
- aceitar deep links de marketing por oferta, categoria, marca e campanha;
- registrar contexto de entrada durante a sessão;
- manter lista completa do pedido no WhatsApp;
- calcular sinais de marketing somente com produtos avulsos;
- calcular no máximo um CTA pós-pedido;
- incluir os sinais como linhas textuais padronizadas após a parte humana da mensagem;
- enviar o pedido para o mesmo número/canal de origem quando houver `origem`; usar 0975 como padrão quando não houver origem conhecida.

### 4.2 Backend/Supabase

Responsabilidades:

- manter pedido canônico sem depender do PapoAI;
- disponibilizar produto, categoria, subcategoria, marca, oferta e estoque para cálculo dos sinais;
- preservar contexto de campanha/origem no snapshot do checkout ou estrutura existente equivalente;
- oferecer leitura agregada para o Radar de Marketing no Admin;
- não disparar campanhas diretamente no PapoAI na V1.

### 4.3 PapoAI

Responsabilidades:

- receber mensagem completa do pedido;
- detectar linhas padronizadas;
- aplicar etiquetas;
- mover CRM/Kanban quando comprovadamente seguro;
- enviar respostas rápidas/CTAs;
- operar templates/campanhas/follow-up usando recursos nativos;
- respeitar opt-out;
- nunca inferir afinidade de marca a partir da lista completa de produtos.

### 4.4 Vitrine/Admin

Adicionar `Marketing` ao grupo `Comercial`.

A tela inicial de Marketing terá quatro abas:

1. **Oportunidades** — radar determinístico de campanhas.
2. **Segmentação** — categorias e marcas autorizadas para sinais.
3. **Links/Campanhas** — construtor de deep links rastreáveis.
4. **Configuração** — prioridades de CTA e regras simples.

Não criar um segundo CRM no Admin. O CRM conversacional fica no PapoAI.

## 5. Mensagem do pedido para WhatsApp

A parte humana permanece completa.

Exemplo:

```text
PEDIDO DONA ANTONIA
Pedido: "30 de setembro de 2026"
NUMERO: 12345678
CLIENTE: CADASTRADO
NOME: ...
WHATSAPP: ...
ENDERECO: ...
BAIRRO: ...
CIDADE: ...
ENTREGA: ...

CESTA: 1x Grande Bonini

PRODUTOS:
1x Bucha de Lavar Louça
4x Suco em Pó Uva Frisco 18 g
...
1x Shampoo Elseve ...
1x Fralda ...

TOTAL: R$ ...
PAGAMENTO: PIX

INTERESSES_MKT: BEBE | CABELOS
MARCAS_MKT: ELSEVE
OFERTAS_WHATSAPP: SIM
CTA_POS_PEDIDO: BEBE
CAMPANHA_ORIGEM: setembro_bebe_01
```

Regras:

- `PRODUTOS:` continua contendo cesta + avulsos para conferência.
- `INTERESSES_MKT` usa apenas produtos avulsos, mais `CESTAS` quando existir uma cesta.
- `MARCAS_MKT` usa apenas produtos avulsos e marcas autorizadas.
- `OFERTAS_WHATSAPP` reflete o consentimento atual do cliente.
- `CTA_POS_PEDIDO` contém um único valor ou `NENHUM`.
- `CAMPANHA_ORIGEM` só aparece quando houver contexto de campanha válido.

## 6. Separação entre itens de cesta e itens avulsos

A estrutura de carrinho já diferencia `item.type === 'product'` de `item.type === 'basket'` e possui `components` para cestas.

A regra de geração de sinais será:

```text
produto avulso -> pode gerar categoria, subcategoria e marca
cesta -> gera somente INT_CESTAS
componente da cesta -> nunca gera categoria/marca de marketing
```

A lista completa do pedido continuará percorrendo os componentes da cesta, mas o algoritmo de sinais não percorrerá esses componentes.

## 7. Taxonomia de interesses

Sinais permitidos na V1:

- `CESTAS`
- `BEBE`
- `CABELOS`
- `BELEZA`
- `HIGIENE`
- `LIMPEZA`
- `LAVANDERIA`
- `PET`
- `CASA`
- `DOCES_LANCHES`

A taxonomia do banco já contém categorias suficientes para mapear esses grupos de forma determinística.

Mapeamentos iniciais:

- `Bebê/*` -> `BEBE`
- `Cabelos/*` -> `CABELOS`
- `Beleza e Cuidados/*` -> `BELEZA`
- `Higiene Pessoal/*` -> `HIGIENE`
- `Limpeza/*` -> `LIMPEZA`
- `Lavanderia/*` -> `LAVANDERIA`
- `Pets/*` -> `PET`
- `Casa e Utilidades/*` -> `CASA`
- doces, chocolates, biscoitos, salgadinhos, bebidas e categorias equivalentes -> `DOCES_LANCHES`

Mercearia genérica não gera `INT_MERCEARIA` automaticamente.

## 8. Marcas relevantes

A V1 não possui regra hard-coded para todas as marcas.

O Admin mantém uma allowlist editável. O sistema só emite `MARCAS_MKT` para marcas presentes nessa allowlist.

Sugestões iniciais para avaliação:

- NIVEA
- ELSEVE
- SEDA
- MONANGE
- LOLA
- SKALA
- DOVE
- OMO
- YPÊ
- DOWNY

A allowlist deverá permitir ativar/desativar sem alterar código.

Critério: marca com variedade/estoque/oportunidade real de campanha. Produtos de cesta nunca contam para a marca.

## 9. Consentimento de marketing

O checkout atual já possui `marketing_opt_in`, mas o controle aparece somente dentro do formulário de cadastro. Clientes com cadastro completo normalmente não veem esse controle.

A V1 deve exibir uma preferência compacta de marketing para todos os clientes no checkout, inclusive cadastrados:

> Quero receber ofertas, promoções e recomendações de produtos da Dona Antônia pelo WhatsApp.

Regras:

- desmarcado por padrão para quem nunca consentiu;
- estado atual carregado do cadastro;
- alteração salva explicitamente;
- `OFERTAS_WHATSAPP: SIM` apenas quando o valor atual for verdadeiro;
- `CTA_POS_PEDIDO` promocional somente quando houver consentimento verdadeiro;
- opt-out posterior no PapoAI continua soberano para campanhas nativas do PapoAI.

## 10. CTA pós-pedido

Emitir no máximo um CTA.

Elegibilidade:

1. `marketing_opt_in = true`;
2. existe interesse derivado de produto avulso ou cesta;
3. não existe condição de bloqueio local conhecida.

Prioridade configurável no Admin.

Prioridade inicial sugerida:

1. BEBE
2. PET
3. CABELOS
4. BELEZA
5. LAVANDERIA
6. LIMPEZA
7. DOCES_LANCHES
8. OFERTAS, quando houver cesta e nenhuma categoria avulsa forte

Quando nenhum CTA for adequado: `CTA_POS_PEDIDO: NENHUM`.

A V1 não usa IA para escolher o CTA. A escolha é determinística e auditável.

## 11. Deep links

O site deverá reconhecer parâmetros separados do telefone do cliente:

- `origem=0975|1018`
- `ofertas=1`
- `categoria=<slug>`
- `marca=<slug>`
- `campanha=<slug>`

Exemplos:

```text
/?origem=0975&ofertas=1
/?origem=0975&categoria=bebe&campanha=bebe_out26
/?origem=0975&categoria=cabelos
/?origem=0975&marca=nivea&campanha=nivea_01
```

Comportamento:

- `origem` define o número de retorno do checkout;
- `ofertas` abre a visão de ofertas;
- `categoria` abre/filtra a categoria correspondente;
- `marca` filtra produtos ativos daquela marca;
- `campanha` é preservada na sessão e enviada no pedido/snapshot;
- parâmetros inválidos são ignorados com fallback para home;
- nenhum parâmetro altera preço, estoque ou autorização de venda.

## 12. Rastreamento de campanha

Na V1, o contexto de campanha será armazenado no fluxo do pedido usando estrutura existente de snapshot/metadados, evitando schema novo se possível.

Dados mínimos:

- `marketing_origin_channel`
- `marketing_campaign_slug`
- `marketing_entry_category`
- `marketing_entry_brand`
- `marketing_entry_offers`
- timestamp da entrada

Isso permitirá posteriormente medir campanha -> pedido sem depender do PapoAI.

## 13. Radar de Marketing no Admin

A V1 NÃO terá job de IA diário obrigatório.

O Radar será calculado de forma determinística ao abrir/atualizar a tela, usando:

- estoque ativo;
- produtos em oferta;
- desconto efetivo;
- validade quando aplicável;
- categoria/subcategoria;
- marca;
- histórico de pedidos avulsos;
- quantidade de compradores por segmento/marca;
- allowlist de marcas de campanha.

O Radar gera cards como:

```text
Lavanderia
7 produtos em oferta
bom estoque
base histórica relevante
marcas: Downy / Ypê / OMO
Ação sugerida: campanha de lavanderia
```

O Radar não envia mensagem.

A IA poderá ser adicionada depois somente para redigir copy a partir de dados já calculados. Nenhuma IA decide estoque, desconto ou elegibilidade.

## 14. Tela Marketing no Admin

### Oportunidades

Cards ordenados por oportunidade:

- segmento;
- quantidade de produtos ativos;
- ofertas ativas;
- estoque total;
- compradores históricos;
- marcas relevantes;
- CTA sugerido;
- botão `Criar link`;
- botão `Copiar briefing para campanha`.

### Segmentação

- lista de interesses suportados;
- marcas relevantes com toggle ativo/inativo;
- quantidade de produtos ativos por marca;
- estoque;
- compradores históricos avulsos;
- observação de campanha.

### Links/Campanhas

Construtor:

- canal 0975/1018;
- ofertas/categoria/marca;
- slug de campanha;
- prévia do URL;
- copiar link.

### Configuração

- prioridade de CTA;
- marcas autorizadas;
- ativar/desativar sinais por interesse.

## 15. PapoAI: contrato provisório

O site emitirá os seguintes nomes de sinais, sujeitos apenas a ajuste de nomenclatura após o relatório final do Work:

```text
INTERESSES_MKT:
MARCAS_MKT:
OFERTAS_WHATSAPP:
CTA_POS_PEDIDO:
CAMPANHA_ORIGEM:
```

O código deve centralizar esses nomes em constantes para permitir troca rápida sem alterar a lógica.

O site não dependerá da confirmação do PapoAI para registrar pedido.

## 16. Relação com CRM/Kanban

O documento `PAPOAI-SITE-ONLY-HANDOFF-2026-09-30.md` dizia para não usar CRM/Kanban operacional. Esta especificação supersede essa decisão apenas no âmbito de relacionamento/comercial.

CRM/Kanban do PapoAI pode organizar:

- interesse/catálogo;
- pedido enviado;
- atendimento humano.

Ele NÃO se torna fonte de verdade do pedido, estoque, separação, entrega ou fiscal.

## 17. Segurança e privacidade

- não gerar atributos pessoais sensíveis ou inferências familiares/gênero;
- não emitir marketing sem opt-in registrado;
- não expor dados internos adicionais na mensagem além dos sinais comerciais explícitos;
- não permitir que deep links alterem regras de negócio;
- não expor service role no frontend;
- qualquer nova tabela futura deve ter RLS adequada se estiver em schema exposto.

## 18. Testes necessários

### Site

1. pedido só com cesta -> lista completa + `INT_CESTAS`, sem marcas dos componentes;
2. cesta + Elseve avulso -> lista completa + `CABELOS` + `ELSEVE` se marca autorizada;
3. cesta com OMO dentro -> não gera `OMO`;
4. OMO avulso -> gera `OMO` se autorizado;
5. cliente sem opt-in -> `OFERTAS_WHATSAPP: NAO` e `CTA_POS_PEDIDO: NENHUM`;
6. cliente com opt-in -> CTA adequado;
7. `origem=1018` -> checkout abre 1018;
8. entrada sem origem -> fallback 0975;
9. `categoria`, `marca`, `ofertas` e `campanha` persistem durante a sessão;
10. campanha aparece no snapshot/pedido sem alterar total.

### Admin

1. Marketing aparece em Comercial no desktop e mobile;
2. Radar não inclui produto inativo/sem estoque;
3. marcas desativadas não geram oportunidade de marca;
4. histórico conta somente itens avulsos quando medir afinidade de marca;
5. construtor de links gera URL válida;
6. nenhuma ação da tela envia campanha automaticamente.

## 19. Fora do escopo desta V1

- disparo direto Supabase -> PapoAI;
- criação automática de campanha no PapoAI por API não documentada;
- cron diário obrigatório;
- perfil demográfico;
- recomendação individual por modelo de IA;
- dezenas de campanhas por marca;
- alteração automática de pedido existente após CTA;
- CRM duplicado no Admin.

## 20. Ordem de implementação

1. estabilizar origem 0975/1018 no site;
2. implementar deep links e persistência de campanha;
3. separar cálculo de sinais dos itens visíveis do pedido;
4. manter lista completa e anexar sinais padronizados;
5. corrigir opt-in para clientes já cadastrados;
6. persistir contexto de campanha no pedido/snapshot;
7. criar módulo Marketing no Admin;
8. implementar allowlist de marcas e prioridades;
9. implementar Radar determinístico;
10. após relatório do Work, alinhar nomes finais dos sinais e ativar as automações PapoAI dependentes deles.

## 21. Critério de conclusão

A V1 estará concluída quando:

- a mensagem do WhatsApp continuar completa;
- cesta não contaminar segmentação de marca/categoria;
- produtos avulsos produzirem sinais corretos;
- opt-in puder ser controlado por qualquer cliente no checkout;
- deep links abrirem ofertas/categoria/marca e preservarem campanha/origem;
- checkout voltar ao canal de origem;
- contexto de campanha for rastreável no pedido;
- Admin mostrar oportunidades e marcas configuráveis;
- nenhuma campanha for enviada automaticamente pelo novo módulo;
- os sinais finais estiverem compatíveis com o que o Work comprovar no PapoAI.
