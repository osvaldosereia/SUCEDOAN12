# Customer & Marketing OS — Governança de Decisões e Autonomia

Atualizado em 18/09/2026.

Status: **DIRETRIZ APROVADA PELO PROPRIETÁRIO DO PROJETO**.

## 1. Delegação de decisão

Para o subprojeto **Customer & Marketing OS da Dona Antônia**, o proprietário do projeto delega ao assistente a responsabilidade de decidir, organizar e conduzir tecnicamente o que deve ser feito, sem precisar solicitar aprovação a cada decisão rotineira.

O assistente está autorizado a decidir, entre outros pontos:

- arquitetura;
- ordem de implementação;
- modelagem de dados;
- reaproveitamento ou refatoração de estruturas existentes;
- criação de migrations;
- convenções de eventos;
- APIs internas;
- adapters;
- organização do Admin;
- critérios de segmentação;
- estrutura de Customer 360;
- estrutura de Product/Brand Graph;
- regras do Marketing Brain;
- jornadas;
- action registry;
- observabilidade;
- testes;
- documentação;
- feature flags;
- rollout técnico;
- critérios de rollback;
- escolha de modelos OpenAI;
- níveis de reasoning;
- estratégia de batch/cache;
- otimização de custo;
- priorização de tarefas;
- ajustes de UX;
- refactors necessários para manter a arquitetura final coerente.

## 2. Princípio de atuação

A diretriz é:

> **decidir tecnicamente o melhor caminho para alcançar o produto final aprovado, evitando retrabalho, mantendo compatibilidade com a arquitetura de longo prazo e priorizando segurança, custo-benefício, qualidade e autonomia futura.**

O proprietário não precisa entender nem escolher detalhes técnicos para o projeto avançar.

## 3. Quando não interromper para perguntar

Não pedir confirmação para decisões normais de engenharia quando a melhor solução puder ser determinada com segurança a partir do objetivo já aprovado.

Exemplos:

- nome de tabela;
- índice;
- schema;
- estrutura de DTO;
- ordem de migrations;
- escolha entre SQL, Edge Function ou job;
- escolha de modelo de IA dentro da política de custo aprovada;
- reorganização de código;
- criação de testes;
- criação de documentação;
- escolha de padrão de idempotência;
- escolha de mecanismo de fila;
- criação de abstrações/adapters;
- escolha de componentes de interface;
- implementação de flags e gates.

## 4. Limites da delegação

Esta autorização de projeto **não substitui** exigências de segurança, políticas da plataforma ou confirmações obrigatórias impostas por ferramentas/provedores.

Continuam exigindo cuidado especial, confirmação específica quando aplicável ou gates explícitos:

- criação de gasto externo relevante ou novo compromisso financeiro;
- exclusão destrutiva ou irreversível de dados;
- mudança de produção com risco material sem rollback;
- ativação de envio em massa;
- ativação de Meta/WhatsApp real;
- publicação real para clientes quando ainda em homologação;
- alteração de preços, margem ou regras comerciais de alto impacto;
- movimentação financeira;
- mudanças fiscais/legais;
- criação de recursos pagos quando a ferramenta exigir confirmação formal;
- qualquer ação que a Meta, OpenAI, Supabase, GitHub ou outro provedor exija aprovação/consentimento explícito adicional.

Nesses casos, a arquitetura deve continuar sendo preparada normalmente, mas a execução externa deve respeitar os gates e as exigências do provedor.

## 5. Política de IA

O assistente pode escolher autonomamente o modelo OpenAI adequado por tarefa, seguindo a regra já aprovada:

- **SQL/código primeiro** para fatos determinísticos;
- **Luna** para alto volume, classificação, extração e enriquecimento simples;
- **Terra** para estratégia, publicidade, interpretação e raciocínio comercial;
- **Sol** somente quando a complexidade/impacto justificar o custo.

O objetivo é funcionar muito bem sem exagerar no custo.

## 6. Regra de continuidade

Se surgir uma dúvida técnica durante a implementação:

1. consultar arquitetura e documentação oficial;
2. pesquisar documentação atual quando necessário;
3. verificar o que já existe no GitHub/Supabase;
4. escolher a solução mais coerente com o destino final;
5. documentar a decisão;
6. seguir adiante sem bloquear o projeto por detalhe técnico rotineiro.

## 7. Registro

Toda decisão estrutural relevante deve ser registrada no repositório para que o projeto possa ser retomado posteriormente sem depender da memória da conversa.

Documento principal relacionado:

- `docs/CUSTOMER-MARKETING-OS-ARQUITETURA-MESTRE.md`
- `docs/CUSTOMER-MARKETING-OS-ETAPA-CM1.md`
- `docs/CUSTOMER-MARKETING-OS-STATUS.md`

## 8. Próxima ação autorizada

Prosseguir para **CM-0 — Architecture Lock** e, em seguida, iniciar a execução técnica da CM-1 conforme o roadmap, sem solicitar aprovação para cada decisão técnica rotineira.
