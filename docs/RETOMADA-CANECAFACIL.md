# CanecaFácil — retomada, arquitetura definitiva e plano de execução

> Documento canônico de continuidade do projeto.
> Atualizado em 2026-09-05.
>
> Este plano **não apaga** os documentos anteriores. Ele consolida e substitui apenas a ordem de execução daqui para frente, incorporando o projeto do **Automatizador Próprio CanecaFácil**.

## 1. Decisão de arquitetura

A arquitetura definitiva passa a ser:

- **GitHub** = código-fonte, versionamento, testes, revisão e deploy;
- **Google Cloud Run** = runtime principal 24/7 sob demanda do automatizador;
- **Firebase Realtime Database** = estado operacional, filas de negócio, vínculos e dados em tempo real;
- **Cloud Tasks** = filas técnicas, retries, backoff, idempotência e processamento assíncrono;
- **Cloud Scheduler** = rotinas por horário;
- **Secret Manager** = credenciais de produção;
- **Terraform** = infraestrutura como código;
- **Workload Identity Federation** = autenticação GitHub → Google Cloud sem chave JSON permanente;
- **GitHub Actions** = CI/CD, testes, deploy, ferramentas administrativas e fallback manual, não servidor principal;
- **Make** = legado de transição. Objetivo final: retirar a dependência operacional do Make.

Princípio: o código deve continuar totalmente editável pelo GitHub/ChatGPT. O Google Cloud executa a aplicação, mas a configuração relevante deve estar descrita no repositório via Terraform e arquivos de configuração versionados.

## 2. Onde a programação está hoje

### 2.1 Núcleo operacional Loja Integrada já funciona sem Make

Já está validado no repositório:

- criar e atualizar produto;
- localizar por SKU/ID;
- preço;
- estoque;
- SEO;
- alias;
- categoria;
- mídia/galeria;
- IDs Firebase ↔ Loja Integrada;
- retries;
- auditoria;
- filas;
- processamento de mídia com Sharp.

Fluxo atual operacional:

`Admin → Firebase → GitHub Actions → Loja Integrada`

Documentos de referência:

- `docs/CANECASFACIL-MAKE-CUTOVER-MAP-V1.md`
- `docs/CANECASFACIL-MAKE-SLIM-V16.md`
- `admin-canecas/README.md`

### 2.2 Mídia já passou por E2E sem Make

Fluxo validado:

`Admin → Firebase midia_fila → GitHub Actions → Sharp → canecas-media → Firebase → Loja Integrada`

A arte mestre horizontal permanece intacta. A derivada para a Loja Integrada é 1200×1200, WebP, fundo branco, contain, sem corte/distorção.

### 2.3 Make ainda contém o núcleo de IA

O V16 SLIM manteve:

- gerar/editar arte OpenAI;
- mockup 1 OpenAI;
- mockup 2 OpenAI;
- análise/catalogação visual OpenAI;
- personalização pública OpenAI;
- handoffs imediatamente ligados aos binários;
- Resend temporariamente.

Isto passa a ser **estado de transição**, não arquitetura alvo.

### 2.4 Pedidos personalizados já têm worker próprio, mas o elo CF-ID é a etapa crítica

Existe `scripts/sincronizar-pedidos-personalizados-li.mjs`, que:

- lê pedidos da Loja Integrada;
- tenta relacionar criação por CF-ID, hint e fallback de e-mail/produto;
- grava `canecas/pedidos`;
- reconhece pagamento;
- vincula arte aprovada;
- prepara/libera produção;
- trabalha com `canecas/print_jobs`.

A pendência crítica anotada continua válida:

**garantir que o CF-ID acompanhe o item/pedido da Loja Integrada de forma verificável e determinística, evitando associação probabilística/manual.**

Até isso estar comprovado E2E, o fluxo de produção personalizada não deve ser considerado fechado.

### 2.5 Segurança pendente

Blueprints antigos continham PAT GitHub literal. O V16 foi sanitizado, mas qualquer credencial antiga ainda ativa deve ser revogada/rotacionada.

O repositório é público. Portanto:

- zero credenciais no código;
- zero `.env` de produção versionado;
- secrets no Secret Manager/GitHub Secrets apenas durante transição;
- revisar arquivos históricos sensíveis antes do projeto Cloud definitivo.

## 3. Nova arquitetura do Automatizador Próprio

