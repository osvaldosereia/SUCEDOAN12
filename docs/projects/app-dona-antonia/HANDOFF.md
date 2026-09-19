# App Dona Antônia — HANDOFF

**Branch:** `app-dona-antonia-r0-isolation`  
**PR:** #396 — Draft — **NÃO MERGEAR**  
**Estado:** OFF / HOMOLOGAÇÃO / ISOLADO / NÃO PUBLICADO

## Ordem de retomada
1. Este arquivo.
2. `app-dona-antonia/docs/homologation/AUTONOMOUS-COMPLETION-PLAN.md`.
3. `app-dona-antonia/PROJECT-STATUS.md`.
4. `docs/projects/APP-DONA-ANTONIA-MASTER.md` quando necessário.

## Estado consolidado
- concluídas: R0–R9 e R20;
- parciais seguras: R12–R19 e R21–R24;
- R10 Android e R11 iOS bloqueadas até toolchain/build nativo real;
- R13: fundação HML endurecida; deploy de Edge Functions bloqueado por quota;
- R25: produção proibida sem autorização explícita;
- plano autônomo: A1, A2 e A3 programaticamente concluídas até o limite não nativo; próxima A4.

## Último avanço seguro — A3
Sessão/identidade/pairing foram endurecidos sem rede real. O pairing sintético já usa challenge `TEST-PAIR-*`, segredo de dispositivo aleatório, código humano, expiração, comparação de segredo sem early return, limites de polling/confirmação e consumo após confirmação. Nesta rodada o boundary foi fechado adicionalmente para impedir emissão de qualquer session token fora de `TEST-SESSION-*` e impedir reconfirmação do mesmo código depois da primeira confirmação bem-sucedida.

Foi adicionada cobertura `pairingSafety.test.ts` para replay após consumo, confirmação humana de uso único, rejeição de session token não sintético antes do consumo e rate limit de tentativas com segredo inválido. Nenhum backend, storage real ou dado de cliente foi conectado.

Proteções acumuladas:
- HML network, push, mídia, secure session e telemetry sink passam pelo boundary fail-closed;
- endpoints HML em allowlist exata;
- push somente `TEST-PUSH-*`;
- mídia somente `TEST-MEDIA-*`, sem upload/rede;
- secure session somente recursos/tokens TEST em homologação;
- pairing somente challenge/session sintéticos, uso único, expiração e rate limits;
- telemetry sink somente `TEST-*` em homologação;
- release readiness exige ambiente HML, suíte de isolamento e typecheck comprovados.

**Validação honesta:** código e testes foram atualizados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. A4 — fechar deep links e notificações: policy HTTPS/allowlist, payloads opacos, roteamento, deduplicação e preparativos nativos sem build real.
2. Depois A5 — mídia, privacidade e dados locais.
3. Manter R13 sem deploy enquanto a quota impedir Edge Functions; não apagar funções nem aumentar plano.
4. Manter R10/R11 sem declaração de homologação até build/teste nativo real; R25 fechado.

## Regras soberanas
- não modificar `comprar/`;
- não mergear PR #396;
- produção/pedidos/push/executores reais OFF;
- sem Bling, Meta, PapoAI ou logística;
- sem dados reais de clientes;
- sem apagar Edge Functions ou aumentar plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste real.
