# Customer OS — UX Canary v1

Atualizado em 18/09/2026.

Status: **CANARY PUBLICADO — ATIVAÇÃO GLOBAL DESLIGADA**.

## Decisão de UX

A evolução visual foi priorizada no desktop porque o Admin é operado e homologado principalmente nessa superfície, sem deixar o celular para uma fase separada.

A experiência segura continua disponível somente pelo canary enquanto `customerOsSecureUiEnabled=false`.

## Diretório de clientes

A listagem deixou de ser uma tabela técnica e passou a funcionar como diretório operacional.

Cada cliente mostra:

- iniciais;
- nome;
- WhatsApp;
- valor acumulado;
- quantidade de pedidos;
- última compra;
- status;
- ação principal Abrir perfil;
- Editar;
- WhatsApp.

Busca e Segment Engine continuam no topo.

O diagnóstico de identidade foi condensado em uma faixa operacional com:

- identidades vinculadas;
- cobertura;
- verificadas;
- conflitos pendentes.

## Customer 360 desktop

Em telas acima de 980 px o perfil funciona como um workspace:

- cabeçalho do cliente;
- status operacionais;
- KPIs;
- navegação lateral;
- conteúdo em área própria com rolagem.

Navegação:

- Resumo;
- Compras;
- Preferências;
- Conversas;
- Proteção;
- Linha do tempo.

Isso substitui a experiência anterior de modal longo com todas as seções empilhadas.

## Cabeçalho

Exibe rapidamente:

- cliente;
- telefone;
- ciclo de vida;
- ativo/inativo;
- marketing liberado/bloqueado;
- WhatsApp;
- edição.

## Mobile

Até 680 px:

- perfil ocupa a tela;
- navegação volta a ser horizontal;
- cards passam para uma coluna;
- ações principais ficam persistentes no rodapé;
- WhatsApp recebe destaque;
- edição permanece acessível.

## Proteção

O redesign não altera guardrails.

Continuam válidos:

- consentimento canônico;
- suppression;
- cooldown;
- pedido em andamento;
- atendimento humano;
- atividade recente;
- status/identidade do cliente.

Nenhuma mudança visual libera envio de marketing.

## Segurança do canary

O canary:

- exige sessão protegida por PIN;
- usa a API segura do Customer OS;
- mantém sessão somente na aba;
- não muda a flag global;
- não ativa campanhas nem publicação.

## Critério para ativação global

Somente considerar `customerOsSecureUiEnabled=true` após:

1. homologação visual do diretório;
2. homologação do Customer 360;
3. teste desktop;
4. teste mobile;
5. Customer Protection conferido;
6. CI verde;
7. publicação validada.

## Próxima evolução

Depois da homologação visual, a próxima camada é tornar o resumo mais operacional/comercial sem usar IA para fatos:

- oportunidades de recompra;
- marcas/categorias com afinidade;
- janela de recompra;
- risco de contato;
- motivo de bloqueio;
- sugestões comerciais baseadas no Product/Brand Graph.

IA deverá ser usada somente onde adicionar criatividade ou raciocínio que não possa ser resolvido por regra/dados.