Criar no mesmo repositório:

```text
automator/
  src/
    api/
    core/
    flows/
    workers/
    connectors/
      firebase/
      openai/
      loja-integrada/
      bling/
      whatsapp/
      resend/
    observability/
  tests/
  Dockerfile

infrastructure/
  terraform/
    environments/
      staging/
      production/
    modules/
      cloud-run/
      cloud-tasks/
      scheduler/
      secrets/
      iam/

.github/workflows/
  automator-test.yml
  automator-deploy-staging.yml
  automator-deploy-production.yml
```

### 3.1 Regras de engenharia

Todo fluxo deve ter:

1. `correlation_id` único;
2. idempotência;
3. estado explícito (`pendente`, `processando`, `concluido`, `erro`, `cancelado`);
4. retry com limite e backoff;
5. dead-letter/erro permanente;
6. timeout;
7. logs estruturados;
8. auditoria Firebase;
9. possibilidade de reprocessar sem duplicar produto/pedido/arte;
10. contrato de entrada e saída testável.

Não construir um editor visual genérico tipo Make no primeiro momento. Primeiro criar um **motor robusto e observável**. O painel visual vem depois sobre fluxos reais e estáveis.

## 4. Modelo de fluxos

### 4.1 Personalização pública por texto ou áudio

Arquitetura alvo:

`Site/WhatsApp → Cloud Run → transcrição/entendimento → OpenAI → Firebase → aprovação → carrinho Loja Integrada → pedido → produção`

Etapas:

1. cliente escolhe modelo;
2. informa texto ou envia áudio;
3. áudio é armazenado temporariamente e transcrito;
4. IA transforma intenção em briefing estruturado;
5. gerar arte mestre horizontal;
6. validar dimensões e integridade;
7. gerar prévia/mockup;
8. cliente aprova ou pede ajuste;
9. cada versão fica ligada ao mesmo CF-ID;
10. versão aprovada é congelada para produção;
11. CF-ID acompanha deterministicamente o pedido;
12. pagamento confirmado libera `print_job`.

### 4.2 Mockups

Objetivo de custo:

- OpenAI gera aquilo que exige criatividade;
- processamento determinístico gera derivados sempre que possível.

Antes de retirar mockup 1/2 da OpenAI, construir um teste visual A/B com mockup determinístico. Só substituir se a qualidade comercial for equivalente ou superior.

### 4.3 Loja Integrada

Mover gradualmente o worker atual de GitHub Actions para Cloud Run + Cloud Tasks, preservando o mesmo contrato Firebase.

A Loja Integrada continua responsável por:

- catálogo público;
- carrinho;
- checkout;
- cliente;
- pagamento;
- status comercial.

### 4.4 Bling

Regra atual permanece:

- operação fiscal é Dona Antônia;
- pedido comercial vem da Loja Integrada;
- Bling é ERP/fiscal;
- não presumir que cada estampa precisa virar produto fiscal independente;
- SKU fiscal genérico só pode ser usado depois de confirmar o SKU real configurado no Bling.

Novo conector `automator/connectors/bling` deve tratar:

- OAuth/tokens;
- rate limit;
- retries;
- idempotência;
- cliente fiscal;
- pedido fiscal;
- vínculo pedido LI ↔ pedido Bling;
- erros operacionais no painel.

### 4.5 WhatsApp

Criar como conector isolado, nunca misturar lógica de negócio com API do provedor.

Eventos previstos:

- receber texto/áudio;
- confirmar recebimento;
- enviar prévia;
- solicitar aprovação;
- informar status de pedido;
- mensagens administrativas controladas.

Assim será possível trocar provedor de WhatsApp no futuro sem reescrever o motor.

### 4.6 E-mail/Resend

Migrar primeiro, porque é baixo risco. Depois do canário validado no novo motor, remover 115/116 do Make.

## 5. Procedimento de execução — ordem obrigatória

## FASE 0 — congelar arquitetura e segurança

Objetivo: parar de aumentar dívida técnica durante a migração.

1. Este documento vira plano canônico.
2. Não adicionar nova automação operacional ao Make.
3. Não criar novo fluxo de negócio complexo diretamente em GitHub Actions.
4. Rotacionar/revogar credenciais antigas expostas em blueprints.
5. Inventariar secrets atuais e dono de cada credencial.
6. Criar ambiente `staging` separado de `production`.
7. Definir orçamento/alertas do Google Cloud antes do primeiro deploy.

