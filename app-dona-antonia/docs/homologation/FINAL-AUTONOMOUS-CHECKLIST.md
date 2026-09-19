# App Dona Antônia — Checklist Autônomo Final

**Rodada:** A9  
**PROGRAMMATIC_COMPLETE=true**  
**Significado:** não resta tarefa segura e independente dentro do plano A1–A9. Isto **não** significa homologação Android/iOS, backend implantado ou produção liberada.

## Auditoria final
- [x] ordem canônica de retomada relida;
- [x] A1–A8 confirmadas como esgotadas nos limites documentados;
- [x] branch confirmada: `app-dona-antonia-r0-isolation`;
- [x] PR #396 confirmado aberto, Draft e não mergeado;
- [x] produção permanece OFF;
- [x] pedidos reais permanecem OFF;
- [x] push real permanece OFF;
- [x] executores externos permanecem OFF;
- [x] Bling/Meta/PapoAI/logística permanecem fora do app;
- [x] política de fixtures/IDs `TEST-*` preservada;
- [x] nenhuma Edge Function apagada para liberar quota;
- [x] nenhum plano/spend cap aumentado;
- [x] nenhuma publicação/submissão em Play Store/App Store/TestFlight;
- [x] Android/iOS continuam explicitamente **não homologados** sem build/teste nativo real;
- [x] ações humanas finais consolidadas em `HUMAN-ACTIONS-FINAL.md`.

## Cobertura programática encerrada
- [x] baseline/reprodutibilidade e gates de isolamento;
- [x] guard central fail-closed;
- [x] sessão/pairing sintéticos;
- [x] deep links e push sintético;
- [x] mídia/privacidade/dados locais em fronteiras sintéticas;
- [x] HML/backend preparado sem deploy;
- [x] integridade/idempotência/rate limit e contratos de bootstrap/catalog/checkout;
- [x] telemetria e privacidade fail-closed;
- [x] UX/acessibilidade/offline/performance auditáveis estaticamente;
- [x] preflights e store/release readiness documentais.

## Bloqueios que não são trabalho autônomo restante
- runner/dependências para evidência real de testes/typecheck;
- SDK/JDK/Gradle/Xcode e builds nativos;
- aparelhos/emuladores e testes de acessibilidade/performance reais;
- Keychain/Keystore, FCM/APNs, links nativos, permissões/pickers e EXIF efetivo;
- quota/credenciais/deploy HML;
- consoles, assinatura, metadata final, TestFlight/stores;
- sincronização/merge do PR, especialmente porque a branch divergiu de `main` durante trabalho paralelo.

## Regra de encerramento
A9 encerra o escopo autônomo. Não criar A10, não inventar novo escopo e não converter bloqueios humanos/nativos/operacionais em sucesso fictício. A continuidade só ocorre para executar ações humanas acima ou mediante novo escopo explícito.