Critério de saída: segurança mínima e arquitetura aprovada.

## FASE 1 — terminar o fluxo comercial que já está em andamento

Objetivo: fechar o caminho cliente → pedido → produção antes de trocar o motor.

1. Revisar como a Loja Integrada permite carregar metadado/observação/atributo verificável no item/pedido.
2. Definir transporte oficial do CF-ID.
3. Remover dependência principal de fallback por e-mail/produto.
4. Criar teste E2E com uma personalização real controlada.
5. Aprovar arte.
6. Adicionar produto original ao carrinho.
7. Fazer pedido controlado.
8. Confirmar CF-ID no pedido recuperado pela API.
9. Confirmar vínculo em `canecas/pedidos`.
10. Simular/confirmar pagamento.
11. Confirmar exatamente um `print_job` por item/unidade esperada.
12. Testar retry sem duplicação.
13. Testar cancelamento.

Critério de saída: pedido pago gera produção correta sem associação manual.

## FASE 2 — fundação Google Cloud/Terraform

Objetivo: criar o novo motor sem desligar nada atual.

1. Criar projeto/ambiente Google Cloud adequado.
2. Habilitar Cloud Run, Cloud Tasks, Scheduler, Secret Manager e APIs necessárias.
3. Criar `infrastructure/terraform`.
4. Configurar Workload Identity Federation GitHub → Google Cloud.
5. Criar service accounts por responsabilidade, com menor privilégio.
6. Criar primeiro serviço Cloud Run `canecafacil-automator-staging`.
7. Criar endpoint `/health`.
8. Criar pipeline GitHub Actions: teste → build → deploy staging.
9. Criar logs estruturados e correlation ID.
10. Criar alertas mínimos.

Critério de saída: alteração feita no GitHub chega ao staging automaticamente, sem chave JSON permanente.

## FASE 3 — núcleo técnico do Automatizador

Objetivo: construir infraestrutura reutilizável antes dos fluxos de negócio.

Implementar:

- executor de fluxo;
- registro de execução;
- idempotency keys;
- task enqueue/claim/finalize;
- retries/backoff;
- tratamento de erro permanente;
- connector Firebase;
- connector HTTP base;
- schema validation;
- secrets injection;
- logs/auditoria;
- testes unitários e integração.

Estrutura Firebase sugerida:

```text
canecas/automator/
  executions/{execution_id}
  flows/{flow_name}
  incidents/{incident_id}
  metrics/{day}
```

Cloud Tasks é a fila técnica. Firebase continua sendo a visão de negócio/operacional.

Critério de saída: fluxo fictício consegue falhar, retry, concluir e ser auditado sem duplicação.

## FASE 4 — primeiro corte: Resend/e-mail

Objetivo: validar produção real com baixo risco.

1. implementar conector Resend no Cloud Run;
2. secret no Secret Manager;
3. criar task `send-email`;
4. envio canário;
5. registrar delivery/erro no Firebase;
6. integrar com fluxo real;
7. observar;
8. desativar módulos Make 115/116.

Critério de saída: Make deixa de ser necessário para e-mail.

## FASE 5 — migrar OpenAI do Make para o Automatizador

Não mover tudo de uma vez.

Ordem recomendada:

1. análise/catalogação visual;
2. interpretação/transcrição do áudio e briefing;
3. personalização pública;
4. geração/edição da arte mestre;
5. mockups, apenas depois da decisão OpenAI versus processamento determinístico.

Para cada função:

1. documentar input/output atual do Make;
2. criar contrato JSON versionado;
3. implementar no Cloud Run;
4. testar shadow, sem impactar cliente;
5. comparar resultado;
6. fazer canário controlado;
7. ativar rota nova;
8. manter rollback temporário;
9. só então remover módulo Make correspondente.

Critério de saída: nenhuma geração crítica depende do Make.

## FASE 6 — migrar workers operacionais GitHub Actions → Cloud Run/Tasks

GitHub Actions funcionou bem para provar o conceito, mas não deve ser o runtime final.

Migrar por grupos:

1. catálogo/consultas;
2. mídia;
3. create/update Loja Integrada;
4. sincronização de pedidos personalizados;
5. rotinas Bling;
6. limpezas agendadas.

Regra de compatibilidade: durante a migração, manter os mesmos nós Firebase e estados sempre que possível para evitar reescrever Admin e operação simultaneamente.

Depois do corte, GitHub Actions fica para:

- testes;
- deploy;
- auditorias manuais;
- scripts de manutenção;
- emergency fallback explícito.

Critério de saída: runtime diário não depende de schedule de Actions.

## FASE 7 — painel “Automações” no Admin

Só começar depois de o motor possuir execuções reais.

Tela deve mostrar:

- fluxo;
- execução;
- origem;
- status;
- etapa atual;
- duração;
- tentativas;
- erro resumido;
- IDs relacionados (CF-ID, pedido LI, pedido Bling, produto, cliente mascarado);
- reprocessar;
- cancelar quando seguro;
- histórico;
- filtros;
- saúde de integrações.

Não expor secrets no Admin.

Criar também painel de custo aproximado:

- OpenAI texto;
- transcrição;
- imagens;
- Cloud Run;
- tarefas;
- estimativa por criação/pedido.

## FASE 8 — WhatsApp como canal nativo

1. escolher/confirmar provedor/API;
2. webhook Cloud Run;
3. validar assinatura/autenticidade;
4. texto;
5. áudio;
6. download temporário seguro;
7. transcrição;
8. associação sessão ↔ CF-ID;
9. envio de prévia;
10. aprovação/revisão;
11. logs/auditoria;
12. políticas de retenção e exclusão de mídia temporária.

Critério de saída: cliente consegue iniciar personalização por WhatsApp sem criar lógica paralela fora do motor.

## FASE 9 — desligamento definitivo do Make

Pré-requisitos:

- IA migrada;
- Resend migrado;
- handoffs migrados;
- canários concluídos;
- observabilidade ativa;
- rollback testado;
- nenhum webhook de produção apontando para Make.

Procedimento:

1. congelar blueprint final como arquivo histórico sanitizado;
2. desligar cenários;
3. observar 7–14 dias;
4. remover credenciais do Make;
5. cancelar/reduzir plano quando seguro;
6. manter documentação histórica apenas para auditoria.

## 6. O que NÃO fazer

- Não reescrever tudo do zero.
- Não desligar Make antes do substituto passar por E2E.
- Não migrar Loja Integrada, IA, Bling, pedidos e WhatsApp na mesma entrega.
- Não usar GitHub Actions como servidor de webhook permanente.
- Não colocar credencial em repo público.
- Não criar produto personalizado temporário por arte na Loja Integrada se o fluxo aprovado usa produto original + CF-ID.
- Não liberar impressão antes de pagamento confirmado.
- Não usar associação de criação por e-mail como regra principal depois que CF-ID determinístico estiver disponível.
- Não permitir retry que crie pedido/produto/print_job duplicado.

## 7. Prioridade imediata de programação

A próxima sessão de desenvolvimento deve começar exatamente por aqui:

**PASSO 1 — fechar CF-ID no pedido da Loja Integrada.**

Checklist imediato:

1. revisar o código atual de carrinho/personalização;
2. revisar o worker `scripts/sincronizar-pedidos-personalizados-li.mjs`;
3. diagnosticar a estrutura real retornada pela Loja Integrada para pedido/item;
4. escolher campo oficial para transportar CF-ID;
5. implementar;
6. adicionar testes;
7. executar canário E2E;
8. só depois iniciar Terraform/Cloud Run.

Razão: não devemos trocar o motor enquanto existe uma incerteza funcional no coração pedido → personalização → produção.

## 8. Resultado final esperado

Arquitetura operacional final:

```text
Site / Admin / WhatsApp
          ↓
   Cloud Run API
          ↓
  Automator Core
   ↙    ↓     ↘
Tasks  Firebase  Scheduler
 ↓       ↓
Workers / estado / auditoria
 ↓
OpenAI · Loja Integrada · Bling · Resend · WhatsApp
 ↓
Pedido pago → Print Job → Caneca Print
```

Ciclo de desenvolvimento:

```text
ChatGPT → GitHub → testes → deploy staging → canário → produção
```

Objetivo de longo prazo:

- Make = zero dependência operacional;
- computador local = zero dependência;
- GitHub = centro de desenvolvimento;
- Google Cloud = runtime definitivo;
- Firebase = estado operacional;
- CanecaFácil = dono do próprio automatizador.
